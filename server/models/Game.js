const mongoose = require('mongoose');

const betSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  amount: { type: Number, required: true }, // in coins
  tickets: { type: Number, required: true },
  color: { type: String },
  side: { type: String } // for Battle Game: 'blue' or 'red'
});

const gameSchema = new mongoose.Schema(
  {
    gameId: { type: String, required: true, unique: true },
    type: { type: String, enum: ['jackpot', 'battle', 'fast', '1vs1'], required: true },
    status: { type: String, enum: ['waiting', 'active', 'finished'], default: 'waiting' },
    bets: [betSchema],
    pot: { type: Number, default: 0 }, // total pot in coins
    winner: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      username: String,
      amount: Number
    },
    // For Battle Game
    bluePot: { type: Number, default: 0 },
    redPot: { type: Number, default: 0 },
    // For Fast Game / 1vs1
    maxPlayers: { type: Number, default: 10 },
    minBet: { type: Number, default: 0 },
    maxBet: { type: Number, default: Infinity },
    // Timer
    endsAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Game', gameSchema);
