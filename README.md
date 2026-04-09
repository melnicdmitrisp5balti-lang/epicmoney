# # 🎰 EpicMoney – Online Betting Games Platform

A full-stack online gaming platform with real-time betting games, chat, and user management.

## Features

- **4 Game Modes**: Jackpot, Battle Game (Blue vs Red), Fast Game (3 players), 1vs1 Duels
- **Real-time Updates**: Socket.io WebSocket for live game state and chat
- **Economy**: 1 MDL = 10 coins; 1 MDL = 100 tickets in games
- **Authentication**: JWT + bcrypt password hashing
- **SQLite Database**: Persistent storage for users, games, bets, logs, transactions, promo codes
- **Admin API**: Full admin panel backend with statistics, user management, and moderation
- **Dark Gaming UI**: Yellow accents, modern minimal design

## Tech Stack

- **Backend**: Node.js + Express + Socket.io
- **Database**: SQLite (`better-sqlite3` / `sqlite3`)
- **Frontend**: HTML5 + CSS3 + Vanilla JavaScript
- **Auth**: JSON Web Tokens (JWT) + bcryptjs

## Quick Start

### Prerequisites
- Node.js 18+

### Installation

```bash
# Install dependencies
npm install

# Configure environment (optional)
cp .env.example .env
# Edit .env with your JWT secret

# Start server
npm start
```

Open http://localhost:3000 in your browser.

### Environment Variables

Create a `.env` file in the root:

```
PORT=3000
JWT_SECRET=your_secret_key_here
DB_PATH=./server/database.sqlite
ADMIN_PASSWORD=admin123
```

### Default Admin Credentials

The first admin account is automatically created on startup:
- **Username**: `admin`
- **Password**: `admin123` (or the value of `ADMIN_PASSWORD` env var)

Admin login endpoint: `POST /api/auth/admin-login`

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login as user |
| POST | `/api/auth/admin-login` | Login as admin |
| POST | `/api/auth/logout` | Logout (client-side token discard) |

### Users
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users` | Admin | List all users |
| GET | `/api/users/:id` | User | Get user by ID |
| GET | `/api/profile` | User | Get current user profile |
| PUT | `/api/users/:id` | Admin | Update user |
| POST | `/api/users/:id/ban` | Admin | Ban user |
| POST | `/api/users/:id/unban` | Admin | Unban user |

### Balance
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/balance` | User | Get current balance |
| POST | `/api/balance/add` | Admin | Add balance to user |
| POST | `/api/balance/withdraw` | Admin | Deduct balance from user |

### Games
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/games` | User | Create a game |
| GET | `/api/games` | Public | List active games |
| GET | `/api/games/:id` | Public | Get game info |
| POST | `/api/games/:id/join` | User | Join a game |
| POST | `/api/games/:id/finish` | User | Finish game (pick winner) |
| POST | `/api/games/:id/cancel` | Admin | Cancel game and refund |

### Bets
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/bets` | User | Place a bet |
| GET | `/api/bets/user/:id` | User | Get bets for a user |
| GET | `/api/bets` | Admin | Get all bets |

### Logs
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/logs` | Admin | Get all logs |
| GET | `/api/logs/user/:id` | Admin | Get logs for a user |

### Promo Codes
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/promo` | Admin | List all promo codes |
| POST | `/api/promo` | Admin | Create promo code |
| PUT | `/api/promo/:id` | Admin | Update promo code |
| DELETE | `/api/promo/:id` | Admin | Delete promo code |
| POST | `/api/promo/:code/use` | User | Use a promo code |

### Statistics
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/stats/dashboard` | Admin | Dashboard stats |
| GET | `/api/stats/users` | Admin | User statistics |
| GET | `/api/stats/revenue` | Admin | Revenue statistics |

### Settings
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/settings` | Admin | Get system settings |
| PUT | `/api/settings` | Admin | Update system settings |

## Database Schema

Tables: `users`, `games`, `bets`, `logs`, `promo_codes`, `transactions`, `admin_users`

The SQLite database file is created automatically at `server/database.sqlite`.

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
│   ├── db.js             # SQLite initialization and helpers
│   ├── middleware/
│   │   ├── auth.js       # JWT user middleware
│   │   └── admin.js      # JWT admin middleware
│   ├── routes/
│   │   ├── auth.js       # Authentication routes
│   │   ├── users.js      # User management
│   │   ├── games.js      # Game CRUD
│   │   ├── bets.js       # Betting
│   │   ├── balance.js    # Balance management
│   │   ├── logs.js       # Activity logs
│   │   ├── promo.js      # Promo codes
│   │   ├── stats.js      # Statistics
│   │   └── settings.js   # System settings
│   ├── models/           # Legacy Mongoose models (socket.io)
│   └── socket/           # Socket.io real-time game handlers
├── client/
│   ├── index.html        # Main game page
│   ├── login.html        # Login page
│   ├── register.html     # Registration page
│   ├── css/style.css     # Dark theme styles
│   └── js/app.js         # Frontend logic
└── package.json
```