import { Telegraf } from 'telegraf';
import { runFarm } from './bot.js'
import { readFileSync, writeFileSync } from 'fs';
const config = JSON.parse(readFileSync('./config.json'));

const bot = new Telegraf(config.tg_bot_key);
const minutes = config.farm_interval_minutes;

bot.start(async (ctx) => {
    if (config.chat_id) {
        ctx.reply('Already started!');
        return;
    }

    ctx.reply('Welcome!');

    config.chat_id = ctx.chat.id;

    writeFileSync('./config.json', JSON.stringify(config));
});

const farm = async (account) => {
    try {
        await runFarm(account, config.chat_id, bot);
    } catch (e) {
        const errorMsg = e.message || e?.response?.message || 'Something wrong'
        console.error(`${account.name} failed with error "${errorMsg}"`);

        await bot.telegram.sendMessage(config.chat_id, `${account.name} failed with error "${errorMsg}". Restarting all accounts...`);
        process.exit(1);
    }
}

// For each account run farming.
const run = () => {
    config.accounts.forEach(async (account) => {
        await bot.telegram.sendMessage(config.chat_id, `${account.name} is starting!`);

        await farm(account);

        setInterval(async () => {
            await farm(account);
        }, minutes * 60 * 1000);
    });
}

if (!config.chat_id) {
    console.log('Waiting chat id to start');
    const checkInterval = setInterval(() => {
        console.log('Waiting chat id to start');

        if (config.chat_id) {
            run();
            clearInterval(checkInterval);
        }
    }, 60 * 1000) // Checking every 60 sec if bot is not started on user end.
} else {
    run();
}

bot.launch({ dropPendingUpdates: true }, () => console.log('Bot started'));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
