# # 🎰 EpicMoney – Online Betting Games Platform

A full-stack online gaming platform with real-time betting games, chat, and user management.

## Features

- **4 Game Modes**: Jackpot, Battle Game (Blue vs Red), Fast Game (3 players), 1vs1 Duels
- **Real-time Updates**: Socket.io WebSocket for live game state and chat
- **Economy**: 1 MDL = 10 coins; 1 MDL = 100 tickets in games
- **Authentication**: JWT + bcrypt password hashing
- **Dark Gaming UI**: Yellow accents, modern minimal design

## Tech Stack

- **Backend**: Node.js + Express + Socket.io
- **Database**: MongoDB (Mongoose)
- **Frontend**: HTML5 + CSS3 + Vanilla JavaScript
- **Auth**: JSON Web Tokens (JWT) + bcryptjs

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### Installation

```bash
# Install dependencies
npm install

# Configure environment (optional)
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secret

# Start server
npm start
```

Open http://localhost:3000 in your browser.

### Environment Variables

Create a `.env` file in the root:

```
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/epicmoney
JWT_SECRET=your_secret_key_here
```

## Game Rules

### 🎰 Jackpot
- Players place bets (in MDL)
- 1 MDL = 100 tickets → higher bet = higher chance
- Timer starts when 2+ players joined (30 seconds)
- Animated wheel selects winner proportionally
- 5% house edge

### ⚔️ Battle Game
- Two teams: Blue and Red
- Pick your side and bet
- Timer starts when both sides have players (30 seconds)
- Winning side selected proportionally by total bets

### ⚡ Fast Game
- Max 3 players per room
- First bet sets the stake range (±10%)
- Game auto-starts when full

### 🥊 1vs1
- Create a duel with your bet amount
- Opponent must match exactly
- Winner selected by tickets

## Project Structure

```
epicmoney/
├── server/
│   ├── index.js          # Express + Socket.io entry
│   ├── models/           # Mongoose models
│   ├── routes/           # REST API routes
│   ├── middleware/        # JWT auth middleware
│   └── socket/           # Socket.io game handlers
├── client/
│   ├── index.html        # Main game page
│   ├── login.html        # Login page
│   ├── register.html     # Registration page
│   ├── css/style.css     # Dark theme styles
│   └── js/app.js         # Frontend logic
└── package.json
```

## Promo Codes (Demo)

- `EPIC100` → +100 coins
- `WELCOME50` → +50 coins
- `BONUS200` → +200 coins