// routes/index.js
const express = require('express');
const router = express.Router();
const Bot = require('../models/bot');
const fs = require('fs-extra'); 
const path = require('path');   

router.get('/', async (req, res) => {
    try {
        const botsFromDB = await Bot.find().sort({ createdAt: -1 }).lean();

        const botsWithCommands = await Promise.all(botsFromDB.map(async (bot) => {
            const allCommands = new Set(); 

            if (bot.statusCheckCommand) {
                allCommands.add(bot.statusCheckCommand.startsWith('/') ? bot.statusCheckCommand : `/${bot.statusCheckCommand}`);
            }

            try {
                const botFilePath = path.resolve(__dirname, '..', bot.filePath); 
                if (await fs.pathExists(botFilePath)) {
                    const fileContent = await fs.readFile(botFilePath, 'utf-8');

                    const commandHandlerRegex = /\/\/\s*BOT_COMMAND_HANDLER:\s*(\/\w+)/g;
                    let match;
                    while ((match = commandHandlerRegex.exec(fileContent)) !== null) {
                        if (match[1]) {
                            allCommands.add(match[1]);
                        }
                    }

                    // Опціонально: для старих команд без маркера // BOT_COMMAND_HANDLER
                    const onTextRegex = /bot\.onText\(\s*\/^\/([a-zA-Z0-9_]+)/g; 
                    while ((match = onTextRegex.exec(fileContent)) !== null) {
                        if (match[1]) {
                           allCommands.add(`/${match[1]}`);
                        }
                    }
                }
            } catch (fileError) {
                console.error(`[IndexRoute] Error reading or parsing file for bot ${bot.botId}: ${bot.filePath}`, fileError.message);
            }
            
            return { ...bot, displayedCommands: Array.from(allCommands).sort() };
        }));

        res.render('index', {
            bots: botsWithCommands,
        });
    } catch (error) {
        console.error('[IndexRoute] Error fetching bots:', error);
        res.status(500).render('error', { 
            message: 'Помилка завантаження списку ботів.',
            error: (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) ? { status: 500, stack: error.stack, message: error.message } : {}
        });
    }
});

module.exports = router;
