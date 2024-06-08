import axios from "axios";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration.js";
import relativeTime from "dayjs/plugin/relativeTime.js";

dayjs.extend(duration);
dayjs.extend(relativeTime)

import { configDotenv } from "dotenv";
configDotenv({ path: '.env' });

const initDataRaw = process.env.HAMSTER_BOT_INIT_DATA_RAW;
const minutes = process.env.FARM_INTERVAL_MINUTES;

let authToken = '';
let authAttempts = 0;

const auth = async () => {
    if (authAttempts > 3) {
        process.exit(401);
    }

    authAttempts++;

    try {
        const body = {
            initDataRaw,
        }
        const response = await axios.post('https://api.hamsterkombat.io/auth/auth-by-telegram-webapp', {
            ...body
        });

        authToken = response.data.authToken;
    } catch (error) {
        console.log('AUTH ERROR', error?.response);
        process.exit(error?.response?.status || 401);
    }
}

const tap = async (count, availableCount) => {
    try {
        if (availableCount > count) {
            count = availableCount;
        }

        const timestamp = Date.now();
        const response = await axios.post('https://api.hamsterkombat.io/clicker/tap', {
            "count": count,
            "availableTaps": availableCount,
            "timestamp": timestamp
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`
            }
        });

        const { balanceCoins, availableTaps, lastPassiveEarn, earnPassivePerSec, boosts, lastSyncUpdate, tapsRecoverPerSec } = response.data.clickerUser;

        return {
            balanceCoins,
            lastPassiveEarn,
            availableTaps,
            [`tapsRecoverPer${minutes}Minute`]: tapsRecoverPerSec * minutes * 60,
            [`earnPassivePer${minutes}Minute`]: earnPassivePerSec * minutes * 60,
            lastSyncUpdate: dayjs.unix(lastSyncUpdate).format('MM/DD/YYYY HH:mm'),
            boost: boosts.BoostFullAvailableTaps,
        };
    } catch (error) {
        console.log(error?.response?.data || error?.response?.status);
        process.exit(error?.response?.status || 401);
    }
}

const sync = async () => {
    try {
        const response = await axios.post('https://api.hamsterkombat.io/clicker/sync', null, {
            headers: {
                Authorization: `Bearer ${authToken}`
            }
        });

        const { balanceCoins, availableTaps, lastPassiveEarn, earnPassivePerSec, boosts, lastSyncUpdate, tapsRecoverPerSec } = response.data.clickerUser;

        return {
            balanceCoins,
            lastPassiveEarn,
            availableTaps,
            [`tapsRecoverPer${minutes}Minute`]: tapsRecoverPerSec * minutes * 60,
            [`earnPassivePer${minutes}Minute`]: earnPassivePerSec * minutes * 60,
            lastSyncUpdate: dayjs.unix(lastSyncUpdate).format('MM/DD/YYYY HH:mm'),
            boost: boosts.BoostFullAvailableTaps,
        };
    } catch (error) {
        console.log('SYNC ERROR');
        console.error(error?.response?.status)
    }
}

const boostsForBuy = async () => {
    try {
        const response = await axios.post('https://api.hamsterkombat.io/clicker/boosts-for-buy', null, {
            headers: {
                Authorization: `Bearer ${authToken}`
            }
        });

        const { boostsForBuy } = response.data

        return boostsForBuy.find((boost) => boost.id === 'BoostFullAvailableTaps');
    } catch (error) {
        console.log('BOOSTSFORBUY ERROR');
        console.error(error?.response?.status || 'BOOSTSFORBUY ERROR')
    }
}

const buyBust = async (ctx) => {
    try {
        await axios.post('https://api.hamsterkombat.io/clicker/buy-boost', {
            "boostId": "BoostFullAvailableTaps",
            "timestamp": Date.now(),
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`
            }
        });
        ctx.sendMessage('Boost bought');
    } catch (error) {
        console.log('BUYBUST ERROR');
        console.error(error?.message || error?.response?.status || 'BUYBUST ERROR')
    }
}

