from fastapi import FastAPI, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
import pandas as pd
import random
import time
import bcrypt
from datetime import datetime, timedelta
from jose import JWTError, jwt
from typing import Optional, List
import os
from dotenv import load_dotenv
from supabase import create_client, Client

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

# Supabase client
supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_ANON_KEY")
)

# JWT settings
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this")
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 7

# In-memory storage for round sessions (temporary, doesn't need persistence)
round_sessions = {}

# Load questions
questions_df = pd.read_csv("../../data/questions.csv")
questions = questions_df.to_dict('records')

# Pydantic models
class AuthRequest(BaseModel):
    username: str
    pin: str
    
    @validator('username')
    def validate_username(cls, v):
        if not v or len(v) < 3 or len(v) > 20:
            raise ValueError('Username must be 3-20 characters')
        if not v.replace('_', '').replace('-', '').isalnum():
            raise ValueError('Username can only contain letters, numbers, underscores, and hyphens')
        return v.lower()
    
    @validator('pin')
    def validate_pin(cls, v):
        if not v.isdigit() or len(v) != 4:
            raise ValueError('PIN must be exactly 4 digits')
        return v

class RoundStart(BaseModel):
    pass

class RoundSubmit(BaseModel):
    qid: str
    selected_index: int
    round_token: str

# Helper functions
def hash_pin(pin: str) -> str:
    """Hash a PIN using bcrypt"""
    return bcrypt.hashpw(pin.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_pin(pin: str, hashed: str) -> bool:
    """Verify a PIN against its hash"""
    return bcrypt.checkpw(pin.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(username: str) -> str:
    """Create a JWT token for a user"""
    expire = datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS)
    to_encode = {
        "sub": username,
        "exp": expire,
        "iat": datetime.utcnow()
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(request: Request) -> str:
    """Get the current authenticated user from JWT token"""
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def shuffle_choices_with_seed(choices: List[str], seed: int) -> tuple[List[str], dict]:
    random.seed(seed)
    indexed_choices = list(enumerate(choices))
    random.shuffle(indexed_choices)
    
    shuffled_choices = [choice for _, choice in indexed_choices]
    index_map = {new_idx: orig_idx for new_idx, (orig_idx, _) in enumerate(indexed_choices)}
    
    return shuffled_choices, index_map

@app.post("/api/auth")
async def authenticate(data: AuthRequest, response: Response):
    """Combined login/register endpoint"""
    try:
        # Check if user exists
        result = supabase.table('users').select('*').eq('username', data.username).execute()
        
        if result.data:
            # User exists - verify PIN
            user = result.data[0]
            if not verify_pin(data.pin, user['pin_hash']):
                return {
                    "success": False,
                    "message": "Username not available, input correct PIN"
                }
            
            # Update last login
            supabase.table('users').update({
                'last_login': datetime.utcnow().isoformat()
            }).eq('username', data.username).execute()
            
        else:
            # New user - create account
            hashed_pin = hash_pin(data.pin)
            supabase.table('users').insert({
                'username': data.username,
                'pin_hash': hashed_pin,
                'created_at': datetime.utcnow().isoformat(),
                'last_login': datetime.utcnow().isoformat()
            }).execute()
        
        # Create JWT token and set cookie
        token = create_access_token(data.username)
        response.set_cookie(
            key="access_token",
            value=token,
            httponly=True,
            samesite="lax",
            max_age=86400 * TOKEN_EXPIRE_DAYS
        )
        
        return {
            "success": True,
            "username": data.username,
            "message": "Authentication successful"
        }
        
    except Exception as e:
        print(f"Auth error: {e}")
        raise HTTPException(status_code=500, detail="Authentication failed")

@app.post("/api/logout")
async def logout(response: Response):
    """Clear the authentication cookie"""
    response.delete_cookie("access_token")
    return {"success": True}

@app.get("/api/auth/check")
async def check_auth(request: Request):
    """Check if user is authenticated"""
    try:
        username = get_current_user(request)
        return {"authenticated": True, "username": username}
    except:
        return {"authenticated": False}

@app.post("/api/trivia/round/start")
async def start_round(username: str = Depends(get_current_user)):
    """Start a new trivia round"""
    # Get questions already answered by this user
    result = supabase.table('trivia_results').select('qid').eq('username', username).execute()
    answered_qids = {r['qid'] for r in result.data} if result.data else set()
    
    # Find an unanswered question
    available_questions = [q for q in questions if q['qid'] not in answered_qids]
    
    if not available_questions:
        # User has answered all questions
        available_questions = questions  # Allow replaying questions
    
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
        "username": username,
        "shuffle_seed": shuffle_seed,
        "iat": datetime.utcnow().timestamp(),
        "exp": (datetime.utcnow() + timedelta(seconds=15)).timestamp()
    }
    round_token = jwt.encode(token_payload, SECRET_KEY, algorithm=ALGORITHM)
    
    # Store round session
    round_sessions[f"{username}_{qid}"] = {
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
async def submit_round(data: RoundSubmit, username: str = Depends(get_current_user)):
    """Submit an answer for a trivia round"""
    # Verify JWT token
    try:
        payload = jwt.decode(data.round_token, SECRET_KEY, algorithms=[ALGORITHM])
        token_username = payload["username"]
        token_qid = payload["qid"]
        
        if token_username != username or token_qid != data.qid:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Check expiration
        if datetime.utcnow().timestamp() > payload["exp"]:
            raise HTTPException(status_code=401, detail="Token expired")
            
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Check if already answered
    result = supabase.table('trivia_results').select('*').eq('username', username).eq('qid', data.qid).execute()
    if result.data:
        raise HTTPException(status_code=400, detail="Question already answered")
    
    # Get round session
    session_key = f"{username}_{data.qid}"
    session = round_sessions.get(session_key)
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
    
    # Store result in Supabase
    supabase.table('trivia_results').insert({
        'username': username,
        'qid': data.qid,
        'correct': correct,
        'response_ms': response_ms,
        'points': points,
        'created_at': datetime.utcnow().isoformat()
    }).execute()
    
    # Clean up session
    del round_sessions[session_key]
    
    return {
        "correct": correct,
        "points": points,
        "response_ms": response_ms,
        "correct_answer": session["correct_key"]
    }

@app.get("/api/leaderboard")
async def get_leaderboard(window: str = "week", limit: int = 25):
    """Get the leaderboard"""
    # Use the appropriate view based on window
    if window == "week":
        view_name = "leaderboard_week"
    elif window == "day":
        view_name = "leaderboard_day"
    else:
        view_name = "leaderboard_all"
    
    result = supabase.table(view_name).select('*').limit(limit).execute()
    
    return result.data if result.data else []

@app.get("/api/user/stats")
async def get_user_stats(username: str = Depends(get_current_user)):
    """Get stats for the current user"""
    # Get count of answered questions
    result = supabase.table('trivia_results').select('qid', count='exact').eq('username', username).execute()
    answered = result.count if result else 0
    
    # Total available questions
    total_available = len(questions)
    
    # Get user's total points
    stats_result = supabase.table('trivia_results').select('points, correct').eq('username', username).execute()
    
    total_points = sum(r['points'] for r in stats_result.data) if stats_result.data else 0
    correct_count = sum(1 for r in stats_result.data if r['correct']) if stats_result.data else 0
    
    return {
        "username": username,
        "answered": answered,
        "total_available": total_available,
        "total_points": total_points,
        "correct_count": correct_count
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)