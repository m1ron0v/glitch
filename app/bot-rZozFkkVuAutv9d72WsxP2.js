// Цей файл автоматично генерується для кожного бота
// Токен та команда передаються як змінні середовища або аргументи командного рядка
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;
const STATUS_CHECK_COMMAND = process.env.STATUS_CHECK_COMMAND;
const BOT_INTERNAL_ID = process.env.BOT_INTERNAL_ID; // Для логування

if (!BOT_TOKEN || !STATUS_CHECK_COMMAND || !BOT_INTERNAL_ID) {
  console.error(`[${BOT_INTERNAL_ID || 'Bot'}] Error: Missing BOT_TOKEN, STATUS_CHECK_COMMAND, or BOT_INTERNAL_ID in environment variables.`);
  process.send && process.send({ type: 'status', botId: BOT_INTERNAL_ID, status: 'error', message: 'Missing env vars' });
  process.exit(1);
}

console.log(`[${BOT_INTERNAL_ID}] Initializing with token: ${BOT_TOKEN.substring(0, 10)}... and command: ${STATUS_CHECK_COMMAND}`);
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.onText(new RegExp(`^${STATUS_CHECK_COMMAND}$`, 'i'), (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `[${BOT_INTERNAL_ID}] Bot is active and running!`);
  console.log(`[${BOT_INTERNAL_ID}] Responded to status check from chat ${chatId}`);
});

bot.on('message', (msg) => {
  // Уникаємо обробки власної команди статусу тут, якщо вона не через onText
  // Це потрібно, якщо STATUS_CHECK_COMMAND може бути звичайним текстом, а не тільки /командою
  const isStatusCommand = new RegExp(`^${STATUS_CHECK_COMMAND}$`, 'i').test(msg.text);
  if (msg.text && msg.text.toString().toLowerCase() === STATUS_CHECK_COMMAND.toLowerCase() && !isStatusCommand) {
    return;
  }
  // Можна додати логіку для нерозпізнаних повідомлень, якщо потрібно
  // const knownCommands = [STATUS_CHECK_COMMAND, ...]; // Зберігати список відомих команд
  // if (!knownCommands.some(cmd => new RegExp(`^/${cmd}$`, 'i').test(msg.text))) {
  //    // bot.sendMessage(msg.chat.id, "Невідома команда.");
  // }
});

// <--- ДОДАЙТЕ НОВІ ОБРОБНИКИ КОМАНД ТУТ, ПЕРЕД ЦИМ РЯДКОМ --->

bot.onText(/^\/job(?:\s+(.*))?$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const argsText = match && match[1] ? match[1].trim() : null;
    console.log(`[rZozFkkVuAutv9d72WsxP2] Command /job received with args: '${argsText}' from chat ${chatId}`);
    try {
        bot.sendMessage(chatId, `Ваш ID: ${msg.from.id}`);
    } catch (e) {
        console.error(`[rZozFkkVuAutv9d72WsxP2] Error in user-defined action for command /job:\n`, e);
        if (bot && typeof bot.sendMessage === 'function') {
            bot.sendMessage(chatId, 'Вибачте, під час виконання команди "job" сталася внутрішня помилка.').catch(err => console.error(`[rZozFkkVuAutv9d72WsxP2] Failed to send error message to chat ${chatId}`, err));
        }
    }
});




// BOT_COMMAND_HANDLER: /hi
bot.onText(/^\/hi(?:\s+(.*))?$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const argsText = match && match[1] ? match[1].trim() : null;
    console.log(`[rZozFkkVuAutv9d72WsxP2] Command /hi received with args: '${argsText}' from chat ${chatId}, user: ${msg.from.username || msg.from.id}`);
    try {
        bot.sendMessage(chatId, `Ваш ID: ${msg.from.id}`);
    } catch (e) {
        console.error(`[rZozFkkVuAutv9d72WsxP2] Error in user-defined action for command /hi:\n`, e);
        if (bot && typeof bot.sendMessage === 'function') {
            bot.sendMessage(chatId, 'Вибачте, під час виконання команди "hi" сталася внутрішня помилка. Повідомте адміністратора.').catch(err => console.error(`[rZozFkkVuAutv9d72WsxP2] Failed to send error message to chat ${chatId}`, err));
        }
    }
});

// MARKER_FOR_NEW_COMMANDS (Не видаляйте і не змінюйте цей рядок!)
// <--- КІНЕЦЬ МАРКЕРА ДЛЯ НОВИХ КОМАНД --->

bot.on('polling_error', (error) => {
  console.error(`[${BOT_INTERNAL_ID}] Polling error: ${error.code} - ${error.message}`);
  process.send && process.send({ type: 'status', botId: BOT_INTERNAL_ID, status: 'error', message: `Polling error: ${error.code}` });
  // Для деяких помилок (наприклад, 401 Unauthorized) бот може припинити роботу
  if (error.response && (error.response.statusCode === 401 || error.response.statusCode === 404)) {
    console.error(`[${BOT_INTERNAL_ID}] Critical polling error. Bot will stop.`);
    process.exit(1); // Сигналізуємо головному процесу про критичну помилку
  }
});

bot.on('error', (error) => {
  console.error(`[${BOT_INTERNAL_ID}] General error: `, error);
  process.send && process.send({ type: 'status', botId: BOT_INTERNAL_ID, status: 'error', message: 'General error' });
});

// Повідомлення головному процесу про успішний запуск
process.send && process.send({ type: 'status', botId: BOT_INTERNAL_ID, status: 'running', message: 'Bot started successfully' });
console.log(`[${BOT_INTERNAL_ID}] Bot started successfully and polling.`);

process.on('SIGINT', () => {
  console.log(`[${BOT_INTERNAL_ID}] SIGINT received. Shutting down...`);
  bot.stopPolling().then(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log(`[${BOT_INTERNAL_ID}] SIGTERM received. Shutting down...`);
  bot.stopPolling().then(() => {
    process.exit(0);
  });
});