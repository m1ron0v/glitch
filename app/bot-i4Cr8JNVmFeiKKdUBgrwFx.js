// bot-template.js

// Цей файл автоматично генерується для кожного бота
// Токен та команда передаються як змінні середовища або аргументи командного рядка
const TelegramBot = require("node-telegram-bot-api");

const BOT_TOKEN = process.env.BOT_TOKEN;
const STATUS_CHECK_COMMAND = process.env.STATUS_CHECK_COMMAND;
const BOT_INTERNAL_ID = process.env.BOT_INTERNAL_ID; // Для логування

if (!BOT_TOKEN || !STATUS_CHECK_COMMAND || !BOT_INTERNAL_ID) {
  console.error(
    `[${
      BOT_INTERNAL_ID || "Bot"
    }] Error: Missing BOT_TOKEN, STATUS_CHECK_COMMAND, or BOT_INTERNAL_ID in environment variables.`
  );
  process.send &&
    process.send({
      type: "status",
      botId: BOT_INTERNAL_ID,
      status: "error",
      message: "Missing env vars",
    });
  process.exit(1);
}

console.log(
  `[${BOT_INTERNAL_ID}] Initializing with token: ${BOT_TOKEN.substring(
    0,
    10
  )}... and command: ${STATUS_CHECK_COMMAND}`
);
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.onText(new RegExp(`^${STATUS_CHECK_COMMAND}$`, "i"), (msg) => {
  const chatId = msg.chat.id;
  // >>> NEW LOGGING FOR ANALYTICS
  console.log(
    `[${BOT_INTERNAL_ID}] Interaction: Status check from chatId: ${chatId}, user: ${
      msg.from.username || msg.from.id
    }`
  );
  // <<< END NEW LOGGING
  bot.sendMessage(chatId, `[${BOT_INTERNAL_ID}] Bot is active and running!`);
  // console.log(`[${BOT_INTERNAL_ID}] Responded to status check from chat ${chatId}`); // Замінено більш детальним логом вище
});

bot.on("message", (msg) => {
  const chatId = msg.chat.id; // >>> ADDED: Get chatId for logging

  // Уникаємо обробки власної команди статусу тут, якщо вона не через onText
  // Це потрібно, якщо STATUS_CHECK_COMMAND може бути звичайним текстом, а не тільки /командою
  const isStatusCommandByText = new RegExp(
    `^${STATUS_CHECK_COMMAND}$`,
    "i"
  ).test(msg.text);

  // >>> MODIFIED LOGIC FOR ANALYTICS & STATUS COMMAND CHECK
  // Логуємо взаємодію, якщо це не команда статусу, яка вже оброблена bot.onText
  // Або якщо це команда статусу, але вона не розпізналася як команда (напр., текст без /)
  if (msg.text) {
    // Перевіряємо, чи є текст у повідомленні
    if (isStatusCommandByText && msg.text.startsWith("/")) {
      // Це команда статусу, яка буде оброблена `bot.onText`, не логуємо тут повторно і не обробляємо
      return;
    }
    // Логуємо будь-яке інше текстове повідомлення або команду статусу, яка не є командою (без /)
    console.log(
      `[${BOT_INTERNAL_ID}] Interaction: Received message from chatId: ${chatId}, user: ${
        msg.from.username || msg.from.id
      }, text: "${msg.text.substring(0, 50)}"`
    );

    // Якщо це текстова команда статусу (без /), і вона НЕ була оброблена isStatusCommandByText (дуже малоймовірно через логіку вище, але для повноти)
    // Або якщо це текстова команда статусу, але її обробка в onText не відбулася (наприклад, якщо STATUS_CHECK_COMMAND не містить /)
    // По суті, ця умова зараз надлишкова через попередню логіку, але залишаємо для ясності, якщо STATUS_CHECK_COMMAND не є типовою командою
    if (
      msg.text.toString().toLowerCase() ===
        STATUS_CHECK_COMMAND.toLowerCase() &&
      !msg.text.startsWith("/")
    ) {
      // Якщо це команда статусу у вигляді простого тексту, і вона не починається з /,
      // то вона не буде оброблена в onText(new RegExp(`^${STATUS_CHECK_COMMAND}$`... якщо STATUS_CHECK_COMMAND сам по собі не містить ^ і $
      // Для простоти, якщо STATUS_CHECK_COMMAND - це, наприклад, "пінг", а не "/пінг", то цей блок може спрацювати.
      // Однак, вимога, щоб statusCheckCommand був командою, робить це малоймовірним.
      // Якщо ж STATUS_CHECK_COMMAND завжди є /командою, то цей блок не потрібен.
      return;
    }
  } else if (msg.photo) {
    console.log(
      `[${BOT_INTERNAL_ID}] Interaction: Received photo from chatId: ${chatId}, user: ${
        msg.from.username || msg.from.id
      }`
    );
  } else if (msg.document) {
    console.log(
      `[${BOT_INTERNAL_ID}] Interaction: Received document from chatId: ${chatId}, user: ${
        msg.from.username || msg.from.id
      }`
    );
  } else if (msg.sticker) {
    console.log(
      `[${BOT_INTERNAL_ID}] Interaction: Received sticker from chatId: ${chatId}, user: ${
        msg.from.username || msg.from.id
      }`
    );
  } else {
    // Логуємо інші типи повідомлень, якщо потрібно
    console.log(
      `[${BOT_INTERNAL_ID}] Interaction: Received non-text message type from chatId: ${chatId}, user: ${
        msg.from.username || msg.from.id
      }`
    );
  }
  // <<< END MODIFIED LOGIC

  // Можна додати логіку для нерозпізнаних повідомлень, якщо потрібно
  // const knownCommands = [STATUS_CHECK_COMMAND, ...]; // Зберігати список відомих команд
  // if (!knownCommands.some(cmd => new RegExp(`^/${cmd}$`, 'i').test(msg.text))) {
  //    // bot.sendMessage(msg.chat.id, "Невідома команда.");
  // }
});

