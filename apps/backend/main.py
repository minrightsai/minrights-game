from fastapi import FastAPI, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import uuid
import random
import time
import json
from datetime import datetime, timedelta
from jose import JWTError, jwt
from typing import Optional, List
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Trivia Game API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# JWT settings
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this")
ALGORITHM = "HS256"

# In-memory storage for demo (replace with Supabase)
guests = {}
trivia_results = {}
round_sessions = {}  # Track started rounds

# Load questions
questions_df = pd.read_csv("../../data/questions.csv")
questions = questions_df.to_dict('records')

# Pydantic models
class RoundStart(BaseModel):
    display_name: Optional[str] = None

class RoundSubmit(BaseModel):
    qid: str
    selected_index: int
    round_token: str

class UpdateName(BaseModel):
    display_name: str

# Helper functions
def get_or_create_guest(request: Request, response: Response, display_name: Optional[str] = None):
    gid = request.cookies.get("gid")
    if not gid or gid not in guests:
        gid = str(uuid.uuid4())
        guests[gid] = {
            "gid": gid,
            "display_name": display_name or f"Guest-{gid[:8]}",
            "created_at": datetime.now()
        }
        response.set_cookie(
            key="gid",
            value=gid,
            httponly=True,
            samesite="lax",
            max_age=86400 * 30  # 30 days
        )
    return gid

def shuffle_choices_with_seed(choices: List[str], seed: int) -> tuple[List[str], dict]:
    random.seed(seed)
    indexed_choices = list(enumerate(choices))
    random.shuffle(indexed_choices)
    
    shuffled_choices = [choice for _, choice in indexed_choices]
    index_map = {new_idx: orig_idx for new_idx, (orig_idx, _) in enumerate(indexed_choices)}
    
    return shuffled_choices, index_map

@app.post("/api/trivia/round/start")
async def start_round(
    request: Request,
    response: Response,
    data: RoundStart = RoundStart()
):
    gid = get_or_create_guest(request, response, data.display_name)
    
    # Get a random question
    question = random.choice(questions)
    qid = question["qid"]
    
    # Check if already answered
    if f"{gid}_{qid}" in trivia_results:
        # Find a new question they haven't answered
        answered_qids = {key.split('_')[1] for key in trivia_results.keys() if key.startswith(f"{gid}_")}
        available_questions = [q for q in questions if q["qid"] not in answered_qids]
        if not available_questions:
            raise HTTPException(status_code=400, detail="No more questions available")
        question = random.choice(available_questions)
        qid = question["qid"]
    
    # Create choices array
    choices = [question["choice_a"], question["choice_b"], question["choice_c"], question["choice_d"]]
    
    # Generate shuffle seed and shuffle choices
    shuffle_seed = random.randint(1000, 9999)
    shuffled_choices, index_map = shuffle_choices_with_seed(choices, shuffle_seed)
    
    # Create round token
    token_payload = {
        "qid": qid,
        "gid": gid,
        "shuffle_seed": shuffle_seed,
        "iat": datetime.utcnow().timestamp(),
        "exp": (datetime.utcnow() + timedelta(seconds=15)).timestamp()
    }
    round_token = jwt.encode(token_payload, SECRET_KEY, algorithm=ALGORITHM)
    
    # Store round session
    round_sessions[f"{gid}_{qid}"] = {
        "started_at": datetime.now(),
        "index_map": index_map,
        "correct_key": question["correct_key"]
    }
    
    return {
        "qid": qid,
        "stem": question["stem"],
        "choices": shuffled_choices,
        "round_token": round_token,
        "time_limit_sec": 10
    }

