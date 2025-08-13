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
  
  // State for text-based questions
  const [textAnswer, setTextAnswer] = useState('')
  const [submittedAnswers, setSubmittedAnswers] = useState([])
  
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
      handleTimeExpired()
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
    if (!isAuthenticated) return
    
    try {
      const response = await fetch(`${API_BASE}/user/stats`, {
        credentials: 'include'
      })
      
      if (response.status === 401) {
        setIsAuthenticated(false)
        setCurrentUser('')
        setStats(null)
        return
      }
      
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
      
      if (response.status === 401) {
        setIsAuthenticated(false)
        setCurrentUser('')
        setStats(null)
        return
      }
      
      if (!response.ok) throw new Error('Failed to start round')
      
      const data = await response.json()
      setCurrentQuestion(data)
      setSelectedIndex(null)
      setTextAnswer('')
      setSubmittedAnswers([])
      setTimeLeft(data.time_limit_sec)
      setGameState('playing')
      setResult(null)
    } catch (error) {
      console.error('Failed to start round:', error)
      alert('Failed to start round. Please try again.')
    }
  }

  const handleSubmit = async (textAnswer = null) => {
    if (!currentQuestion) return
    
    try {
      const submitData = {
        qid: currentQuestion.qid,
        round_token: currentQuestion.round_token
      }
      
      // Add appropriate answer data based on question type
      if (currentQuestion.question_type === 'multiple_choice') {
        submitData.selected_index = selectedIndex ?? 0
      } else {
        submitData.text_answer = textAnswer
      }
      
      const response = await fetch(`${API_BASE}/trivia/round/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(submitData)
      })
      
      if (response.status === 401) {
        setIsAuthenticated(false)
        setCurrentUser('')
        setStats(null)
        setGameState('idle')
        return
      }
      
      if (!response.ok) throw new Error('Failed to submit answer')
      
      const data = await response.json()
      
      // Handle intermediate results for multiple answer questions
      if (data.is_intermediate) {
        // Don't change game state, just show feedback
        console.log(`Answer ${data.correct ? 'correct' : 'incorrect'}. ${data.submitted_count}/${data.total_answers} found.`)
        return
      }
      
      setResult(data)
      setGameState('result')
      fetchLeaderboard()
      fetchStats()
    } catch (error) {
      console.error('Failed to submit answer:', error)
      alert('Failed to submit answer. Please try again.')
    }
  }

  const handleTimeExpired = async () => {
    if (!currentQuestion) return
    
    // For multiple answer questions, finalize the round
    if (currentQuestion.question_type === 'fill_blank_multiple') {
      try {
        const response = await fetch(`${API_BASE}/trivia/round/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ qid: currentQuestion.qid })
        })
        
        if (response.ok) {
          const data = await response.json()
          setResult(data)
          setGameState('result')
          fetchLeaderboard()
          fetchStats()
        }
      } catch (error) {
        console.error('Failed to finalize round:', error)
      }
    } else {
      // For other question types, submit with current answer or null
      handleSubmit(textAnswer || null)
    }
  }

  // Component for fill-in-the-blank multiple answers
  const FillBlankMultiple = ({ question, onSubmit }) => {
    const [feedback, setFeedback] = useState('')
    
    const handleSubmitAnswer = async (e) => {
      e.preventDefault()
      if (!textAnswer.trim()) return
      
      const answer = textAnswer.trim()
      
      // Submit the answer
      try {
        const submitData = {
          qid: question.qid,
          text_answer: answer,
          round_token: question.round_token
        }
        
        const response = await fetch(`${API_BASE}/trivia/round/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(submitData)
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.is_intermediate) {
            if (data.correct) {
              setSubmittedAnswers(prev => [...prev, answer])
              setFeedback(`✅ Correct! (${data.submitted_count}/${data.total_answers})`)
            } else {
              setFeedback(`❌ Try again...`)
            }
            setTextAnswer('')
            setTimeout(() => setFeedback(''), 2000)
          }
        }
      } catch (error) {
        console.error('Failed to submit answer:', error)
      }
    }

    return (
      <div className="fill-blank-multiple">
        <h2>{question.stem}</h2>
        {feedback && (
          <div className={`feedback ${feedback.includes('✅') ? 'correct' : 'incorrect'}`}>
            {feedback}
          </div>
        )}
        <div className="submitted-answers">
          <h4>Your answers ({submittedAnswers.length}/{question.max_answers}):</h4>
          {submittedAnswers.map((answer, index) => (
            <div key={index} className="submitted-answer">
              {index + 1}. {answer}
            </div>
          ))}
        </div>
        {submittedAnswers.length < question.max_answers && (
          <form onSubmit={handleSubmitAnswer} className="answer-form">
            <input
              type="text"
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              placeholder="Enter your answer..."
              autoFocus
            />
            <button type="submit" disabled={!textAnswer.trim()}>
              Submit Answer
            </button>
          </form>
        )}
        {submittedAnswers.length === question.max_answers && (
          <div className="all-answers-submitted">
            All answers submitted! Waiting for time to expire...
          </div>
        )}
      </div>
    )
  }

  // Component for fill-in-the-blank single answer
  const FillBlankSingle = ({ question, onSubmit }) => {
    const handleSubmitAnswer = (e) => {
      e.preventDefault()
      if (!textAnswer.trim()) return
      onSubmit(textAnswer.trim())
    }

    return (
      <div className="fill-blank-single">
        <h2>{question.stem}</h2>
        <form onSubmit={handleSubmitAnswer} className="answer-form">
          <input
            type="text"
            value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
            placeholder="Enter your answer..."
            autoFocus
          />
          <button type="submit" disabled={!textAnswer.trim()}>
            Submit Answer
          </button>
        </form>
      </div>
    )
  }

  // Component for image identification
  const ImageIdentify = ({ question, onSubmit }) => {
    const handleSubmitAnswer = (e) => {
      e.preventDefault()
      if (!textAnswer.trim()) return
      onSubmit(textAnswer.trim())
    }

    return (
      <div className="image-identify">
        <h2>{question.stem}</h2>
        <div className="image-container">
          <img 
            src={`/${question.image_filename}`} 
            alt="Question image"
            style={{ maxWidth: '400px', maxHeight: '300px' }}
            onError={(e) => {
              e.target.style.display = 'none'
              e.target.nextSibling.style.display = 'block'
            }}
          />
          <div style={{ display: 'none', padding: '2rem', background: '#f0f0f0', borderRadius: '8px' }}>
            Image: {question.image_filename}
          </div>
        </div>
        <form onSubmit={handleSubmitAnswer} className="answer-form">
          <input
            type="text"
            value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
            placeholder="What do you see in this image?"
            autoFocus
          />
          <button type="submit" disabled={!textAnswer.trim()}>
            Submit Answer
          </button>
        </form>
      </div>
    )
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
              {stats && stats.answered > 0 ? (
                <div>
                  <h2>Game Complete!</h2>
                  <p>You've finished the weekly trivia. Check back next week for new questions!</p>
                  <p>Your final score: {stats.total_points} points</p>
                </div>
              ) : (
                <div>
                  <h2>Ready to test your knowledge?</h2>
                  <button className="start-btn" onClick={startRound}>
                    Start Game
                  </button>
                </div>
              )}
            </div>
          )}

          {gameState === 'playing' && currentQuestion && (
            <div className="question-screen">
              <div className="timer">⏰ {timeLeft}s</div>
              <div className="question">
                {currentQuestion.question_type === 'multiple_choice' && (
                  <>
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
                      onClick={() => handleSubmit()}
                      disabled={selectedIndex === null}
                    >
                      Submit Answer
                    </button>
                  </>
                )}
                
                {currentQuestion.question_type === 'fill_blank_single' && (
                  <FillBlankSingle question={currentQuestion} onSubmit={handleSubmit} />
                )}
                
                {currentQuestion.question_type === 'fill_blank_multiple' && (
                  <FillBlankMultiple question={currentQuestion} onSubmit={handleSubmit} />
                )}
                
                {currentQuestion.question_type === 'image_identify' && (
                  <ImageIdentify question={currentQuestion} onSubmit={handleSubmit} />
                )}
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