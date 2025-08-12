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
  const [displayName, setDisplayName] = useState('')
  const [showNameDialog, setShowNameDialog] = useState(false)

  useEffect(() => {
    fetchLeaderboard()
    fetchStats()
  }, [])

  useEffect(() => {
    let timer
    if (gameState === 'playing' && timeLeft > 0) {
      timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
    } else if (gameState === 'playing' && timeLeft === 0) {
      handleSubmit()
    }
    return () => clearTimeout(timer)
  }, [gameState, timeLeft])

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
      const response = await fetch(`${API_BASE}/guest/stats`, {
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

  const updateName = async () => {
    if (!displayName.trim()) return
    
    try {
      const response = await fetch(`${API_BASE}/guest/name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ display_name: displayName })
      })
      
      if (response.ok) {
        setShowNameDialog(false)
        fetchStats()
      }
    } catch (error) {
      console.error('Failed to update name:', error)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>🧠 Weekly Trivia</h1>
        {stats && (
          <div className="stats">
            <span>Welcome, {stats.display_name}!</span>
            <span>Progress: {stats.answered}/{stats.total_available}</span>
            <button onClick={() => setShowNameDialog(true)}>Change Name</button>
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
              <div key={player.gid} className="leaderboard-entry">
                <span className="rank">#{index + 1}</span>
                <span className="name">{player.display_name}</span>
                <span className="score">{player.total_points}pts</span>
              </div>
            ))}
          </div>
        </aside>
      </main>

      {showNameDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Change Display Name</h3>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
            />
            <div className="modal-buttons">
              <button onClick={updateName}>Update</button>
              <button onClick={() => setShowNameDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
