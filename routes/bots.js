// routes/bots.js
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

const runningBotProcesses = {};

async function updateBotStatusAndError(
  botInternalId,
  status,
  message = "",
  pinnedErrorMessage = undefined
) {
  try {
    const updateData = { status: status, lastMessage: message };
    if (pinnedErrorMessage !== undefined) {
      updateData.pinnedError = pinnedErrorMessage;
      if (pinnedErrorMessage) {
        updateData.lastPinnedErrorTime = new Date();
      }
    }
    await Bot.findOneAndUpdate(
      // removed updatedBot, not used
      { botId: botInternalId },
      updateData,
      { new: true }
    );
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
      `[Manager] Bot ${botData.botId} (${botData._id}) is already considered running/starting. Attempting to stop before restart.`
    );
    await stopBotProcess(botData._id.toString(), botData.botId);
  }

  let existingBotData = await Bot.findOne({ botId: botData.botId });
  await updateBotStatusAndError(
    botData.botId,
    "starting",
    "Process starting...",
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

  const absoluteBotFilePath = path.resolve(__dirname, "..", botData.filePath);

  if (!(await fs.pathExists(absoluteBotFilePath))) {
    const errMsg = `Файл бота ${absoluteBotFilePath} не знайдено!`;
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
      let newPinnedError = undefined;
      if (msg.status === "running") {
        newPinnedError = null;
        logStream.write(
          `--- Bot successfully started via IPC, pinned error (if any) cleared: ${new Date().toISOString()} ---\n`
        );
      } else if (msg.status === "error" && msg.message) {
        newPinnedError = msg.message;
        logStream.write(
          `[BOT_REPORTED_ERROR_VIA_IPC] ${
            msg.message
          } at ${new Date().toISOString()}\n`
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
      const botState = await Bot.findOne({ botId: botData.botId });
      if (
        botState &&
        botState.status !== "running" &&
        botState.status !== "error" &&
        botState.status !== "stopped"
      ) {
        let pinnedErrMsg = botState.pinnedError;
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
          await updateBotStatusAndError(
            botData.botId,
            "stopped",
            `Exited normally (code ${code}) before IPC confirmation`,
            pinnedErrMsg
          );
        }
      } else if (signal && botState && botState.status !== "stopped") {
        await updateBotStatusAndError(
          botData.botId,
          "stopped",
          `Stopped by signal: ${signal}`,
          botState.pinnedError
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
    console.log(
      `[Manager] Stopping bot process ${botInternalIdForLog} (DB ID: ${botDbIdString})`
    );
    processToKill.kill("SIGTERM");

    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (!processToKill.killed) {
          console.warn(
            `[Manager] Bot ${botInternalIdForLog} did not stop with SIGTERM in 2s, sending SIGKILL.`
          );
          processToKill.kill("SIGKILL");
        }
        resolve();
      }, 2000);

      processToKill.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    delete runningBotProcesses[botDbIdString];
    await updateBotStatusAndError(
      botInternalIdForLog,
      "stopped",
      "Process stopped by manager"
    );
  } else {
    const bot = await Bot.findOne({ botId: botInternalIdForLog });
    if (bot && bot.status !== "stopped") {
      await updateBotStatusAndError(
        botInternalIdForLog,
        "stopped",
        "Process not tracked, marked as stopped"
      );
    }
  }
}

router.get("/add", (req, res) => {
  res.render("add-bot");
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
    const relativeFilePath = path.join("app", fileName);
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
      filePath: relativeFilePath,
      status: "stopped",
    });
    const savedBot = await newBot.save();
    await startBotProcess(savedBot);
    req.flash("success", `Бот ${botId} успішно доданий та запускається!`);
    res.redirect("/");
  } catch (error) {
    console.error("[Manager] Error adding new bot:", error);
    req.flash("error", `Помилка при додаванні бота: ${error.message}`);
    req.flash("formToken", token);
    req.flash("formStatusCommand", statusCheckCommand);
    res.redirect("/bots/add");
  }
});

router.post("/restart/:id", async (req, res) => {
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId);
    if (!bot) {
      req.flash("error", "Бота не знайдено.");
      return res.redirect("/");
    }
    console.log(`[Manager] Restarting bot ${bot.botId} (DB ID: ${botDbId})`);
    await stopBotProcess(bot._id.toString(), bot.botId);
    await updateBotStatusAndError(bot.botId, bot.status, "Restarting...", null);
    await startBotProcess(bot);
    req.flash("success", `Бот ${bot.botId} перезапускається.`);
    res.redirect("/");
  } catch (error) {
    console.error(`[Manager] Error restarting bot ${botDbId}:`, error);
    req.flash("error", `Помилка перезапуску бота: ${error.message}`);
    res.redirect("/");
  }
});

