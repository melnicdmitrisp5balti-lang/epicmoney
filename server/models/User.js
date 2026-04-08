const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3 },
    password: { type: String, required: true },
    coins: { type: Number, default: 1000 }, // 1 MDL = 10 coins; start with 100 MDL
    referralCode: { type: String, unique: true },
    referredBy: { type: String, default: null },
    gamesPlayed: { type: Number, default: 0 },
    gamesWon: { type: Number, default: 0 },
    totalWinnings: { type: Number, default: 0 },
    usedPromoCodes: { type: [String], default: [] },
    lastFreeCoins: { type: Date, default: null }
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Generate referral code
userSchema.pre('save', function (next) {
  if (!this.referralCode) {
    this.referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  next();
});

userSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.password);
};

// Virtual: balance in MDL
userSchema.virtual('mdl').get(function () {
  return this.coins / 10;
});

module.exports = mongoose.model('User', userSchema);
