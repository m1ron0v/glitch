const express = require("express");
const router = express.Router();
const Bot = require("../models/bot");
const fs = require("fs-extra");
const path = require("path");
const { fork } = require("child_process");
const short = require("short-uuid");

const BOTS_DIR = path.join(__dirname, "..", "app");
const LOGS_DIR = path.join(__dirname, "..", "logs");
fs.ensureDirSync(BOTS_DIR);
fs.ensureDirSync(LOGS_DIR);

const runningBotProcesses = {}; // Внутрішня змінна модуля

async function updateBotStatusAndError(
  botInternalId,
  status,
  message = "",
  pinnedErrorMessage = undefined
) {
  // undefined - не змінювати
  try {
    const updateData = { status: status, lastMessage: message };
    if (pinnedErrorMessage !== undefined) {
      updateData.pinnedError = pinnedErrorMessage; // null очистить, рядок встановить
      if (pinnedErrorMessage) {
        // Встановлюємо час, тільки якщо є нова помилка
        updateData.lastPinnedErrorTime = new Date();
      }
    }

    const updatedBot = await Bot.findOneAndUpdate(
      { botId: botInternalId },
      updateData,
      { new: true }
    );

    if (updatedBot) {
      // console.log(`[Manager] Bot ${botInternalId} status updated to ${status}. PinnedError: ${pinnedErrorMessage === null ? 'cleared' : (pinnedErrorMessage || 'unchanged')}.`);
    } else {
      // console.warn(`[Manager] Bot ${botInternalId} not found in DB for status/error update.`);
    }
  } catch (error) {
    console.error(
      `[Manager] Error updating bot ${botInternalId} status/error in DB:`,
      error
    );
  }
}