router.post("/delete/:id", async (req, res) => {
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId);
    if (!bot) {
      req.flash("error", "Бота не знайдено.");
      return res.redirect("/");
    }
    console.log(`[Manager] Deleting bot ${bot.botId} (DB ID: ${botDbId})`);
    await stopBotProcess(bot._id.toString(), bot.botId);
    const absoluteBotFilePath = path.resolve(__dirname, "..", bot.filePath);
    if (await fs.pathExists(absoluteBotFilePath)) {
      await fs.unlink(absoluteBotFilePath);
      console.log(`[Manager] Deleted bot file: ${absoluteBotFilePath}`);
    }
    const logFilePath = path.join(LOGS_DIR, `logs-${bot.botId}.txt`);
    if (await fs.pathExists(logFilePath)) {
      await fs.unlink(logFilePath);
      console.log(`[Manager] Deleted log file: ${logFilePath}`);
    }
    await Bot.findByIdAndDelete(botDbId);
    req.flash("success", `Бот ${bot.botId} та його файли успішно видалені.`);
    res.redirect("/");
  } catch (error) {
    console.error(`[Manager] Error deleting bot ${botDbId}:`, error);
    req.flash("error", `Помилка при видаленні бота: ${error.message}`);
    res.redirect("/");
  }
});

router.get("/edit-file/:id", async (req, res) => {
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId);
    if (!bot) {
      req.flash("error", "Бота не знайдено для редагування.");
      return res.redirect("/");
    }
    const absoluteFilePath = path.resolve(__dirname, "..", bot.filePath);
    if (!(await fs.pathExists(absoluteFilePath))) {
      const errMsg = `Файл бота ${bot.filePath} не знайдено для редагування.`;
      req.flash("file_edit_error", errMsg);
      console.warn(`[Manager] File not found for editing: ${absoluteFilePath}`);
      return res.render("edit-bot-file", {
        bot,
        fileContent: `// Файл ${bot.filePath} не знайдено на сервері. Можливо, його було видалено вручну.\n// Якщо ви збережете цей вміст, буде створено новий файл з цим текстом.`,
        pageTitle: `Редагування ${bot.botId}`,
      });
    }
    const fileContent = await fs.readFile(absoluteFilePath, "utf-8");
    res.render("edit-bot-file", {
      bot,
      fileContent,
      pageTitle: `Редагування ${bot.botId}`,
    });
  } catch (error) {
    console.error(
      `[Manager] Error opening file editor for bot ${botDbId}:`,
      error
    );
    req.flash("error", `Помилка відкриття редактора: ${error.message}`);
    res.redirect("/");
  }
});

router.post("/edit-file/:id", async (req, res) => {
  const { fileContent } = req.body;
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId);
    if (!bot) {
      req.flash("file_edit_error", "Бота не знайдено.");
      return res.redirect(`/bots/edit-file/${botDbId}`);
    }
    const absoluteBotFilePath = path.resolve(__dirname, "..", bot.filePath);
    await fs.writeFile(absoluteBotFilePath, fileContent, "utf-8");
    console.log(`[Manager] Bot file ${bot.filePath} for ${bot.botId} updated.`);
    await stopBotProcess(bot._id.toString(), bot.botId);
    await updateBotStatusAndError(
      bot.botId,
      "stopped",
      "File edited, restarting...",
      null
    );
    await startBotProcess(bot);
    req.flash(
      "file_edit_success",
      `Файл бота ${bot.botId} збережено. Бот перезапускається.`
    );
    res.redirect(`/bots/edit-file/${botDbId}`);
  } catch (error) {
    console.error(`[Manager] Error saving bot file for ${botDbId}:`, error);
    req.flash("file_edit_error", `Помилка збереження файлу: ${error.message}`);
    res.redirect(`/bots/edit-file/${botDbId}`);
  }
});

