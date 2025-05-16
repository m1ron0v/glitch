// models/bot.js
const mongoose = require("mongoose");

const botSchema = new mongoose.Schema({
  botId: {
    type: String,
    required: true,
    unique: true,
  },
  token: {
    type: String,
    required: true,
    unique: true,
  },
  statusCheckCommand: {
    type: String,
    required: true,
  },
  filePath: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["running", "stopped", "error", "starting"],
    default: "stopped",
  },
  lastMessage: {
    type: String,
    default: "",
  },
  pinnedError: {
    // Нове поле для закріпленої помилки
    type: String,
    default: null,
  },
  lastPinnedErrorTime: {
    // Нове поле: час останньої закріпленої помилки
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Bot", botSchema);
