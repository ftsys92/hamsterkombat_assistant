import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { runFarm } from './bot.js'

const bot = new Telegraf(process.env.TELEGARM_BOT_TOKEN);
const minutes = process.env.FARM_INTERVAL_MINUTES;

let started = false;
bot.start(async (ctx) => {
    if (started) {
        ctx.reply('Already started!');
        return;
    }

    ctx.reply('Welcome!');

    await runFarm(ctx);

    setInterval(async () => {
        try {
            await runFarm(ctx);
        } catch (e) {
            console.error(e)
        }
    }, minutes * 60 * 1000);

    started = true;
});

bot.launch()
bot.catch((error) => {
    console.log(error)
})
// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))