async function startBotProcess(botData) {
  if (
    !botData ||
    !botData.filePath ||
    !botData.token ||
    !botData.statusCheckCommand ||
    !botData.botId ||
    !botData._id
  ) {
    console.error(
      "[Manager] Invalid botData for starting process:",
      botData ? botData.botId || "Unknown Bot" : "No botData"
    );
    if (botData && botData.botId) {
      await updateBotStatusAndError(
        botData.botId,
        "error",
        "Invalid bot data for start",
        "Некоректні дані для запуску бота."
      );
    }
    return;
  }

  if (
    runningBotProcesses[botData._id.toString()] &&
    runningBotProcesses[botData._id.toString()].connected
  ) {
    console.log(
      `[Manager] Bot ${botData.botId} (${botData._id}) is already considered running or starting. Stopping before restart.`
    );
    await stopBotProcess(botData._id.toString(), botData.botId);
  }

  // Не очищаємо pinnedError тут, бот сам має повідомити про успішний старт
  // Передаємо поточний pinnedError, щоб він не затерся, якщо бот не запуститься
  let existingBotData = await Bot.findOne({ botId: botData.botId });
  await updateBotStatusAndError(
    botData.botId,
    "starting",
    "Process starting",
    existingBotData ? existingBotData.pinnedError : undefined
  );
  console.log(
    `[Manager] Starting bot ${botData.botId} from ${botData.filePath}`
  );

  const botEnv = {
    BOT_TOKEN: botData.token,
    STATUS_CHECK_COMMAND: botData.statusCheckCommand,
    BOT_INTERNAL_ID: botData.botId,
  };
  const absoluteBotFilePath = path.resolve(
    BOTS_DIR,
    path.basename(botData.filePath)
  );

  if (!(await fs.pathExists(absoluteBotFilePath))) {
    const errMsg = `Файл бота ${botData.filePath} не знайдено!`;
    console.error(`[Manager] ${errMsg} Cannot start.`);
    await updateBotStatusAndError(
      botData.botId,
      "error",
      `Bot file not found: ${botData.filePath}`,
      errMsg
    );
    return;
  }

  const logFilePath = path.join(LOGS_DIR, `logs-${botData.botId}.txt`);
  const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

  logStream.write(
    `\n--- Bot process starting: ${new Date().toISOString()} ---\n`
  );

  const child = fork(absoluteBotFilePath, [], {
    stdio: ["pipe", "pipe", "pipe", "ipc"],
    env: { ...process.env, ...botEnv },
  });

  child.stdout.on("data", (data) => {
    const message = data.toString();
    logStream.write(`[OUT] ${message}`);
  });
  child.stderr.on("data", (data) => {
    const message = data.toString();
    logStream.write(`[ERR] ${message}`);
  });

  runningBotProcesses[botData._id.toString()] = child;

  child.on("message", async (msg) => {
    if (msg.type === "status" && msg.botId === botData.botId) {
      let newPinnedError = undefined; // По дефолту не змінюємо
      if (msg.status === "running") {
        newPinnedError = null; // Очистити, бот успішно запустився
        logStream.write(
          `--- Bot successfully started, pinned error (if any) cleared: ${new Date().toISOString()} ---\n`
        );
      } else if (msg.status === "error" && msg.message) {
        newPinnedError = msg.message; // Встановити помилку від бота
        logStream.write(
          `[BOT_REPORTED_ERROR] ${msg.message} at ${new Date().toISOString()}\n`
        );
      }
      await updateBotStatusAndError(
        botData.botId,
        msg.status,
        msg.message,
        newPinnedError
      );

      if (
        (msg.status === "error" || msg.status === "stopped") &&
        runningBotProcesses[botData._id.toString()] === child
      ) {
        delete runningBotProcesses[botData._id.toString()];
      }
    }
  });

  child.on("error", async (err) => {
    const errMsg = `Критична помилка в процесі бота: ${
      err.message || "Невідома помилка форка"
    }`;
    console.error(`[Manager] Error in bot process ${botData.botId}:`, err);
    logStream.write(
      `[CRITICAL_FORK_ERROR] ${errMsg} at ${new Date().toISOString()}\n`
    );
    await updateBotStatusAndError(
      botData.botId,
      "error",
      err.message || "Child process error",
      errMsg
    );
    if (runningBotProcesses[botData._id.toString()] === child) {
      delete runningBotProcesses[botData._id.toString()];
    }
    logStream.end(
      `--- Bot process errored (on 'error' event) and closed stream: ${new Date().toISOString()} ---\n`
    );
  });

  child.on("exit", async (code, signal) => {
    const exitMsg = `Процес бота завершився з кодом ${code} (сигнал: ${
      signal || "N/A"
    })`;
    logStream.write(`[EXIT] ${exitMsg} at ${new Date().toISOString()}\n`);
    console.log(
      `[Manager] Bot process ${botData.botId} exited with code ${code}, signal ${signal}`
    );

    const currentProcess = runningBotProcesses[botData._id.toString()];
    if (currentProcess === child) {
      delete runningBotProcesses[botData._id.toString()];
      // Оновлюємо статус та pinnedError тільки якщо це не була планова зупинка (signal=null)
      // і якщо бот не встиг повідомити про свій статус 'running' або 'error' через IPC
      const botState = await Bot.findOne({ botId: botData.botId }); // Перевіряємо актуальний стан
      if (
        signal === null &&
        botState &&
        botState.status !== "running" &&
        botState.status !== "error"
      ) {
        let pinnedErrMsg = botState.pinnedError; // Зберігаємо існуючу, якщо є
        if (code !== 0) {
          pinnedErrMsg = `Бот несподівано зупинився (код виходу: ${code}). Перевірте логи.`;
          logStream.write(
            `[UNEXPECTED_EXIT_ERROR] ${pinnedErrMsg} at ${new Date().toISOString()}\n`
          );
          await updateBotStatusAndError(
            botData.botId,
            "error",
            `Exited with code ${code}`,
            pinnedErrMsg
          );
        } else {
          // code === 0
          await updateBotStatusAndError(
            botData.botId,
            "stopped",
            `Exited normally (code ${code})`,
            pinnedErrMsg
          );
        }
      } else if (signal) {
        // Зупинено сигналом (можливо, планово)
        await updateBotStatusAndError(
          botData.botId,
          "stopped",
          `Stopped by signal: ${signal}`,
          botState ? botState.pinnedError : undefined
        );
      }
    }
    logStream.end(
      `--- Bot process exited (on 'exit' event) and closed stream: ${new Date().toISOString()} ---\n`
    );
  });
}

