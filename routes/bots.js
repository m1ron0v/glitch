// routes/bots.js
const express = require("express");
const router = express.Router();
const Bot = require("../models/bot");
const fs = require("fs-extra");
const path = require("path");
const { fork } = require("child_process");
const short = require("short-uuid");
const readline = require("readline");

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
      } else if (pinnedErrorMessage === null) {
        updateData.lastPinnedErrorTime = null;
      }
    }
    await Bot.findOneAndUpdate({ botId: botInternalId }, updateData, {
      new: true,
    });
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

  const botDbIdString = botData._id.toString();

  if (
    runningBotProcesses[botDbIdString] &&
    runningBotProcesses[botDbIdString].connected &&
    !runningBotProcesses[botDbIdString].killed
  ) {
    console.log(
      `[Manager] Bot ${botData.botId} (${botDbIdString}) process found connected. Stopping before restart.`
    );
    await stopBotProcess(botDbIdString, botData.botId);
  }

  const currentBotStateBeforeStart = await Bot.findById(botData._id);
  const pinnedErrorForStartingState = currentBotStateBeforeStart
    ? currentBotStateBeforeStart.pinnedError
    : undefined;

  await updateBotStatusAndError(
    botData.botId,
    "starting",
    "Процес запускається...",
    pinnedErrorForStartingState
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
      `Файл бота не знайдено: ${botData.filePath}`,
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
    logStream.write(`[ERR] ${message}`); // Log stderr, which might contain error details
  });

  runningBotProcesses[botDbIdString] = child;

  child.on("message", async (msg) => {
    if (msg.type === "status" && msg.botId === botData.botId) {
      let newPinnedErrorToSet;
      if (msg.status === "running") {
        newPinnedErrorToSet = null;
        logStream.write(
          `--- Bot successfully started via IPC, pinned error (if any) cleared: ${new Date().toISOString()} ---\n`
        );
      } else if (msg.status === "error" && msg.message) {
        newPinnedErrorToSet = msg.message;
        logStream.write(
          `[BOT_REPORTED_ERROR_VIA_IPC] ${
            // This is a key phrase for error stats
            msg.message
          } at ${new Date().toISOString()}\n`
        );
      } else {
        newPinnedErrorToSet = undefined;
      }
      await updateBotStatusAndError(
        botData.botId,
        msg.status,
        msg.message || "Received IPC status update",
        newPinnedErrorToSet
      );
      if (
        (msg.status === "error" || msg.status === "stopped") &&
        runningBotProcesses[botDbIdString] === child
      ) {
        delete runningBotProcesses[botDbIdString];
      }
    }
    if (
      msg.type === "send_to_telegram" &&
      msg.botId === botData.botId &&
      msg.chatId &&
      msg.text
    ) {
      console.warn(
        `[Manager] Received 'send_to_telegram' IPC but this should be handled by bot-template.js. Bot ID: ${msg.botId}`
      );
    }
  });

  child.on("error", async (err) => {
    const errMsg = `Критична помилка в процесі бота: ${
      err.message || "Невідома помилка форка"
    }`;
    console.error(`[Manager] Error in bot process ${botData.botId}:`, err);
    logStream.write(
      // This is a key phrase for error stats
      `[CRITICAL_FORK_ERROR] ${errMsg} at ${new Date().toISOString()}\n`
    );
    await updateBotStatusAndError(
      botData.botId,
      "error",
      err.message || "Child process error",
      errMsg
    );
    if (runningBotProcesses[botDbIdString] === child) {
      delete runningBotProcesses[botDbIdString];
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

    const botExitedProcess = runningBotProcesses[botDbIdString];
    if (botExitedProcess === child) {
      delete runningBotProcesses[botDbIdString];

      const botState = await Bot.findOne({ botId: botData.botId });
      if (!botState) {
        logStream.end(
          `--- Bot process exited (on 'exit' event) and closed stream: ${new Date().toISOString()} ---\n`
        );
        return;
      }
      if (botState.status === "running" || botState.status === "starting") {
        let pinnedErrMsgForExit;
        if (signal === "SIGTERM" || signal === "SIGKILL") {
          await updateBotStatusAndError(
            botData.botId,
            "stopped",
            `Процес зупинено сигналом ${signal}.`,
            botState.pinnedError
          );
        } else {
          pinnedErrMsgForExit = `Бот несподівано зупинився (код: ${code}, сигнал: ${
            signal || "N/A"
          }). Перевірте логи.`;
          logStream.write(
            // This is a key phrase for error stats
            `[UNEXPECTED_EXIT_ERROR] ${pinnedErrMsgForExit} at ${new Date().toISOString()}\n`
          );
          await updateBotStatusAndError(
            botData.botId,
            "error",
            `Несподівано зупинено (код: ${code})`,
            pinnedErrMsgForExit
          );
        }
      } else if (botState.status !== "stopped" && botState.status !== "error") {
        await updateBotStatusAndError(
          botData.botId,
          code === 0 ? "stopped" : "error",
          `Завершено з кодом ${code}. Попередній статус в БД: ${botState.status}.`,
          code === 0
            ? botState.pinnedError
            : `Завершено з помилкою (код ${code}), попередній статус: ${botState.status}`
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
  const botBeforeStop = await Bot.findOne({ botId: botInternalIdForLog });
  const pinnedErrorToPreserve = botBeforeStop
    ? botBeforeStop.pinnedError
    : undefined;

  if (processToKill && processToKill.connected && !processToKill.killed) {
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

    if (runningBotProcesses[botDbIdString] === processToKill) {
      delete runningBotProcesses[botDbIdString];
    }
    const botAfterStopAttempt = await Bot.findOne({
      botId: botInternalIdForLog,
    });
    if (
      botAfterStopAttempt &&
      botAfterStopAttempt.status !== "stopped" &&
      botAfterStopAttempt.status !== "error"
    ) {
      await updateBotStatusAndError(
        botInternalIdForLog,
        "stopped",
        "Процес зупинено менеджером.",
        pinnedErrorToPreserve
      );
    }
  } else {
    if (
      botBeforeStop &&
      (botBeforeStop.status === "running" ||
        botBeforeStop.status === "starting")
    ) {
      console.log(
        `[Manager] Process for ${botInternalIdForLog} not actively tracked or already killed. Marking as stopped in DB.`
      );
      await updateBotStatusAndError(
        botInternalIdForLog,
        "stopped",
        "Процес не відстежувався/вже зупинений, позначено як зупинений в БД.",
        pinnedErrorToPreserve
      );
    }
    if (runningBotProcesses[botDbIdString]) {
      delete runningBotProcesses[botDbIdString];
    }
  }
}

router.get("/add", (req, res) => {
  res.render("add-bot", {
    pageTitle: "Додати нового бота",
    activePage: "add",
  });
});

router.post("/add", async (req, res, next) => {
  const { token, statusCheckCommand } = req.body;
  if (!token || !statusCheckCommand) {
    req.flash("error", "Токен та команда статусу є обов'язковими.");
    res.locals.token = token;
    res.locals.statusCheckCommand = statusCheckCommand;
    return res.render("add-bot", {
      pageTitle: "Додати нового бота",
      activePage: "add",
    });
  }
  try {
    const existingBotByToken = await Bot.findOne({ token: token });
    if (existingBotByToken) {
      req.flash("error", "Бот з таким токеном вже існує.");
      res.locals.token = token;
      res.locals.statusCheckCommand = statusCheckCommand;
      return res.render("add-bot", {
        pageTitle: "Додати нового бота",
        activePage: "add",
      });
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
    res.redirect(`/bots/${savedBot._id}/manage/status`);
  } catch (error) {
    console.error("[Manager] Error adding new bot:", error);
    req.flash("error", `Помилка при додаванні бота: ${error.message}`);
    res.locals.token = token;
    res.locals.statusCheckCommand = statusCheckCommand;
    return res.status(500).render("add-bot", {
      pageTitle: "Додати нового бота - Помилка",
      activePage: "add",
    });
  }
});

const renderManagePage = async (req, res, next) => {
  const botDbId = req.params.id;
  const activeTab = req.params.tab || "status";

  try {
    const bot = await Bot.findById(botDbId).lean();
    if (!bot) {
      req.flash("error", "Бота не знайдено.");
      return res.redirect("/");
    }

    const validTabsForThisRoute = ["status", "add-command", "delete-command"];
    if (!validTabsForThisRoute.includes(activeTab)) {
      if (activeTab === "console") return res.redirect(`/bots/${bot._id}/logs`);
      if (activeTab === "edit-code")
        return res.redirect(`/bots/edit-file/${bot._id}`);
      return res.redirect(`/bots/${bot._id}/manage/status`);
    }

    let pageTitle = `Керування: ${bot.botId}`;
    if (activeTab === "status") pageTitle = `Статус: ${bot.botId}`;
    else if (activeTab === "add-command")
      pageTitle = `Додати команду: ${bot.botId}`;
    else if (activeTab === "delete-command")
      pageTitle = `Видалити команду: ${bot.botId}`;

    res.render("bot-manage", {
      bot,
      activeTab,
      pageTitle,
      activePage: "manage",
    });
  } catch (error) {
    console.error(
      `[Manager] Error loading manage page for bot ${botDbId} (tab: ${activeTab}):`,
      error
    );
    req.flash(
      "error",
      `Помилка завантаження сторінки керування: ${error.message}`
    );
    return res.status(500).render("error", {
      pageTitle: "Помилка сервера",
      message: `Помилка завантаження сторінки керування: ${error.message}`,
      error: process.env.NODE_ENV === "development" ? error : {},
    });
  }
};

router.get("/:id/manage/:tab", renderManagePage);
router.get("/:id/manage", renderManagePage);

router.post("/restart/:id", async (req, res, next) => {
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId);
    if (!bot) {
      req.flash("error", "Бота не знайдено для перезапуску.");
      return res.redirect("/");
    }
    console.log(
      `[Manager] Restarting bot ${bot.botId} (DB ID: ${botDbId}) by user.`
    );
    await stopBotProcess(bot._id.toString(), bot.botId);
    await updateBotStatusAndError(
      bot.botId,
      "stopped",
      "Перезапуск користувачем...",
      null
    );
    await startBotProcess(bot);
    req.flash("success", `Бот ${bot.botId} перезапускається.`);
    res.redirect(`/bots/${botDbId}/manage/status`);
  } catch (error) {
    console.error(`[Manager] Error restarting bot ${botDbId}:`, error);
    req.flash("error", `Помилка перезапуску бота: ${error.message}`);
    return res.status(500).render("error", {
      pageTitle: "Помилка сервера",
      message: `Помилка перезапуску бота: ${error.message}`,
      error: process.env.NODE_ENV === "development" ? error : {},
    });
  }
});

router.post("/delete/:id", async (req, res, next) => {
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId);
    if (!bot) {
      req.flash("error", "Бота не знайдено для видалення.");
      return res.redirect("/");
    }
    console.log(`[Manager] Deleting bot ${bot.botId} (DB ID: ${botDbId})`);
    await stopBotProcess(bot._id.toString(), bot.botId);
    const absoluteBotFilePath = path.resolve(__dirname, "..", bot.filePath);
    if (await fs.pathExists(absoluteBotFilePath))
      await fs.unlink(absoluteBotFilePath);
    const logFilePath = path.join(LOGS_DIR, `logs-${bot.botId}.txt`);
    if (await fs.pathExists(logFilePath)) await fs.unlink(logFilePath);
    await Bot.findByIdAndDelete(botDbId);
    req.flash("success", `Бот ${bot.botId} та його файли успішно видалені.`);
    res.redirect("/");
  } catch (error) {
    console.error(`[Manager] Error deleting bot ${botDbId}:`, error);
    req.flash("error", `Помилка при видаленні бота: ${error.message}`);
    return res.status(500).render("error", {
      pageTitle: "Помилка сервера",
      message: `Помилка при видаленні бота: ${error.message}`,
      error: process.env.NODE_ENV === "development" ? error : {},
    });
  }
});

router.get("/edit-file/:id", async (req, res, next) => {
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId).lean();
    if (!bot) {
      req.flash("error", "Бота не знайдено для редагування.");
      return res.redirect("/");
    }
    const absoluteFilePath = path.resolve(__dirname, "..", bot.filePath);
    let fileContent = `// Файл ${bot.filePath} не знайдено. Спробуйте зберегти, щоб створити його.`;
    let fileNotFoundError = null;
    if (!(await fs.pathExists(absoluteFilePath))) {
      fileNotFoundError = `Файл бота ${bot.filePath} не знайдено. Якщо зберегти вміст, буде створено новий файл.`;
      console.warn(`[Manager] File not found for editing: ${absoluteFilePath}`);
    } else {
      fileContent = await fs.readFile(absoluteFilePath, "utf-8");
    }

    const currentFlashError = req.flash("file_edit_error")[0];
    const combinedError = currentFlashError || fileNotFoundError;

    res.render("edit-bot-file", {
      bot,
      fileContent,
      pageTitle: `Редагування коду: ${bot.botId}`,
      activePage: "manage",
      navBotId: bot._id,
      messages: {
        ...res.locals.messages,
        file_edit_error: combinedError || null,
      },
    });
  } catch (error) {
    console.error(
      `[Manager] Error opening file editor for bot ${botDbId}:`,
      error
    );
    req.flash("error", `Помилка відкриття редактора: ${error.message}`);
    return res.status(500).render("error", {
      pageTitle: "Помилка сервера",
      message: `Помилка відкриття редактора: ${error.message}`,
      error: process.env.NODE_ENV === "development" ? error : {},
    });
  }
});