// <--- ДОДАЙТЕ НОВІ ОБРОБНИКИ КОМАНД ТУТ, ПЕРЕД ЦИМ РЯДКОМ --->

// BOT_COMMAND_HANDLER: /myid
bot.onText(/^\/myid(?:\s+(.*))?$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const argsText = match && match[1] ? match[1].trim() : null;
    console.log(`[i4Cr8JNVmFeiKKdUBgrwFx] Command /myid received with args: '${argsText}' from chat ${chatId}, user: ${msg.from.username || msg.from.id}`);
    try {
        bot.sendMessage(chatId, `Ваш ID: ${msg.from.id}`);
    } catch (e) {
        console.error(`[i4Cr8JNVmFeiKKdUBgrwFx] Error in user-defined action for command /myid:\n`, e);
        if (bot && typeof bot.sendMessage === 'function') {
            bot.sendMessage(chatId, 'Вибачте, під час виконання команди "myid" сталася внутрішня помилка. Повідомте адміністратора.').catch(err => console.error(`[i4Cr8JNVmFeiKKdUBgrwFx] Failed to send error message to chat ${chatId}`, err));
        }
    }
});

// MARKER_FOR_NEW_COMMANDS (Не видаляйте і не змінюйте цей рядок!)
// <--- КІНЕЦЬ МАРКЕРА ДЛЯ НОВИХ КОМАНД --->

bot.on("polling_error", (error) => {
  console.error(
    `[${BOT_INTERNAL_ID}] Polling error: ${error.code} - ${error.message}`
  );
  process.send &&
    process.send({
      type: "status",
      botId: BOT_INTERNAL_ID,
      status: "error",
      message: `Polling error: ${error.code}`,
    });
  // Для деяких помилок (наприклад, 401 Unauthorized) бот може припинити роботу
  if (
    error.response &&
    (error.response.statusCode === 401 || error.response.statusCode === 404)
  ) {
    console.error(
      `[${BOT_INTERNAL_ID}] Critical polling error. Bot will stop.`
    );
    process.exit(1); // Сигналізуємо головному процесу про критичну помилку
  }
});

bot.on("error", (error) => {
  console.error(`[${BOT_INTERNAL_ID}] General error: `, error);
  process.send &&
    process.send({
      type: "status",
      botId: BOT_INTERNAL_ID,
      status: "error",
      message: "General error",
    });
});

// Повідомлення головному процесу про успішний запуск
process.send &&
  process.send({
    type: "status",
    botId: BOT_INTERNAL_ID,
    status: "running",
    message: "Bot started successfully",
  });
console.log(`[${BOT_INTERNAL_ID}] Bot started successfully and polling.`);

process.on("SIGINT", () => {
  console.log(`[${BOT_INTERNAL_ID}] SIGINT received. Shutting down...`);
  bot.stopPolling().then(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log(`[${BOT_INTERNAL_ID}] SIGTERM received. Shutting down...`);
  bot.stopPolling().then(() => {
    process.exit(0);
  });
});