const checkDailyReward = async (ctx) => {
    try {
        const response = await axios.post('https://api.hamsterkombat.io/clicker/list-tasks', null, {
            headers: {
                Authorization: `Bearer ${authToken}`
            }
        });

        const { tasks } = response.data
        const streakDays = tasks.find((t) => t.id === 'streak_days');

        if (false === streakDays?.isCompleted) {
            await claimDailyReward(ctx);

            ctx.sendMessage('Daily Reward is claimed');
        }
    } catch (error) {
        const message = `Daily Reward ERROR: ${error?.message || error?.response?.status || 'N/A'}`
        console.error(message);
        ctx.sendMessage(message);
    }
}

const claimDailyReward = async (ctx) => {
    try {
        await axios.post('https://api.hamsterkombat.io/clicker/check-task', {
            "taskId": "streak_days"
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`
            }
        });
    } catch (error) {
        const message = `Daily Reward ERROR: ${error?.message || error?.response?.status || 'N/A'}`
        console.error(message);
        ctx.sendMessage(message);
    }
}

const getConfig = async () => {
    return await axios.post("https://api.hamsterkombat.io/clicker/config", null, {
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    })
}

const decodeCipher = (cipher) => {
    const t = `${cipher.slice(0, 3)}${cipher.slice(4)}`;
    return atob(t)
}

let morseIsClaimed = false;
const claimMorse = async (ctx) => {
    const { data } = await getConfig();
    morseIsClaimed = !!data?.dailyCipher?.isClaimed;

    if (morseIsClaimed || !data?.dailyCipher || !data?.dailyCipher?.cipher) {
        ctx.sendMessage('Daily cipher already claimed or feature is not available.');
        return;
    }

    const cipherDecoded = decodeCipher(data.dailyCipher.cipher);

    await axios.post("https://api.hamsterkombat.io/clicker/claim-daily-cipher", {
        cipher: cipherDecoded
    }, {
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    });

    ctx.sendMessage(`Daily cipher: "${cipherDecoded}" has been claimed.`);
}

function formatMessage(data) {
    console.log(data);
    const formattedMessage = `
*Last Earned:* ${data?.lastEarn || 'N/A'}
*Balance Coins:* ${data.balanceCoins}
*Last Passive Earn:* ${data.lastPassiveEarn}
*Passive Earnings per ${dayjs.duration(minutes, 'minutes').humanize()}:* ${data[`earnPassivePer${minutes}Minute`]}
*Taps Earnings per ${dayjs.duration(minutes, 'minutes').humanize()}:* ${data[`tapsRecoverPer${minutes}Minute`]}
*Last Sync Update:* ${data.lastSyncUpdate}
*Current Boost Level:* ${data.boost.level}
    `;
    return formattedMessage;
}

export const runFarm = async (ctx) => {
    console.clear();
    console.log(dayjs().format('MM/DD/YYYY HH:mm'));

    await auth();
    ctx.sendMessage('Auth success.')

    let data = await sync();
    let lastBalance = data.balanceCoins;

    let lastEarn = data.balanceCoins - lastBalance;
    lastBalance = data.balanceCoins;

    ctx.sendMessage('Sync success');

    await claimMorse(ctx);
    await checkDailyReward(ctx);

    data = await tap(data[`tapsRecoverPer${minutes}Minute`], data.availableTaps);

    const boost = await boostsForBuy();

    if (boost && boost.cooldownSeconds <= 0 &&
        (
            data.boost.level < boost.maxLevel ||
            (data.boost.level === boost.maxLevel && 1 === boost.level)
        )
    ) {
        await buyBust(ctx);
        data = await tap(data[`tapsRecoverPer${minutes}Minute`], data.availableTaps);
    }

    lastEarn = data.balanceCoins - lastBalance;
    lastBalance = data.balanceCoins;

    ctx.replyWithMarkdown(formatMessage({
        lastEarn,
        ...data
    }));
};