router.post("/edit-file/:id", async (req, res, next) => {
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
    console.log(
      `[Manager] Bot file ${bot.filePath} for ${bot.botId} updated by user.`
    );
    await stopBotProcess(bot._id.toString(), bot.botId);
    await updateBotStatusAndError(
      bot.botId,
      "stopped",
      "Файл змінено користувачем, перезапуск...",
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

router.post("/add-command/:id", async (req, res, next) => {
  const botDbId = req.params.id;
  let { newCommandName, actionCode } = req.body;

  if (!newCommandName || !actionCode) {
    req.flash("command_error", "Назва команди та код дії є обов'язковими.");
    res.locals.newCommandName = newCommandName;
    res.locals.actionCode = actionCode;
    return res.redirect(`/bots/${botDbId}/manage/add-command`);
  }
  newCommandName = newCommandName.trim().replace(/^\//, "");
  actionCode = actionCode.trim();
  if (!/^[a-zA-Z0-9_]+$/.test(newCommandName)) {
    req.flash(
      "command_error",
      "Назва команди може містити лише літери, цифри та підкреслення."
    );
    res.locals.newCommandName = newCommandName;
    res.locals.actionCode = actionCode;
    return res.redirect(`/bots/${botDbId}/manage/add-command`);
  }
  if (actionCode.length < 3) {
    req.flash("command_error", "Код дії команди виглядає надто коротким.");
    res.locals.newCommandName = newCommandName;
    res.locals.actionCode = actionCode;
    return res.redirect(`/bots/${botDbId}/manage/add-command`);
  }

  try {
    const bot = await Bot.findById(botDbId);
    if (!bot) {
      req.flash("command_error", "Бота не знайдено.");
      return res.redirect(`/bots/${botDbId}/manage/add-command`);
    }
    const absoluteBotFilePath = path.resolve(__dirname, "..", bot.filePath);
    let currentFileContent;
    try {
      currentFileContent = await fs.readFile(absoluteBotFilePath, "utf-8");
    } catch (readError) {
      req.flash(
        "command_error",
        `Не вдалося прочитати файл бота: ${readError.message}`
      );
      return res.redirect(`/bots/${botDbId}/manage/add-command`);
    }
    const marker =
      "// MARKER_FOR_NEW_COMMANDS (Не видаляйте і не змінюйте цей рядок!)";
    const markerIndex = currentFileContent.indexOf(marker);
    if (markerIndex === -1) {
      req.flash(
        "command_error",
        "Критична помилка: маркер для додавання команд не знайдено у файлі бота. Можливо, файл було змінено вручну. Рекомендується перевірити файл або відредагувати його через повний редактор коду, щоб відновити маркер."
      );
      return res.redirect(`/bots/${botDbId}/manage/add-command`);
    }
    const newCommandHandlerCode = `
// BOT_COMMAND_HANDLER: /${newCommandName}
bot.onText(/^\\/${newCommandName}(?:\\s+(.*))?$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const argsText = match && match[1] ? match[1].trim() : null;
    console.log(\`[${bot.botId}] Command /${newCommandName} received with args: '\${argsText}' from chat \${chatId}, user: \${msg.from.username || msg.from.id}\`);
    try {
        ${actionCode}
    } catch (e) {
        console.error(\`[${bot.botId}] Error in user-defined action for command /${newCommandName}:\\n\`, e);
        if (bot && typeof bot.sendMessage === 'function') {
            bot.sendMessage(chatId, 'Вибачте, під час виконання команди "${newCommandName}" сталася внутрішня помилка. Повідомте адміністратора.').catch(err => console.error(\`[${bot.botId}] Failed to send error message to chat \${chatId}\`, err));
        }
    }
});
`;
    const updatedFileContent =
      currentFileContent.substring(0, markerIndex) +
      newCommandHandlerCode +
      "\n" +
      currentFileContent.substring(markerIndex);
    await fs.writeFile(absoluteBotFilePath, updatedFileContent, "utf-8");
    console.log(
      `[Manager] Command /${newCommandName} added to bot ${bot.botId}.`
    );

    await stopBotProcess(bot._id.toString(), bot.botId);
    await updateBotStatusAndError(
      bot.botId,
      "stopped",
      `Команду /${newCommandName} додано, перезапуск...`,
      null
    );
    await startBotProcess(bot);

    req.flash(
      "command_success",
      `Команду \`/${newCommandName}\` успішно додано. Бот перезапускається.`
    );
    res.redirect(`/bots/${botDbId}/manage/add-command`);
  } catch (error) {
    console.error(`[Manager] Error adding command to bot ${botDbId}:`, error);
    req.flash(
      "command_error",
      `Помилка сервера при додаванні команди: ${error.message}`
    );
    res.locals.newCommandName = newCommandName;
    res.locals.actionCode = actionCode;
    res.redirect(`/bots/${botDbId}/manage/add-command`);
  }
});

router.post("/delete-command/:id", async (req, res, next) => {
  const botDbId = req.params.id;
  let { commandNameToDelete } = req.body;

  if (!commandNameToDelete) {
    req.flash(
      "command_delete_error",
      "Назва команди для видалення є обов'язковою."
    );
    return res.redirect(`/bots/${botDbId}/manage/delete-command`);
  }
  commandNameToDelete = commandNameToDelete.trim().replace(/^\//, "");
  if (!/^[a-zA-Z0-9_]+$/.test(commandNameToDelete)) {
    req.flash(
      "command_delete_error",
      "Назва команди може містити лише літери, цифри та підкреслення."
    );
    res.locals.commandNameToDeleteValue = commandNameToDelete;
    return res.redirect(`/bots/${botDbId}/manage/delete-command`);
  }

  try {
    const bot = await Bot.findById(botDbId);
    if (!bot) {
      req.flash("command_delete_error", "Бота не знайдено.");
      return res.redirect(`/bots/${botDbId}/manage/delete-command`);
    }
    const absoluteBotFilePath = path.resolve(__dirname, "..", bot.filePath);
    let currentFileContent;
    try {
      currentFileContent = await fs.readFile(absoluteBotFilePath, "utf-8");
    } catch (readError) {
      req.flash(
        "command_delete_error",
        `Не вдалося прочитати файл бота: ${readError.message}`
      );
      return res.redirect(`/bots/${botDbId}/manage/delete-command`);
    }

    const escapedCommandName = commandNameToDelete.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
    const commandBlockRegex = new RegExp(
      `// BOT_COMMAND_HANDLER: /${escapedCommandName}\\r?\\n` +
        `bot\\.onText\\(/^\\\\\\/${escapedCommandName}(?:\\\\s\\+\\(\\.\\*\\)\\?\\$\\/, async \\(msg, match\\) => \\{[\\s\\S]*?\\}\\);[\\s\\r\\n]*`,
      "gm"
    );

    const updatedFileContent = currentFileContent.replace(
      commandBlockRegex,
      ""
    );

    if (currentFileContent === updatedFileContent) {
      req.flash(
        "command_delete_error",
        `Команду \`/${commandNameToDelete}\` не знайдено у стандартному форматі, згенерованому менеджером. Можливо, її було змінено вручну або вона не існує.`
      );
      res.locals.commandNameToDeleteValue = commandNameToDelete;
      return res.redirect(`/bots/${botDbId}/manage/delete-command`);
    }

    await fs.writeFile(absoluteBotFilePath, updatedFileContent.trim(), "utf-8");
    console.log(
      `[Manager] Command /${commandNameToDelete} deleted from bot ${bot.botId}.`
    );

    await stopBotProcess(bot._id.toString(), bot.botId);
    await updateBotStatusAndError(
      bot.botId,
      "stopped",
      `Команду /${commandNameToDelete} видалено, перезапуск...`,
      null
    );
    await startBotProcess(bot);

    req.flash(
      "command_delete_success",
      `Команду \`/${commandNameToDelete}\` успішно видалено. Бот перезапускається.`
    );
    res.redirect(`/bots/${botDbId}/manage/delete-command`);
  } catch (error) {
    console.error(
      `[Manager] Error deleting command for bot ${botDbId}:`,
      error
    );
    req.flash(
      "command_delete_error",
      `Помилка сервера при видаленні команди: ${error.message}`
    );
    res.locals.commandNameToDeleteValue = commandNameToDelete;
    res.redirect(`/bots/${botDbId}/manage/delete-command`);
  }
});

router.get("/:id/logs", async (req, res, next) => {
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId).lean();
    if (!bot) {
      req.flash("error", "Бота не знайдено.");
      return res.redirect("/");
    }
    res.render("bot-logs", {
      bot,
      pageTitle: `Логи та консоль: ${bot.botId}`,
      activePage: "manage",
      navBotId: bot._id,
    });
  } catch (error) {
    console.error(
      `[Manager] Error accessing logs page for bot ${botDbId}:`,
      error
    );
    req.flash("error", "Помилка при відкритті сторінки логів.");
    return res.status(500).render("error", {
      pageTitle: "Помилка сервера",
      message: "Помилка при відкритті сторінки логів.",
      error: process.env.NODE_ENV === "development" ? error : {},
    });
  }
});

// --- API маршрути ---
router.get("/api/:id/logs-content", async (req, res) => {
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId).lean();
    if (!bot) {
      return res.status(404).json({
        error: "Бота не знайдено.",
        logs: "",
        pinnedError: "Бота не знайдено в БД.",
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
          encoding: "utf-8",
        });
        let buffer = "";
        for await (const chunk of stream) {
          buffer += chunk;
        }
        const firstNewline = buffer.indexOf("\n");
        logContent =
          firstNewline !== -1 && firstNewline < buffer.length - 1
            ? buffer.substring(firstNewline + 1)
            : buffer;
        logContent =
          `... (показано ~${Math.round(
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
      `[API] Error fetching log content for bot ${botDbId}:`,
      error
    );
    res.status(500).json({
      error: "Помилка сервера при завантаженні логів.",
      logs: "Помилка завантаження логів.",
      pinnedError: "Серверна помилка",
      lastPinnedErrorTime: new Date(),
    });
  }
});

router.get("/api/:id/stats/unique-users", async (req, res) => {
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId).lean();
    if (!bot) {
      return res.status(404).json({ error: "Бота не знайдено." });
    }

    const logFilePath = path.join(LOGS_DIR, `logs-${bot.botId}.txt`);
    if (!(await fs.pathExists(logFilePath))) {
      return res.json({ uniqueUsers: 0, message: "Лог-файл не знайдено." });
    }

    const uniqueChatIds = new Set();
    const escapedBotId = bot.botId.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const chatIdRegex = new RegExp(
      `\\[${escapedBotId}\\] Interaction:.*?chatId:\\s*(\\d+)`,
      "g"
    );

    const fileStream = fs.createReadStream(logFilePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      let match;
      while ((match = chatIdRegex.exec(line)) !== null) {
        if (match[1]) {
          uniqueChatIds.add(match[1]);
        }
      }
    }

    res.json({ uniqueUsers: uniqueChatIds.size });
  } catch (error) {
    console.error(`[API /stats/unique-users] Error for bot ${botDbId}:`, error);
    res.status(500).json({
      error: "Помилка сервера при підрахунку унікальних користувачів.",
      uniqueUsers: "N/A",
    });
  }
});

router.get("/api/:id/stats/command-usage", async (req, res) => {
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId).lean();
    if (!bot) {
      return res.status(404).json({ error: "Бота не знайдено." });
    }

    const logFilePath = path.join(LOGS_DIR, `logs-${bot.botId}.txt`);
    if (!(await fs.pathExists(logFilePath))) {
      return res.json({ commandUsage: [], message: "Лог-файл не знайдено." });
    }

    const commandCounts = {};
    const escapedBotId = bot.botId.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const commandLogRegex = new RegExp(
      `\\[${escapedBotId}\\] Command (\\/[a-zA-Z0-9_]+) received`,
      "g"
    );

    const fileStream = fs.createReadStream(logFilePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      let match;
      while ((match = commandLogRegex.exec(line)) !== null) {
        if (match[1]) {
          const commandName = match[1];
          commandCounts[commandName] = (commandCounts[commandName] || 0) + 1;
        }
      }
    }

    const commandUsageArray = Object.entries(commandCounts)
      .map(([command, count]) => ({ command, count }))
      .sort((a, b) => b.count - a.count);

    res.json({ commandUsage: commandUsageArray });
  } catch (error) {
    console.error(
      `[API /stats/command-usage] Error for bot ${botDbId}:`,
      error
    );
    res.status(500).json({
      error: "Помилка сервера при підрахунку використання команд.",
      commandUsage: [],
    });
  }
});

// >>> NEW API ENDPOINT FOR ERROR SUMMARY STATS <<<
router.get("/api/:id/stats/error-summary", async (req, res) => {
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId).lean();
    if (!bot) {
      return res.status(404).json({ error: "Бота не знайдено." });
    }

    const logFilePath = path.join(LOGS_DIR, `logs-${bot.botId}.txt`);
    if (!(await fs.pathExists(logFilePath))) {
      return res.json({ errorSummary: [], message: "Лог-файл не знайдено." });
    }

    const errorCounts = {};
    // Keywords/phrases to identify different types of errors from logs
    // We will capture the keyword and a short snippet of the error message
    const errorPatterns = [
      {
        keyword: "[CRITICAL_FORK_ERROR]",
        regex: new RegExp(
          `\\[${bot.botId.replace(
            /[-\/\\^$*+?.()|[\]{}]/g,
            "\\$&"
          )}\\] .*?\\[CRITICAL_FORK_ERROR\\] (Критична помилка в процесі бота:.*?)(?: at|$)`,
          "i"
        ),
      },
      {
        keyword: "[UNEXPECTED_EXIT_ERROR]",
        regex: new RegExp(
          `\\[${bot.botId.replace(
            /[-\/\\^$*+?.()|[\]{}]/g,
            "\\$&"
          )}\\] .*?\\[UNEXPECTED_EXIT_ERROR\\] (Бот несподівано зупинився.*?)(?: at|$)`,
          "i"
        ),
      },
      {
        keyword: "[BOT_REPORTED_ERROR_VIA_IPC]",
        regex: new RegExp(
          `\\[${bot.botId.replace(
            /[-\/\\^$*+?.()|[\]{}]/g,
            "\\$&"
          )}\\] .*?\\[BOT_REPORTED_ERROR_VIA_IPC\\] (.*?)(?: at|$)`,
          "i"
        ),
      },
      {
        // General polling error from bot-template
        keyword: "Polling error",
        regex: new RegExp(
          `\\[${bot.botId.replace(
            /[-\/\\^$*+?.()|[\]{}]/g,
            "\\$&"
          )}\\] Polling error: (.*?)(?: -|$)`,
          "i"
        ),
      },
      {
        // General error from bot-template
        keyword: "General error",
        regex: new RegExp(
          `\\[${bot.botId.replace(
            /[-\/\\^$*+?.()|[\]{}]/g,
            "\\$&"
          )}\\] General error: (.*?)(?: at \\w|$)`,
          "i"
        ), // Try to get first part of error
      },
      {
        // User-defined command error from bot-template
        keyword: "Error in user-defined action",
        regex: new RegExp(
          `\\[${bot.botId.replace(
            /[-\/\\^$*+?.()|[\]{}]/g,
            "\\$&"
          )}\\] Error in user-defined action for command (\\/\\w+):\\s*([\\s\\S]*?)(?=\\n\\s*\\[|$)`,
          "im"
        ), // Capture command and error message
      },
      {
        // Generic [ERR] lines from bot's stderr
        keyword: "[ERR]",
        regex: new RegExp(`^\\[ERR\\] (.*)`, "i"), // Assumes [ERR] is at the start of the line from stderr
      },
    ];

    const fileStream = fs.createReadStream(logFilePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      for (const pattern of errorPatterns) {
        const match = pattern.regex.exec(line);
        if (match) {
          let errorMessage;
          if (pattern.keyword === "Error in user-defined action" && match[2]) {
            // For user-defined action, try to get a cleaner error message if possible.
            // match[2] can be a multi-line stack trace. We take the first line or a snippet.
            const firstErrorLine = match[2]
              .split("\n")[0]
              .trim()
              .substring(0, 100);
            errorMessage = `Помилка в команді ${match[1]}: ${firstErrorLine}...`;
          } else {
            errorMessage = match[1]
              ? match[1].trim().substring(0, 150)
              : pattern.keyword; // Max 150 chars for the message
            if (match[1] && match[1].length > 150) errorMessage += "...";
          }

          const errorKey = `${pattern.keyword} - ${errorMessage}`; // Group by keyword and message snippet
          errorCounts[errorKey] = (errorCounts[errorKey] || 0) + 1;
          break; // Count only the first matching pattern per line
        }
      }
    }

    const errorSummaryArray = Object.entries(errorCounts)
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count);

    res.json({ errorSummary: errorSummaryArray });
  } catch (error) {
    console.error(
      `[API /stats/error-summary] Error for bot ${botDbId}:`,
      error
    );
    res.status(500).json({
      error: "Помилка сервера при підрахунку помилок.",
      errorSummary: [],
    });
  }
});
// >>> END NEW API ENDPOINT <<<

router.get("/process-status/:dbId", async (req, res) => {
  const botDbId = req.params.dbId;
  try {
    const botData = await Bot.findById(botDbId).lean();
    if (!botData) {
      return res.status(404).json({
        status: "not_found_db",
        message: "Бот не знайдений в БД.",
        dbStatus: "unknown",
        pinnedError: null,
        lastMessageFromDB: null,
      });
    }
    const childProcess = runningBotProcesses[botData._id.toString()];
    let processActualStatus = "unknown";
    let message = `Статус процесу не визначено. Статус в БД: ${botData.status}.`;

    if (childProcess && childProcess.connected && !childProcess.killed) {
      processActualStatus =
        botData.status === "starting" ? "starting" : "running";
      message = `Процес ${
        processActualStatus === "starting" ? "запускається" : "активний"
      } (PID: ${childProcess.pid}). БД: ${botData.status}.`;
    } else {
      if (botData.status === "running" || botData.status === "starting") {
        processActualStatus = "stale";
        message = `Процес не відстежується, але в БД '${botData.status}'. Можливо, зупинився несподівано.`;
      } else if (botData.status === "error") {
        processActualStatus = "error";
        message = `Процес неактивний. В БД помилка: ${
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
      lastPinnedErrorTime: botData.lastPinnedErrorTime,
    });
  } catch (error) {
    console.error(
      `[API] Error fetching process status for bot ${botDbId}:`,
      error
    );
    res.status(500).json({
      status: "error_server",
      message: "Помилка сервера.",
      dbStatus: "unknown",
      pinnedError: "Серверна помилка",
      lastMessageFromDB: null,
    });
  }
});

router.post("/api/:id/start", async (req, res) => {
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId);
    if (!bot) {
      return res
        .status(404)
        .json({ success: false, message: "Бота не знайдено." });
    }
    await updateBotStatusAndError(
      bot.botId,
      "starting",
      "Запуск через API консоль...",
      null
    );
    await startBotProcess(bot);

    res.json({
      success: true,
      message: `Команда /start надіслана. Бот ${bot.botId} запускається.`,
    });
  } catch (error) {
    console.error(`[API /start] Error starting bot ${botDbId}:`, error);
    const botForErrorUpdate = await Bot.findById(botDbId);
    if (botForErrorUpdate) {
      await updateBotStatusAndError(
        botForErrorUpdate.botId,
        "error",
        `Помилка запуску через API: ${error.message}`,
        `Помилка запуску: ${error.message}`
      );
    }
    res
      .status(500)
      .json({ success: false, message: `Помилка сервера: ${error.message}` });
  }
});

