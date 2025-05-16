const express = require('express');
const router = express.Router();
const Bot = require('../models/bot');

// Головна сторінка - список ботів
router.get('/', async (req, res) => {
    try {
        const bots = await Bot.find().sort({ createdAt: -1 });
        res.render('index', {
            bots: bots,
            messages: { success: req.flash('success'), error: req.flash('error') }
        });
    } catch (error) {
        console.error('Error fetching bots:', error);
        res.status(500).render('error', { message: 'Помилка завантаження списку ботів.' });
    }
});

module.exports = router;