// ОСНОВНА ЗМІНА ДЛЯ ЦЬОГО ЕТАПУ: Додавання коментаря-маркера
router.post("/add-command/:id", async (req, res) => {
  const botDbId = req.params.id;
  let { newCommandName, actionCode } = req.body;

  if (!newCommandName || !actionCode) {
    req.flash("command_error", "Назва команди та код дії є обов'язковими.");
    req.flash("formNewCommandName", newCommandName);
    req.flash("formActionCode", actionCode);
    return res.redirect(`/bots/edit-file/${botDbId}`);
  }

  newCommandName = newCommandName.trim().replace(/^\//, "");
  actionCode = actionCode.trim();

  if (!/^[a-zA-Z0-9_]+$/.test(newCommandName)) {
    req.flash(
      "command_error",
      "Назва команди може містити лише латинські літери, цифри та знак підкреслення (_)."
    );
    req.flash("formNewCommandName", newCommandName);
    req.flash("formActionCode", actionCode);
    return res.redirect(`/bots/edit-file/${botDbId}`);
  }

  if (actionCode.length < 3) {
    req.flash("command_error", "Код дії команди виглядає надто коротким.");
    req.flash("formNewCommandName", newCommandName);
    req.flash("formActionCode", actionCode);
    return res.redirect(`/bots/edit-file/${botDbId}`);
  }

  try {
    const bot = await Bot.findById(botDbId);
    if (!bot) {
      req.flash("command_error", "Бота не знайдено.");
      return res.redirect(`/bots/edit-file/${botDbId}`);
    }

    const absoluteBotFilePath = path.resolve(__dirname, "..", bot.filePath);
    let currentFileContent;
    try {
      currentFileContent = await fs.readFile(absoluteBotFilePath, "utf-8");
    } catch (readError) {
      console.error(
        `[Manager] Error reading bot file ${absoluteBotFilePath} for adding command:`,
        readError
      );
      req.flash(
        "command_error",
        `Не вдалося прочитати файл бота: ${readError.message}`
      );
      return res.redirect(`/bots/edit-file/${botDbId}`);
    }

    const marker =
      "// MARKER_FOR_NEW_COMMANDS (Не видаляйте і не змінюйте цей рядок!)";
    const markerIndex = currentFileContent.indexOf(marker);

    if (markerIndex === -1) {
      console.error(
        `[Manager] CRITICAL: Marker not found in bot file ${bot.filePath}`
      );
      req.flash(
        "command_error",
        "Критична помилка: маркер для додавання команд не знайдено у файлі бота. Можливо, файл пошкоджено або шаблон не містить маркера."
      );
      return res.redirect(`/bots/edit-file/${botDbId}`);
    }

    // ДОДАНО СПЕЦІАЛЬНИЙ КОМЕНТАР-МАРКЕР для нової команди
    const newCommandHandlerCode = `
// BOT_COMMAND_HANDLER: /${newCommandName}
bot.onText(/^\\/${newCommandName}(?:\\s+(.*))?$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const argsText = match && match[1] ? match[1].trim() : null;
    console.log(\`[${bot.botId}] Command /${newCommandName} received with args: '\${argsText}' from chat \${chatId}\`);
    try {
        ${actionCode}
    } catch (e) {
        console.error(\`[${bot.botId}] Error in user-defined action for command /${newCommandName}:\\n\`, e);
        if (bot && typeof bot.sendMessage === 'function') {
            bot.sendMessage(chatId, 'Вибачте, під час виконання команди "${newCommandName}" сталася внутрішня помилка.').catch(err => console.error(\`[${bot.botId}] Failed to send error message to chat \${chatId}\`, err));
        }
    }
});
`;
    const contentBeforeMarker = currentFileContent.substring(0, markerIndex);
    const contentAfterMarker = currentFileContent.substring(markerIndex);
    const updatedFileContent =
      contentBeforeMarker + newCommandHandlerCode + "\n" + contentAfterMarker;

    await fs.writeFile(absoluteBotFilePath, updatedFileContent, "utf-8");
    console.log(
      `[Manager] Command /${newCommandName} added to bot ${bot.botId}. File updated: ${bot.filePath}`
    );

    await stopBotProcess(bot._id.toString(), bot.botId);
    await updateBotStatusAndError(
      bot.botId,
      "stopped",
      `Command /${newCommandName} added, restarting...`,
      null
    );
    await startBotProcess(bot);

    req.flash(
      "command_success",
      `Команду \`/${newCommandName}\` успішно додано до файлу. Бот перезапускається.`
    );
    res.redirect(`/bots/edit-file/${botDbId}`);
  } catch (error) {
    console.error(`[Manager] Error adding command to bot ${botDbId}:`, error);
    req.flash(
      "command_error",
      `Помилка сервера при додаванні команди: ${error.message}`
    );
    req.flash("formNewCommandName", newCommandName);
    req.flash("formActionCode", actionCode);
    res.redirect(`/bots/edit-file/${botDbId}`);
  }
});

router.get("/:id/logs", async (req, res) => {
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId);
    if (!bot) {
      req.flash("error", "Бота не знайдено.");
      return res.redirect("/");
    }
    res.render("bot-logs", {
      bot,
      pageTitle: `Логи бота: ${bot.botId}`,
    });
  } catch (error) {
    console.error(
      `[Manager] Error accessing logs page for bot ${botDbId}:`,
      error
    );
    req.flash("error", "Помилка при відкритті сторінки логів.");
    res.redirect("/");
  }
});