router.post("/api/:id/stop", async (req, res) => {
  const botDbId = req.params.id;
  try {
    const bot = await Bot.findById(botDbId);
    if (!bot) {
      return res
        .status(404)
        .json({ success: false, message: "Бота не знайдено." });
    }
    console.log(`[API /stop] Stopping bot ${bot.botId} via console.`);
    await stopBotProcess(bot._id.toString(), bot.botId);
    res.json({
      success: true,
      message: `Команда /stop надіслана. Бот ${bot.botId} зупиняється.`,
    });
  } catch (error) {
    console.error(`[API /stop] Error stopping bot ${botDbId}:`, error);
    const botForErrorUpdate = await Bot.findById(botDbId);
    if (botForErrorUpdate) {
      await updateBotStatusAndError(
        botForErrorUpdate.botId,
        botForErrorUpdate.status,
        `Помилка зупинки через API: ${error.message}. Поточний статус: ${botForErrorUpdate.status}`,
        botForErrorUpdate.pinnedError
      );
    }
    res
      .status(500)
      .json({ success: false, message: `Помилка сервера: ${error.message}` });
  }
});

router.post("/api/:id/send_message_to_bot", async (req, res) => {
  const botDbId = req.params.id;
  const { messageText } = req.body;

  if (!messageText) {
    return res.status(400).json({
      success: false,
      message: "Текст повідомлення не може бути порожнім.",
    });
  }

  try {
    const botData = await Bot.findById(botDbId);
    if (!botData) {
      return res
        .status(404)
        .json({ success: false, message: "Бота не знайдено." });
    }

    const childProcess = runningBotProcesses[botData._id.toString()];
    if (childProcess && childProcess.connected && !childProcess.killed) {
      if (typeof childProcess.send === "function") {
        childProcess.send({
          type: "manager_message",
          text: messageText,
          botId: botData.botId,
        });
        console.log(
          `[API /send_message_to_bot] Sent message "${messageText.substring(
            0,
            30
          )}..." to bot ${botData.botId} via IPC.`
        );
        return res.json({
          success: true,
          message:
            "Повідомлення надіслано боту для обробки. Перевірте логи бота.",
        });
      } else {
        console.error(
          `[API /send_message_to_bot] Bot process ${botData.botId} does not have a send method.`
        );
        return res.status(500).json({
          success: false,
          message:
            "Не вдалося надіслати повідомлення: процес бота не підтримує IPC належним чином.",
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message:
          "Бот не запущений або не відповідає. Неможливо надіслати повідомлення.",
      });
    }
  } catch (error) {
    console.error(
      `[API /send_message_to_bot] Error sending message to bot ${botDbId}:`,
      error
    );
    return res
      .status(500)
      .json({ success: false, message: `Помилка сервера: ${error.message}` });
  }
});

async function initializeBotsOnStartup() {
  console.log("[Manager] Initializing bots on application startup...");
  try {
    const botsToConsider = await Bot.find({}).lean();
    if (botsToConsider.length === 0) {
      console.log("[Manager] No bots found in DB.");
      return;
    }
    for (const bot of botsToConsider) {
      const botDbIdString = bot._id.toString();
      const processExists =
        runningBotProcesses[botDbIdString] &&
        runningBotProcesses[botDbIdString].connected &&
        !runningBotProcesses[botDbIdString].killed;

      if (processExists) {
        console.log(
          `[Manager Startup] Bot ${bot.botId} process already tracked.`
        );
        if (bot.status !== "running" && bot.status !== "starting") {
          await updateBotStatusAndError(
            bot.botId,
            "starting",
            "Процес знайдено при старті, оновлення БД.",
            bot.pinnedError
          );
        }
        continue;
      }

      const absoluteBotFilePath = path.resolve(__dirname, "..", bot.filePath);
      if (await fs.pathExists(absoluteBotFilePath)) {
        if (bot.status === "running" || bot.status === "starting") {
          console.log(
            `[Manager Startup] Attempting to start bot ${bot.botId} (DB status: ${bot.status}).`
          );
          await startBotProcess(bot);
        } else {
          console.log(
            `[Manager Startup] Bot ${bot.botId} is in DB as '${bot.status}', not auto-starting.`
          );
        }
      } else {
        const errMsg = `Файл бота ${bot.filePath} для ${bot.botId} не знайдено під час ініціалізації.`;
        console.error(`[Manager Startup] ${errMsg}`);
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

module.exports = {
  router,
  initializeBotsOnStartup,
  runningBotProcesses,
  stopBotProcess,
};
