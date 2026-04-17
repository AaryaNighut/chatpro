const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: {
    type: String, // email or ID
    required: true
  },
  receiver: {
    type: String, // email or ID
    required: true
  },
  content: {
    type: String,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);