router.get("/api/:id/logs-content", async (req, res) => {
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId);
    if (!bot) {
      return res.status(404).json({
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
      const maxBytesToRead = 500 * 1024;

      if (fileSizeInBytes > maxBytesToRead) {
        const stream = fs.createReadStream(logFilePath, {
          start: Math.max(0, fileSizeInBytes - maxBytesToRead),
          end: fileSizeInBytes - 1,
        });
        let buffer = "";
        for await (const chunk of stream) {
          buffer += chunk.toString("utf-8");
        }
        const firstNewline = buffer.indexOf("\n");
        if (firstNewline !== -1 && firstNewline < buffer.length - 1) {
          logContent = buffer.substring(firstNewline + 1);
        } else if (fileSizeInBytes > maxBytesToRead) {
          logContent = buffer;
        } else {
          logContent = buffer;
        }
        logContent =
          `... (показано приблизно останні ${Math.round(
            Buffer.byteLength(logContent, "utf-8") / 1024
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
      `[Manager] Error fetching log content for bot ${botDbId}:`,
      error
    );
    res.status(500).json({
      error: "Помилка сервера при завантаженні логів.",
      logs: "Помилка завантаження логів.",
      pinnedError: "Серверна помилка",
      lastPinnedErrorTime: null,
    });
  }
});

router.get("/process-status/:dbId", async (req, res) => {
  const botDbId = req.params.dbId;
  try {
    const botData = await Bot.findById(botDbId);
    if (!botData) {
      return res.status(404).json({
        status: "not_found_db",
        message: "Бот не знайдений в БД.",
        dbStatus: "unknown",
        pinnedError: null,
      });
    }
    const childProcess = runningBotProcesses[botData._id.toString()];

    let processActualStatus = "unknown";
    let message = `Статус процесу не визначено. Статус в БД: ${botData.status}.`;

    if (childProcess && childProcess.connected) {
      processActualStatus = "running";
      message = `Процес активний (PID: ${childProcess.pid}). Статус в БД: ${botData.status}.`;
    } else {
      if (botData.status === "running" || botData.status === "starting") {
        processActualStatus = "stale";
        message = `Процес не відстежується, але в БД статус '${botData.status}'. Можливо, він зупинився несподівано.`;
      } else if (botData.status === "error") {
        processActualStatus = "error";
        message = `Процес неактивний. В БД зафіксована помилка: ${
          botData.lastMessage || "Без деталей"
        }.`;
      } else {
        processActualStatus = "stopped";
        message = `Процес неактивний. Статус в БД: ${botData.status}.`;
      }
    }
    res.json({
      status: processActualStatus,
      message: message,
      dbStatus: botData.status,
      pinnedError: botData.pinnedError,
      lastMessageFromDB: botData.lastMessage,
    });
  } catch (error) {
    console.error(
      `[Manager] Error fetching process status for bot DB ID ${botDbId}:`,
      error
    );
    res.status(500).json({
      status: "error_server",
      message: "Помилка сервера при отриманні статусу.",
      dbStatus: "unknown",
      pinnedError: null,
    });
  }
});

// API маршрути для консолі з bot-logs.ejs
router.post("/api/:id/start", async (req, res) => {
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId);
    if (!bot) {
      return res
        .status(404)
        .json({ success: false, message: "Бота не знайдено в базі даних." });
    }
    if (
      runningBotProcesses[bot._id.toString()] &&
      runningBotProcesses[bot._id.toString()].connected
    ) {
      if (bot.status === "error" || bot.status === "stopped") {
        await updateBotStatusAndError(
          bot.botId,
          "starting",
          "Attempting to start via console (was error/stopped)...",
          null
        );
        await startBotProcess(bot);
        return res.json({
          success: true,
          message: `Бот ${bot.botId} був у стані ${bot.status}, спроба повторного запуску...`,
        });
      }
      return res.json({
        success: true,
        message: `Бот ${bot.botId} вже працює або запускається.`,
      });
    }
    console.log(
      `[API /start] Attempting to start bot ${bot.botId} via console.`
    );
    await updateBotStatusAndError(
      bot.botId,
      "starting",
      "Attempting to start via console...",
      null
    );
    await startBotProcess(bot);
    res.json({
      success: true,
      message: `Команда /start надіслана. Бот ${bot.botId} запускається.`,
    });
  } catch (error) {
    console.error(`[API /start] Error starting bot ${botDbId}:`, error);
    try {
      const botForErrorUpdate = await Bot.findById(botDbId);
      if (botForErrorUpdate) {
        await updateBotStatusAndError(
          botForErrorUpdate.botId,
          "error",
          `Failed to start via console: ${error.message}`,
          `Помилка запуску: ${error.message}`
        );
      }
    } catch (dbError) {
      console.error(
        `[API /start] Could not update bot status to error after start failure for ${botDbId}:`,
        dbError
      );
    }
    res
      .status(500)
      .json({
        success: false,
        message: `Помилка сервера при запуску бота: ${error.message}`,
      });
  }
});

router.post("/api/:id/stop", async (req, res) => {
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId);
    if (!bot) {
      return res
        .status(404)
        .json({ success: false, message: "Бота не знайдено в базі даних." });
    }
    console.log(`[API /stop] Attempting to stop bot ${bot.botId} via console.`);
    await stopBotProcess(bot._id.toString(), bot.botId);
    res.json({
      success: true,
      message: `Команда /stop надіслана. Бот ${bot.botId} зупиняється.`,
    });
  } catch (error) {
    console.error(`[API /stop] Error stopping bot ${botDbId}:`, error);
    try {
      const botForErrorUpdate = await Bot.findById(botDbId);
      if (botForErrorUpdate) {
        await updateBotStatusAndError(
          botForErrorUpdate.botId,
          botForErrorUpdate.status,
          `Failed to stop via console: ${error.message}`,
          botForErrorUpdate.pinnedError
        );
      }
    } catch (dbError) {
      console.error(
        `[API /stop] Could not update bot message after stop failure for ${botDbId}:`,
        dbError
      );
    }
    res
      .status(500)
      .json({
        success: false,
        message: `Помилка сервера при зупинці бота: ${error.message}`,
      });
  }
});

async function initializeBotsOnStartup() {
  console.log("[Manager] Initializing bots on application startup...");
  try {
    const botsToConsider = await Bot.find({});
    if (botsToConsider.length === 0) {
      console.log("[Manager] No bots found in DB for startup consideration.");
      return;
    }
    for (const bot of botsToConsider) {
      if (
        runningBotProcesses[bot._id.toString()] &&
        runningBotProcesses[bot._id.toString()].connected
      ) {
        console.log(
          `[Manager] Bot ${bot.botId} (DB ID: ${bot._id}) is already considered running during initialization.`
        );
        continue;
      }
      const absoluteBotFilePath = path.resolve(__dirname, "..", bot.filePath);
      if (await fs.pathExists(absoluteBotFilePath)) {
        if (bot.status === "running" || bot.status === "starting") {
          console.log(
            `[Manager] Attempting to start bot ${bot.botId} (status: ${bot.status}) from startup.`
          );
          await startBotProcess(bot);
        } else {
          // console.log(`[Manager] Bot ${bot.botId} is in status '${bot.status}', not starting automatically.`);
        }
      } else {
        const errMsg = `Файл бота ${bot.filePath} для ${bot.botId} не знайдено під час ініціалізації.`;
        console.error(`[Manager] ${errMsg} Marking as error.`);
        await updateBotStatusAndError(bot.botId, "error", errMsg, errMsg);
      }
    }
    console.log("[Manager] Bot initialization attempt complete.");
  } catch (error) {
    console.error(
      "[Manager] Error during bot initialization on startup:",
      error
    );
  }
}

module.exports = { router, initializeBotsOnStartup, runningBotProcesses };