async function stopBotProcess(botDbIdString, botInternalIdForLog) {
  const processToKill = runningBotProcesses[botDbIdString];
  if (processToKill && !processToKill.killed) {
    // console.log(`[Manager] Stopping bot process ${botInternalIdForLog}`);
    delete runningBotProcesses[botDbIdString];
    processToKill.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (!processToKill.killed) {
      // console.warn(`[Manager] Bot ${botInternalIdForLog} did not stop with SIGTERM, sending SIGKILL.`);
      processToKill.kill("SIGKILL");
    }
    // Не змінюємо pinnedError при плановій зупинці
    await Bot.findOneAndUpdate(
      { botId: botInternalIdForLog },
      { status: "stopped", lastMessage: "Process stopped by manager" }
    );
  } else {
    const bot = await Bot.findOne({ botId: botInternalIdForLog });
    if (bot && bot.status !== "stopped") {
      await Bot.findOneAndUpdate(
        { botId: botInternalIdForLog },
        {
          status: "stopped",
          lastMessage: "Process not tracked, marked as stopped",
        }
      );
    }
  }
}

router.get("/add", (req, res) => {
  res.render("add-bot", {
    // messages вже є в res.locals з server.js
    // token та statusCheckCommand також будуть з res.locals
  });
});

router.post("/add", async (req, res) => {
  const { token, statusCheckCommand } = req.body;
  if (!token || !statusCheckCommand) {
    req.flash("error", "Токен та команда статусу є обов'язковими.");
    req.flash("formToken", token);
    req.flash("formStatusCommand", statusCheckCommand);
    return res.redirect("/bots/add");
  }

  try {
    const existingBotByToken = await Bot.findOne({ token: token });
    if (existingBotByToken) {
      req.flash("error", "Бот з таким токеном вже існує.");
      req.flash("formToken", token);
      req.flash("formStatusCommand", statusCheckCommand);
      return res.redirect("/bots/add");
    }

    const botId = short.generate();
    const fileName = `bot-${botId}.js`;
    const filePath = path.join("app", fileName);
    const absoluteFilePath = path.join(BOTS_DIR, fileName);

    const templatePath = path.join(__dirname, "..", "bot-template.js");
    if (!(await fs.pathExists(templatePath))) {
      console.error("[Manager] CRITICAL: bot-template.js not found!");
      req.flash("error", "Помилка сервера: шаблон бота не знайдено.");
      return res.redirect("/bots/add");
    }
    await fs.copyFile(templatePath, absoluteFilePath);

    const newBot = new Bot({
      botId: botId,
      token: token,
      statusCheckCommand: statusCheckCommand,
      filePath: filePath,
      status: "stopped",
      pinnedError: null, // Новий бот не має закріплених помилок
    });
    const savedBot = await newBot.save();
    await startBotProcess(savedBot);
    req.flash("success", `Бот ${botId} успішно доданий та запускається!`);
    res.redirect("/");
  } catch (error) {
    /* ... (як раніше, з req.flash для полів) ... */
  }
});

router.post("/restart/:id", async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) {
      req.flash("error", "Бота не знайдено.");
      return res.redirect("/");
    }
    await stopBotProcess(bot._id.toString(), bot.botId);
    await startBotProcess(bot);
    req.flash("success", `Бот ${bot.botId} перезапускається.`);
    res.redirect("/");
  } catch (error) {
    /* ... (як раніше) ... */
  }
});

router.post("/delete/:id", async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) {
      req.flash("error", "Бота не знайдено.");
      return res.redirect("/");
    }
    await stopBotProcess(bot._id.toString(), bot.botId);

    const absoluteBotFilePath = path.join(
      BOTS_DIR,
      path.basename(bot.filePath)
    );
    if (await fs.pathExists(absoluteBotFilePath)) {
      await fs.unlink(absoluteBotFilePath);
    }

    const logFilePath = path.join(LOGS_DIR, `logs-${bot.botId}.txt`);
    if (await fs.pathExists(logFilePath)) {
      await fs.unlink(logFilePath);
      console.log(`[Manager] Deleted log file: ${logFilePath}`);
    }

    await Bot.findByIdAndDelete(req.params.id);
    req.flash("success", `Бот ${bot.botId} та його логи успішно видалені.`);
    res.redirect("/");
  } catch (error) {
    console.error(`[Manager] Error deleting bot ${req.params.id}:`, error);
    req.flash("error", `Помилка при видаленні бота: ${error.message}`);
    res.redirect("/");
  }
});

