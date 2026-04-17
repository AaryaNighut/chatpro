const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Register or Login User
router.post('/register', async (req, res) => {
  try {
    const { email, name, avatar } = req.body;
    let user = await User.findOne({ email });
    
    if (!user) {
      user = new User({ email, name, avatar });
      await user.save();
    }
    
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get User by Email
router.get('/:email', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
