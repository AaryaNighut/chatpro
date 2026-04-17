const express = require('express');
const router = express.Router();
const Message = require('../models/Message');

// Send Message (REST API backup, mostly socket is used)
router.post('/', async (req, res) => {
  try {
    const { sender, receiver, content } = req.body;
    const newMessage = new Message({ sender, receiver, content });
    await newMessage.save();
    res.json(newMessage);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get Messages between two users
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;
    const messages = await Message.find({
      $or: [
        { sender: from, receiver: to },
        { sender: to, receiver: from }
      ]
    }).sort({ createdAt: 1 });
    
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
