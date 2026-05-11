const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'staff'], default: 'staff', index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
