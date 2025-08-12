import { useState, useEffect } from 'react'
import './App.css'

const API_BASE = 'http://localhost:8000/api'

function App() {
  const [gameState, setGameState] = useState('idle') // idle, playing, result
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [timeLeft, setTimeLeft] = useState(10)
  const [result, setResult] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [stats, setStats] = useState(null)
  
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState('')

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      fetchLeaderboard()
      fetchStats()
    }
  }, [isAuthenticated])

  useEffect(() => {
    let timer
    if (gameState === 'playing' && timeLeft > 0) {
      timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
    } else if (gameState === 'playing' && timeLeft === 0) {
      handleSubmit()
    }
    return () => clearTimeout(timer)
  }, [gameState, timeLeft])

  const checkAuth = async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/check`, {
        credentials: 'include'
      })
      const data = await response.json()
      if (data.authenticated) {
        setIsAuthenticated(true)
        setCurrentUser(data.username)
      }
    } catch (error) {
      console.error('Auth check failed:', error)
    }
  }

  const handleAuth = async (e) => {
    e.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    try {
      const response = await fetch(`${API_BASE}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, pin })
      })

      const data = await response.json()
      
      if (data.success) {
        setIsAuthenticated(true)
        setCurrentUser(data.username)
        setUsername('')
        setPin('')
      } else {
        setAuthError(data.message || 'Authentication failed')
      }
    } catch (error) {
      setAuthError('Authentication failed. Please try again.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/logout`, {
        method: 'POST',
        credentials: 'include'
      })
      setIsAuthenticated(false)
      setCurrentUser('')
      setGameState('idle')
      setStats(null)
      setLeaderboard([])
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(`${API_BASE}/leaderboard?window=week&limit=10`)
      const data = await response.json()
      setLeaderboard(data)
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/user/stats`, {
        credentials: 'include'
      })
      const data = await response.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const startRound = async () => {
    try {
      const response = await fetch(`${API_BASE}/trivia/round/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({})
      })
      
      if (!response.ok) throw new Error('Failed to start round')
      
      const data = await response.json()
      setCurrentQuestion(data)
      setSelectedIndex(null)
      setTimeLeft(data.time_limit_sec)
      setGameState('playing')
      setResult(null)
    } catch (error) {
      console.error('Failed to start round:', error)
      alert('Failed to start round. Please try again.')
    }
  }

  const handleSubmit = async () => {
    if (!currentQuestion) return
    
    try {
      const response = await fetch(`${API_BASE}/trivia/round/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          qid: currentQuestion.qid,
          selected_index: selectedIndex ?? 0,
          round_token: currentQuestion.round_token
        })
      })
      
      if (!response.ok) throw new Error('Failed to submit answer')
      
      const data = await response.json()
      setResult(data)
      setGameState('result')
      fetchLeaderboard()
      fetchStats()
    } catch (error) {
      console.error('Failed to submit answer:', error)
      alert('Failed to submit answer. Please try again.')
    }
  }

  // Show auth modal if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="app">
        <div className="auth-overlay">
          <div className="auth-modal">
            <h1>Weekly Trivia Game</h1>
            <p>Enter your username and 4-digit PIN to play</p>
            
            <form onSubmit={handleAuth}>
              <div className="form-group">
                <input
                  type="text"
                  placeholder="Username (3-20 characters)"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value.toLowerCase())
                    setAuthError('')
                  }}
                  minLength={3}
                  maxLength={20}
                  pattern="[a-z0-9_-]+"
                  required
                  autoFocus
                />
              </div>
              
              <div className="form-group">
                <input
                  type="password"
                  placeholder="4-digit PIN"
                  value={pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 4)
                    setPin(val)
                    setAuthError('')
                  }}
                  maxLength={4}
                  pattern="[0-9]{4}"
                  required
                />
              </div>
              
              {authError && (
                <div className="auth-error">{authError}</div>
              )}
              
              <button 
                type="submit" 
                className="auth-btn"
                disabled={authLoading || username.length < 3 || pin.length !== 4}
              >
                {authLoading ? 'Loading...' : 'Enter Game'}
              </button>
            </form>
            
            <div className="auth-info">
              <p>First time? Your account will be created automatically.</p>
              <p>Returning? Enter your PIN to access your account.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Weekly Trivia</h1>
        {stats && (
          <div className="stats">
            <span>Welcome, {currentUser}!</span>
            <span>Progress: {stats.answered}/{stats.total_available}</span>
            <span>Points: {stats.total_points}</span>
            <button onClick={handleLogout} className="logout-btn">Logout</button>
          </div>
        )}
      </header>

      <main className="main">
        <div className="game-area">
          {gameState === 'idle' && (
            <div className="start-screen">
              <h2>Ready to test your knowledge?</h2>
              <button className="start-btn" onClick={startRound}>
                Start Game
              </button>
            </div>
          )}

          {gameState === 'playing' && currentQuestion && (
            <div className="question-screen">
              <div className="timer">⏰ {timeLeft}s</div>
              <div className="question">
                <h2>{currentQuestion.stem}</h2>
                <div className="choices">
                  {currentQuestion.choices.map((choice, index) => (
                    <button
                      key={index}
                      className={`choice ${selectedIndex === index ? 'selected' : ''}`}
                      onClick={() => setSelectedIndex(index)}
                    >
                      {String.fromCharCode(65 + index)}. {choice}
                    </button>
                  ))}
                </div>
                <button 
                  className="submit-btn"
                  onClick={handleSubmit}
                  disabled={selectedIndex === null}
                >
                  Submit Answer
                </button>
              </div>
            </div>
          )}

          {gameState === 'result' && result && (
            <div className="result-screen">
              <div className={`result ${result.correct ? 'correct' : 'incorrect'}`}>
                <h2>{result.correct ? '✅ Correct!' : '❌ Incorrect'}</h2>
                <p>Points: {result.points}</p>
                <p>Response time: {result.response_ms}ms</p>
                {!result.correct && (
                  <p>Correct answer was: {result.correct_answer}</p>
                )}
              </div>
              <button className="next-btn" onClick={startRound}>
                Next Question
              </button>
            </div>
          )}
        </div>

        <aside className="leaderboard">
          <h3>🏆 Weekly Leaderboard</h3>
          <div className="leaderboard-list">
            {leaderboard.map((player, index) => (
              <div key={index} className={`leaderboard-entry ${player.username === currentUser ? 'current-user' : ''}`}>
                <span className="rank">#{index + 1}</span>
                <span className="name">{player.username}</span>
                <span className="score">{player.total_points}pts</span>
              </div>
            ))}
          </div>
        </aside>
      </main>
    </div>
  )
}

export default App