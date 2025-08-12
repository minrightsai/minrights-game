# Weekly Trivia Game

A simple session-based trivia game with FastAPI backend and React frontend.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   npm run install:all
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your JWT secret
   ```

3. **Run development servers:**
   ```bash
   npm run dev
   ```

   This will start:
   - Backend API at http://localhost:8000
   - Frontend at http://localhost:5173

## Features

- 10-second timed questions
- Session-based guest tracking (no auth required)
- Anti-cheat measures with JWT tokens and server-side timing
- Weekly leaderboard
- Choice shuffling to prevent answer-by-position
- Responsive design

## Architecture

```
apps/
├─ frontend/     # React + Vite
└─ backend/      # FastAPI
data/
└─ questions.csv # Question bank
```

## Adding Questions

Edit `data/questions.csv` with format:
```csv
qid,category,stem,choice_a,choice_b,choice_c,choice_d,correct_key,difficulty
q001,general,"Your question?",Choice A,Choice B,Choice C,Choice D,B,easy
```

## API Endpoints

- `POST /api/trivia/round/start` - Start a new question round
- `POST /api/trivia/round/submit` - Submit answer
- `GET /api/leaderboard` - Get weekly leaderboard
- `POST /api/guest/name` - Update display name
- `GET /api/guest/stats` - Get player progress