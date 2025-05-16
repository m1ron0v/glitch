require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs-extra");
const session = require("express-session");
const flash = require("connect-flash");

const indexRouter = require("./routes/index");
const { router: botRouter, initializeBotsOnStartup } = require("./routes/bots"); // runningBotProcesses не експортується/не потрібне тут

const app = express();
const PORT = process.env.PORT || 3000;

// Налаштування Mongoose
// mongoose.set('strictQuery', true); // Розкоментуйте, якщо Mongoose видає попередження про strictQuery
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

// Створення папки 'app' якщо її немає
const appDir = path.join(__dirname, "app");
fs.ensureDirSync(appDir);

// Створення папки 'logs' якщо її немає (НОВЕ)
const logsDir = path.join(__dirname, "logs");
fs.ensureDirSync(logsDir);

// Налаштування EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Налаштування для flash повідомлень та сесій
if (!process.env.SESSION_SECRET) {
  console.warn(
    "УВАГА: Змінна SESSION_SECRET не встановлена! Використовується тимчасовий ключ. Встановіть її у .env для безпеки."
  );
}
app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "temporary_fallback_secret_key_for_session_12345!@#$$",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 5 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    },
  })
);
app.use(flash());

// Middleware для передачі flash повідомлень та значень форм до всіх шаблонів
app.use((req, res, next) => {
  const successMessages = req.flash("success");
  const errorMessages = req.flash("error");
  const commandSuccessMsg = req.flash("command_success");
  const commandErrorMsg = req.flash("command_error");
  const fileEditSuccessMsg = req.flash("file_edit_success");
  const fileEditErrorMsg = req.flash("file_edit_error");

  res.locals.messages = {
    success: successMessages.length > 0 ? successMessages[0] : null,
    error: errorMessages.length > 0 ? errorMessages[0] : null,
    command_success: commandSuccessMsg.length > 0 ? commandSuccessMsg[0] : null,
    command_error: commandErrorMsg.length > 0 ? commandErrorMsg[0] : null,
    file_edit_success:
      fileEditSuccessMsg.length > 0 ? fileEditSuccessMsg[0] : null,
    file_edit_error: fileEditErrorMsg.length > 0 ? fileEditErrorMsg[0] : null,
  };

  res.locals.newCommandName = req.flash("formNewCommandName")[0] || "";
  res.locals.actionCode = req.flash("formActionCode")[0] || "";
  res.locals.token = req.flash("formToken")[0] || "";
  res.locals.statusCheckCommand = req.flash("formStatusCommand")[0] || "";

  next();
});

// Маршрути
app.use("/", indexRouter);
app.use("/bots", botRouter);

// Обробка помилки 404
app.use((req, res, next) => {
  res.status(404).render("error", {
    message: "Сторінку не знайдено (404). Перевірте URL-адресу.",
    error: {},
  });
});

// Глобальний обробник помилок сервера
app.use((err, req, res, next) => {
  console.error("Global Error Handler Triggered:");
  console.error(err.stack || err);

  const statusCode = err.status || 500;
  const isDevelopment =
    process.env.NODE_ENV === "development" || !process.env.NODE_ENV;

  res.status(statusCode).render("error", {
    message:
      err.message ||
      `Сталася серверна помилка (${statusCode}). Спробуйте пізніше.`,
    error: isDevelopment
      ? { status: statusCode, stack: err.stack, message: err.message }
      : {},
  });
});

// Запуск сервера
app.listen(PORT, async () => {
  console.log(
    `Server is running on http://localhost:${PORT} or your Glitch URL`
  );
  if (mongoose.connection.readyState === 1) {
    console.log("MongoDB is connected. Attempting to initialize bots...");
    await initializeBotsOnStartup();
  } else {
    console.warn(
      "MongoDB is not connected yet. Bots will not be initialized at startup. Check connection."
    );
    mongoose.connection.once("open", async () => {
      console.log(
        "MongoDB connected after server start. Re-attempting bot initialization..."
      );
      await initializeBotsOnStartup();
    });
  }
});

// Обробка "чистого" виходу з додатку
async function gracefulShutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);

  // Отримуємо runningBotProcesses з модуля bots.js, якщо він експортується
  // Якщо ні, то ця частина не спрацює для зупинки ботів при виході.
  // У попередній версії routes/bots.js runningBotProcesses не експортувався.
  // Для простоти, зараз ця логіка може не зупиняти ботів коректно при SIGTERM/SIGINT на Glitch,
  // оскільки Glitch може просто вбити процес.
  // const { runningBotProcesses: activeBots } = require('./routes/bots'); // Потребує експорту з bots.js

  console.log("Attempting to close MongoDB connection...");
  mongoose.connection
    .close(false)
    .then(() => {
      console.log("MongoDb connection closed.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error closing MongoDB connection during shutdown:", err);
      process.exit(1);
    });

  // Даємо трохи часу на закриття з'єднання
  setTimeout(() => {
    console.error("MongoDB connection close timed out. Forcing exit.");
    process.exit(1);
  }, 5000); // 5 секунд таймаут
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
