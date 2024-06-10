import axios from "axios";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration.js";
import relativeTime from "dayjs/plugin/relativeTime.js";
import { readFileSync } from 'fs';
import { formatNumberCompact } from './helpers.js';
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
    });
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
*Last Earned:* ${formatNumberCompact(data?.lastEarn) || 'N/A'}
*Balance Coins:* ${formatNumberCompact(data.balanceCoins)}
*Passive Earnings per ${dayjs.duration(minutes, 'minutes').humanize()}:* ${formatNumberCompact(data[`earnPassivePer${minutes}Minute`])}
*Taps Earnings per ${dayjs.duration(minutes, 'minutes').humanize()}:* ${formatNumberCompact(data[`tapsRecoverPer${minutes}Minute`])}
*Current Boost Level:* ${data?.boost?.level || 0}
*Cipher Claimed*: ${data.dailyCipher || 'N/A'}
*Daily Reward Claimed*: ${data.dailyRewardResult ? 'Yes' : 'No'}
*Last Sync Update:* ${data.lastSyncUpdate}
    `;
    return formattedMessage;
}

const getUpgradesForBuy = async (authToken) => {
    return await axios.post("https://api.hamsterkombat.io/clicker/upgrades-for-buy", null, {
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    })
}

const buyUpgrade = async (authToken, upgradeId) => {
    return await axios.post("https://api.hamsterkombat.io/clicker/buy-upgrade", {
        timestamp: Date.now(),
        upgradeId,
    }, {
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    })
}

const buyUpgrades = async (authToken, balance, account) => {
    const { data } = await getUpgradesForBuy(authToken);
    const upgradesForBuy = data.upgradesForBuy || [];

    if (!upgradesForBuy?.length) {
        return [];
    }

    let percentFromBalance = Number(account.auto_buy_cards.percent_from_balance) || 0;

    if (percentFromBalance < 0) {
        percentFromBalance = 0
    } else if (percentFromBalance > 100) {
        percentFromBalance = 100;
    }

    const balanceWithPercentApplied = balance * percentFromBalance / 100;

    const available = upgradesForBuy
        .filter((u) => !u.isExpired && !u.maxLevel && u.isAvailable && !u.cooldownSeconds)
        .filter((u) => u.price <= balanceWithPercentApplied)
        .sort((a, b) => b.profitPerHour - a.profitPerHour);

    const toBuy = [];
    available.forEach((a) => {
        const currentPendingToBuyTotalPrice = toBuy.reduce((acc, u) => acc + u.price, 0);
        // Add card only if all cards price + current card less than balance
        if (currentPendingToBuyTotalPrice + a.price <= balanceWithPercentApplied) {
            toBuy.push(a);
        }
    });

    for (const upgrade of toBuy) {
        console.log(`Buying upgrade ${upgrade.section} -> ${upgrade.name} for account: ${account.name}`)
        await buyUpgrade(authToken, upgrade.id);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds before next call
    }

    const currentProfit = upgradesForBuy.reduce((acc, u) => acc + u.currentProfitPerHour, 0)
    const totalPriceToBuy = toBuy.reduce((acc, u) => acc + u.price, 0)
    const totalProfitDelta = toBuy.reduce((acc, u) => acc + u.profitPerHourDelta, 0);

    console.log({
        currentProfit: formatNumberCompact(currentProfit),
        totalPriceToBuy: formatNumberCompact(totalPriceToBuy),
        totalProfitDelta: formatNumberCompact(totalProfitDelta),
        nextProfitPerHout: formatNumberCompact(currentProfit + totalProfitDelta),
    });

    return toBuy;
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

    if (account.auto_buy_cards?.enabled) {
        const cardsBought = await buyUpgrades(authToken, data.balanceCoins, account);

        if (!cardsBought.length) {
            await tgBot.telegram.sendMessage(
                chatId,
                `No cards to buy for account: *${account.name}*`,
                { parse_mode: 'Markdown' },
            );
        } else {
            const message = cardsBought.reduce(
                (acc, c) => '' === acc ? `*${c.section} -> ${c.name}*` : `${acc}\n*${c.section} -> ${c.name}*`,
                '',
            );

            await tgBot.telegram.sendMessage(
                chatId,
                `Cards bought for ${account.name}:\n${message}`,
                { parse_mode: 'Markdown' },
            );
        }
    }
};
