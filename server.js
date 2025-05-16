// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs-extra");
const session = require("express-session");
const flash = require("connect-flash");

const indexRouter = require("./routes/index");
const {
  router: botRouter,
  initializeBotsOnStartup,
  stopBotProcess: stopSingleBotProcessForShutdown,
} = require("./routes/bots"); // Оновлено для graceful shutdown

const app = express();
const PORT = process.env.PORT || 3000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("[MongoDB] Connected Successfully to MongoDB Atlas."))
  .catch((err) => console.error("[MongoDB] Connection Error:", err));

mongoose.connection.on("error", (err) => {
  console.error("[MongoDB] Mongoose runtime error:", err);
});

const appDir = path.join(__dirname, "app");
fs.ensureDirSync(appDir);
const logsDir = path.join(__dirname, "logs");
fs.ensureDirSync(logsDir);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

if (!process.env.SESSION_SECRET) {
  console.warn(
    "УВАГА: Змінна SESSION_SECRET не встановлена в .env! Використовується тимчасовий ключ. Це НЕБЕЗПЕЧНО для продакшену."
  );
}
app.use(
  session({
    secret:
      process.env.SESSION_SECRET || "temporary_very_insecure_secret_key_123!@#",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 10 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  })
);
app.use(flash());

app.use((req, res, next) => {
  res.locals.messages = {
    success: req.flash("success")[0] || null,
    error: req.flash("error")[0] || null,
    command_success: req.flash("command_success")[0] || null,
    command_error: req.flash("command_error")[0] || null,
    file_edit_success: req.flash("file_edit_success")[0] || null,
    file_edit_error: req.flash("file_edit_error")[0] || null,
    command_delete_success: req.flash("command_delete_success")[0] || null,
    command_delete_error: req.flash("command_delete_error")[0] || null,
  };
  res.locals.token = req.flash("formToken")[0] || "";
  res.locals.statusCheckCommand = req.flash("formStatusCommand")[0] || "";
  res.locals.newCommandName = req.flash("formNewCommandName")[0] || "";
  res.locals.actionCode = req.flash("formActionCode")[0] || "";
  res.locals.commandNameToDeleteValue =
    req.flash("formCommandNameToDelete")[0] || "";
  next();
});

app.use("/", indexRouter);
app.use("/bots", botRouter);

app.use((req, res, next) => {
  res.status(404).render("error", {
    pageTitle: "Помилка 404",
    message:
      "Сторінку не знайдено (404). Перевірте URL-адресу або поверніться на головну.",
    error: {},
    activeTab: "",
    navBotId: null,
  });
});

app.use((err, req, res, next) => {
  console.error("[Global Error Handler] Помилка на сервері:");
  console.error(err.message);
  console.error(err.stack);
  const statusCode = err.status || 500;
  const isDevelopment =
    process.env.NODE_ENV === "development" || !process.env.NODE_ENV;
  res.status(statusCode).render("error", {
    pageTitle: `Помилка ${statusCode}`,
    message:
      err.publicMessage ||
      `Сталася серверна помилка (${statusCode}). Спробуйте, будь ласка, пізніше.`,
    error: isDevelopment
      ? { status: statusCode, message: err.message, stack: err.stack }
      : {},
    activeTab: "",
    navBotId: null,
  });
});

const server = app.listen(PORT, async () => {
  console.log(
    `[Server] Express server is running on http://localhost:${PORT} (або ваш Glitch URL)`
  );
  console.log(
    `[Server] NODE_ENV: ${
      process.env.NODE_ENV || "not set (defaults to development-like behavior)"
    }`
  );
  if (mongoose.connection.readyState === 1) {
    console.log(
      "[Server] MongoDB вже підключено. Спроба ініціалізації ботів..."
    );
    await initializeBotsOnStartup();
  } else {
    console.warn(
      "[Server] MongoDB ще не підключено. Ініціалізація ботів буде відкладена до підключення."
    );
    mongoose.connection.once("open", async () => {
      console.log(
        "[Server] MongoDB підключено після старту сервера. Повторна спроба ініціалізації ботів..."
      );
      await initializeBotsOnStartup();
    });
  }
});

async function gracefulShutdown(signal) {
  console.log(
    `[Server] ${signal} отримано. Ініційовано коректне завершення роботи...`
  );
  server.close(async () => {
    console.log("[Server] HTTP сервер закрито.");
    const { runningBotProcesses } = require("./routes/bots"); // Отримуємо актуальний список
    if (runningBotProcesses && Object.keys(runningBotProcesses).length > 0) {
      console.log("[Server] Спроба зупинки активних процесів ботів...");
      // Нам потрібна функція stopBotProcess з routes/bots.js або експортований runningBotProcesses
      // Якщо stopSingleBotProcessForShutdown було експортовано як stopBotProcess
      const stopPromises = Object.keys(runningBotProcesses).map((botDbId) => {
        // Потрібно отримати botInternalId для логування, якщо можливо
        // Це спрощення, оскільки botInternalId не зберігається разом з процесом напряму
        return stopSingleBotProcessForShutdown(
          botDbId,
          `bot-${botDbId.substring(0, 6)}-on-shutdown`
        );
      });
      try {
        await Promise.all(stopPromises);
        console.log(
          "[Server] Всі активні процеси ботів отримали команду зупинки."
        );
      } catch (stopErr) {
        console.error(
          "[Server] Помилка під час масової зупинки ботів:",
          stopErr
        );
      }
    } else {
      console.log("[Server] Немає активних процесів ботів для зупинки.");
    }
    console.log("[Server] Спроба закриття з'єднання з MongoDB...");
    mongoose.connection
      .close(false)
      .then(() => {
        console.log("[Server] З'єднання з MongoDB успішно закрито.");
        process.exit(0);
      })
      .catch((err) => {
        console.error(
          "[Server] Помилка при закритті з'єднання з MongoDB:",
          err
        );
        process.exit(1);
      });
  });
  setTimeout(() => {
    console.error("[Server] Таймаут коректного завершення. Примусовий вихід.");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

module.exports = app;