@app.post("/api/trivia/round/submit")
async def submit_round(data: RoundSubmit, request: Request):
    gid = request.cookies.get("gid")
    if not gid:
        raise HTTPException(status_code=401, detail="No guest session")
    
    # Verify JWT token
    try:
        payload = jwt.decode(data.round_token, SECRET_KEY, algorithms=[ALGORITHM])
        token_gid = payload["gid"]
        token_qid = payload["qid"]
        
        if token_gid != gid or token_qid != data.qid:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Check expiration
        if datetime.utcnow().timestamp() > payload["exp"]:
            raise HTTPException(status_code=401, detail="Token expired")
            
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Check if already answered
    result_key = f"{gid}_{data.qid}"
    if result_key in trivia_results:
        raise HTTPException(status_code=400, detail="Question already answered")
    
    # Get round session
    session = round_sessions.get(result_key)
    if not session:
        raise HTTPException(status_code=400, detail="Round session not found")
    
    # Calculate response time
    response_ms = int((datetime.now() - session["started_at"]).total_seconds() * 1000)
    
    # Map selected index to original choice
    original_index = session["index_map"][data.selected_index]
    choice_keys = ["A", "B", "C", "D"]
    selected_key = choice_keys[original_index]
    
    # Check if correct
    correct = selected_key == session["correct_key"]
    
    # Calculate points (100 for correct + speed bonus)
    points = 0
    if correct:
        points = 100
        speed_bonus = max(0, 50 - (response_ms // 200))  # Up to 50 bonus points for speed
        points += speed_bonus
    
    # Store result
    trivia_results[result_key] = {
        "gid": gid,
        "qid": data.qid,
        "correct": correct,
        "response_ms": response_ms,
        "points": points,
        "created_at": datetime.now()
    }
    
    # Clean up session
    del round_sessions[result_key]
    
    return {
        "correct": correct,
        "points": points,
        "response_ms": response_ms,
        "correct_answer": session["correct_key"]
    }

@app.get("/api/leaderboard")
async def get_leaderboard(window: str = "week", limit: int = 25):
    # Calculate cutoff date
    now = datetime.now()
    if window == "week":
        cutoff = now - timedelta(days=7)
    elif window == "day":
        cutoff = now - timedelta(days=1)
    else:
        cutoff = datetime.min  # All time
    
    # Aggregate results by guest
    leaderboard = {}
    for result_key, result in trivia_results.items():
        if result["created_at"] >= cutoff:
            gid = result["gid"]
            if gid not in leaderboard:
                leaderboard[gid] = {
                    "gid": gid,
                    "display_name": guests[gid]["display_name"],
                    "total_points": 0,
                    "correct_count": 0,
                    "total_questions": 0,
                    "avg_response_ms": []
                }
            
            leaderboard[gid]["total_points"] += result["points"]
            leaderboard[gid]["total_questions"] += 1
            leaderboard[gid]["avg_response_ms"].append(result["response_ms"])
            
            if result["correct"]:
                leaderboard[gid]["correct_count"] += 1
    
    # Calculate averages and sort
    for entry in leaderboard.values():
        if entry["avg_response_ms"]:
            entry["avg_response_ms"] = int(sum(entry["avg_response_ms"]) / len(entry["avg_response_ms"]))
        else:
            entry["avg_response_ms"] = 0
    
    # Sort by total points, then by correct count
    sorted_leaderboard = sorted(
        leaderboard.values(),
        key=lambda x: (x["total_points"], x["correct_count"]),
        reverse=True
    )
    
    return sorted_leaderboard[:limit]

@app.post("/api/guest/name")
async def update_guest_name(data: UpdateName, request: Request):
    gid = request.cookies.get("gid")
    if not gid or gid not in guests:
        raise HTTPException(status_code=401, detail="No guest session")
    
    guests[gid]["display_name"] = data.display_name
    return {"success": True}

@app.get("/api/guest/stats")
async def get_guest_stats(request: Request):
    gid = request.cookies.get("gid")
    if not gid:
        raise HTTPException(status_code=401, detail="No guest session")
    
    # Count answered questions
    answered = len([k for k in trivia_results.keys() if k.startswith(f"{gid}_")])
    total_available = len(questions)
    
    return {
        "answered": answered,
        "total_available": total_available,
        "display_name": guests.get(gid, {}).get("display_name", "Unknown")
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)