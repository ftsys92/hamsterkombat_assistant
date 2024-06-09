import axios from "axios";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration.js";
import relativeTime from "dayjs/plugin/relativeTime.js";
import { readFileSync } from 'fs';

dayjs.extend(duration);
dayjs.extend(relativeTime);

const config = JSON.parse(readFileSync('./config.json'));
const minutes = config.farm_interval_minutes;

const auth = async (account) => {
    const body = {
        initDataRaw: account.credentials.query,
    }
    const response = await axios.post('https://api.hamsterkombat.io/auth/auth-by-telegram-webapp', {
        ...body
    });

    return response.data.authToken;
}

const tap = async (authToken, count, availableCount) => {
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
}

const sync = async (authToken) => {
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
}

const boostsForBuy = async (authToken) => {
    const response = await axios.post('https://api.hamsterkombat.io/clicker/boosts-for-buy', null, {
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    });

    const { boostsForBuy } = response.data

    return boostsForBuy.find((boost) => boost.id === 'BoostFullAvailableTaps');
}

const buyBust = async (authToken) => {
    await axios.post('https://api.hamsterkombat.io/clicker/buy-boost', {
        "boostId": "BoostFullAvailableTaps",
        "timestamp": Date.now(),
    }, {
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    });
}

const checkDailyReward = async (authToken) => {
    const response = await axios.post('https://api.hamsterkombat.io/clicker/list-tasks', null, {
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    });

    const { tasks } = response.data
    const streakDays = tasks.find((t) => t.id === 'streak_days');

    if (false === streakDays?.isCompleted) {
        await claimDailyReward(authToken);
    }

    return true;
}

const claimDailyReward = async (authToken) => {
    await axios.post('https://api.hamsterkombat.io/clicker/check-task', {
        "taskId": "streak_days"
    }, {
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    });
}

const getConfig = async (authToken) => {
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

const claimMorse = async (authToken) => {
    const { data } = await getConfig(authToken);
    const cipherDecoded = decodeCipher(data.dailyCipher.cipher);

    if (data.dailyCipher.isClaimed) {
        return cipherDecoded;
    }

    await axios.post("https://api.hamsterkombat.io/clicker/claim-daily-cipher", {
        cipher: cipherDecoded
    }, {
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    });

    return cipherDecoded;
}

function formatMessage(data, account) {
    console.log(data);
    const formattedMessage = `
*Account:* ${account.name}
*Last Earned:* ${data?.lastEarn || 'N/A'}
*Balance Coins:* ${data.balanceCoins}
*Passive Earnings per ${dayjs.duration(minutes, 'minutes').humanize()}:* ${data[`earnPassivePer${minutes}Minute`]}
*Taps Earnings per ${dayjs.duration(minutes, 'minutes').humanize()}:* ${data[`tapsRecoverPer${minutes}Minute`]}
*Current Boost Level:* ${data?.boost?.level || 0}
*Cipher Claimed*: ${data.dailyCipher || 'N/A'}
*Daily Reward Claimed*: ${data.dailyRewardResult ? 'Yes' : 'No'}
*Last Sync Update:* ${data.lastSyncUpdate}
    `;
    return formattedMessage;
}

export const runFarm = async (account, chatId, tgBot) => {
    console.clear();
    console.log(dayjs().format('MM/DD/YYYY HH:mm'));

    const authToken = await auth(account);

    let data = await sync(authToken);
    let lastBalance = data.balanceCoins;

    let lastEarn = data.balanceCoins - lastBalance;
    lastBalance = data.balanceCoins;

    // Morse
    const morseResult = await claimMorse(authToken);

    // DailyReward
    const dailyRewardResult = await checkDailyReward(authToken);

    // Taps and boosts
    data = await tap(authToken, data[`tapsRecoverPer${minutes}Minute`], data.availableTaps);

    const boost = await boostsForBuy(authToken);
    if (boost && boost.cooldownSeconds <= 0 &&
        (
            !data?.boost?.level ||
            data.boost.level < boost.maxLevel ||
            (data.boost.level === boost.maxLevel && 1 === boost.level)
        )
    ) {
        await buyBust(authToken);
        data = await tap(authToken, data[`tapsRecoverPer${minutes}Minute`], data.availableTaps);
    }

    lastEarn = data.balanceCoins - lastBalance;
    lastBalance = data.balanceCoins;

    await tgBot.telegram.sendMessage(chatId, formatMessage({
        lastEarn,
        dailyCipher: morseResult,
        dailyRewardResult,
        ...data
    }, account), { parse_mode: 'Markdown' });
};