import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { runFarm } from './bot.js'

const bot = new Telegraf(process.env.TELEGARM_BOT_TOKEN)
let started = false;
bot.start(async (ctx) => {
    if (started) {
        ctx.reply('Already started!');
        return;
    }

    ctx.reply('Welcome!');
    await runFarm(ctx);
    started = true;
});

bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))