router.get("/process-status/:dbId", async (req, res) => {
  // ... (код залишається практично таким самим, можливо, трохи оновити повідомлення)
  const botDbId = req.params.dbId;
  try {
    const botData = await Bot.findById(botDbId);
    if (!botData) {
      return res
        .status(404)
        .json({
          status: "not_found_db",
          message: "Бот не знайдений в БД.",
          dbStatus: "unknown",
          pinnedError: null,
        });
    }
    const childProcess = runningBotProcesses[botDbId];
    if (childProcess && childProcess.connected) {
      res.json({
        status: "running",
        message: "Процес активний.",
        dbStatus: botData.status,
        pinnedError: botData.pinnedError, // Додаємо pinnedError
      });
    } else {
      let message = `Процес неактивний. Статус в БД: ${botData.status}.`;
      if (botData.status === "running" || botData.status === "starting") {
        message = `Процес не відстежується як активний, але в БД статус ${botData.status}.`;
      }
      res.json({
        status: botData.status === "error" ? "error" : "stopped",
        message: message,
        dbStatus: botData.status,
        pinnedError: botData.pinnedError, // Додаємо pinnedError
      });
    }
  } catch (error) {
    console.error(
      `[Manager] Error fetching process status for bot DB ID ${botDbId}:`,
      error
    );
    res
      .status(500)
      .json({
        status: "error_server",
        message: "Помилка сервера.",
        dbStatus: "unknown",
        pinnedError: null,
      });
  }
});

router.get("/edit-file/:id", async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) {
      req.flash("error", "Бота не знайдено для редагування.");
      return res.redirect("/");
    }
    const absoluteFilePath = path.join(BOTS_DIR, path.basename(bot.filePath));
    if (!(await fs.pathExists(absoluteFilePath))) {
      req.flash("file_edit_error", `Файл бота ${bot.filePath} не знайдено.`);
      await updateBotStatusAndError(
        bot.botId,
        "error",
        `Bot file ${bot.filePath} not found for edit.`,
        `Файл бота ${bot.filePath} не знайдено.`
      );
      return res.redirect(`/bots/edit-file/${req.params.id}`); // Редирект на ту саму сторінку, щоб показати помилку
    }
    const fileContent = await fs.readFile(absoluteFilePath, "utf-8");
    res.render("edit-bot-file", {
      bot,
      fileContent,
      // messages, newCommandName, actionCode вже є в res.locals з server.js
    });
  } catch (error) {
    /* ... (як раніше) ... */
  }
});

router.post("/edit-file/:id", async (req, res) => {
  const { fileContent } = req.body;
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId);
    if (!bot) {
      /* ... */
    }
    // ... (логіка збереження файлу)
    await fs.writeFile(
      path.join(BOTS_DIR, path.basename(bot.filePath)),
      fileContent,
      "utf-8"
    );
    await stopBotProcess(bot._id.toString(), bot.botId);
    // Очищаємо pinnedError перед спробою запуску з новим кодом
    await Bot.findByIdAndUpdate(bot._id, {
      pinnedError: null,
      lastPinnedErrorTime: null,
    });
    await startBotProcess(bot);
    req.flash(
      "file_edit_success",
      `Файл бота ${bot.botId} збережено. Бот перезапускається.`
    );
    res.redirect(`/bots/edit-file/${botDbId}`);
  } catch (error) {
    /* ... (як раніше, з req.flash('file_edit_error', ...)) ... */
  }
});

router.post("/add-command/:id", async (req, res) => {
  const botDbId = req.params.id;
  let { newCommandName, actionCode } = req.body;
  // ... (валідація як раніше) ...
  try {
    const bot = await Bot.findById(botDbId);
    if (!bot) {
      /* ... */
    }
    // ... (логіка читання файлу, перевірки команди, маркера)
    // ... (формування коду newCommandHandlerCode)
    // ... (запис файлу)
    await fs.writeFile(
      path.join(BOTS_DIR, path.basename(bot.filePath)),
      fileContent,
      "utf-8"
    ); // fileContent має бути оновленим
    await stopBotProcess(bot._id.toString(), bot.botId);
    // Очищаємо pinnedError перед спробою запуску з новим кодом
    await Bot.findByIdAndUpdate(bot._id, {
      pinnedError: null,
      lastPinnedErrorTime: null,
    });
    await startBotProcess(bot);
    req.flash(
      "command_success",
      `Команду \`/${newCommandName}\` додано. Бот перезапускається.`
    );
    res.redirect(`/bots/edit-file/${botDbId}`);
  } catch (error) {
    /* ... (як раніше, з req.flash('command_error', ...)) ... */
  }
});

// НОВИЙ МАРШРУТ: Сторінка логів
router.get("/:id/logs", async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) {
      req.flash("error", "Бота не знайдено.");
      return res.redirect("/");
    }
    res.render("bot-logs", {
      bot,
      pageTitle: `Логи бота: ${bot.botId}`,
      // messages вже є в res.locals
    });
  } catch (error) {
    console.error(
      `[Manager] Error accessing logs page for bot ${req.params.id}:`,
      error
    );
    req.flash("error", "Помилка при відкритті сторінки логів.");
    res.redirect("/");
  }
});

// НОВИЙ API МАРШРУТ: Отримання вмісту лог-файлу
router.get("/api/:id/logs-content", async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) {
      return res
        .status(404)
        .json({
          error: "Бота не знайдено.",
          logs: "",
          pinnedError: "Бота не знайдено в базі даних.",
          lastPinnedErrorTime: null,
        });
    }
    const logFilePath = path.join(LOGS_DIR, `logs-${bot.botId}.txt`);
    let logContent = "";
    if (await fs.pathExists(logFilePath)) {
      const stats = await fs.stat(logFilePath);
      const fileSizeInBytes = stats.size;
      const maxBytesToRead = 500 * 1024; // 500KB

      if (fileSizeInBytes > maxBytesToRead) {
        const stream = fs.createReadStream(logFilePath, {
          start: fileSizeInBytes - maxBytesToRead,
          end: fileSizeInBytes - 1, // end є включним індексом
        });
        let buffer = "";
        for await (const chunk of stream) {
          buffer += chunk.toString();
        }
        // Знайти перший повний рядок, щоб не обрізати посередині
        const firstNewline = buffer.indexOf("\n");
        if (firstNewline !== -1 && firstNewline < buffer.length - 1) {
          logContent = buffer.substring(firstNewline + 1);
        } else {
          logContent = buffer; // Якщо немає нового рядка або це весь залишок
        }
        logContent =
          `... (показано приблизно останні ${Math.round(
            maxBytesToRead / 1024
          )}KB з ${Math.round(fileSizeInBytes / 1024)}KB) ...\n` + logContent;
      } else {
        logContent = await fs.readFile(logFilePath, "utf-8");
      }
    } else {
      logContent = "Файл логів ще не створено або порожній.";
    }
    res.json({
      logs: logContent,
      pinnedError: bot.pinnedError,
      lastPinnedErrorTime: bot.lastPinnedErrorTime,
    });
  } catch (error) {
    console.error(
      `[Manager] Error fetching log content for bot ${req.params.id}:`,
      error
    );
    res
      .status(500)
      .json({
        error: "Помилка сервера.",
        logs: "Помилка завантаження логів.",
        pinnedError: "Серверна помилка",
        lastPinnedErrorTime: null,
      });
  }
});

async function initializeBotsOnStartup() {
  // ... (як раніше, але переконайтеся, що startBotProcess коректно обробляє pinnedError при першому запуску)
  console.log("[Manager] Initializing bots on application startup...");
  try {
    const botsToStart = await Bot.find({ status: { $nin: ["stopped"] } }); // Запускаємо все, що не 'stopped'
    if (botsToStart.length === 0) {
      return;
    }
    for (const bot of botsToStart) {
      const absoluteFilePath = path.join(BOTS_DIR, path.basename(bot.filePath));
      if (await fs.pathExists(absoluteFilePath)) {
        // При ініціалізації, якщо бот не мав помилки, не встановлюємо pinnedError знову
        // startBotProcess має сам розібратися з pinnedError на основі запуску
        await startBotProcess(bot);
      } else {
        const errMsg = `Файл бота ${bot.filePath} для ${bot.botId} не знайдено.`;
        console.error(`[Manager] ${errMsg} Marking as error.`);
        await updateBotStatusAndError(bot.botId, "error", errMsg, errMsg);
      }
    }
  } catch (error) {
    /* ... */
  }
}

module.exports = { router, initializeBotsOnStartup }; // runningBotProcesses не експортується
