-- Trivia Game Database Schema for Supabase/PostgreSQL
-- Username + PIN Authentication System

-- Users table (replaces guests)
CREATE TABLE users (
  username text PRIMARY KEY,
  pin_hash text NOT NULL,
  created_at timestamptz DEFAULT now(),
  last_login timestamptz DEFAULT now()
);

-- Trivia results table
CREATE TABLE trivia_results (
  username text REFERENCES users(username) ON DELETE CASCADE,
  qid text NOT NULL,
  correct boolean NOT NULL,
  response_ms integer NOT NULL,
  points integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (username, qid)
);

-- Indexes for performance
CREATE INDEX idx_trivia_results_created_at ON trivia_results(created_at);
CREATE INDEX idx_trivia_results_username ON trivia_results(username);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Weekly leaderboard view
CREATE VIEW leaderboard_week AS
SELECT
  tr.username,
  SUM(tr.points) AS total_points,
  COUNT(*) FILTER (WHERE tr.correct) AS correct_count,
  COUNT(*) AS total_questions,
  AVG(tr.response_ms)::integer AS avg_response_ms
FROM trivia_results tr
JOIN users u ON tr.username = u.username
WHERE tr.created_at >= date_trunc('week', now())
GROUP BY tr.username
ORDER BY total_points DESC, correct_count DESC;

-- Daily leaderboard view
CREATE VIEW leaderboard_day AS
SELECT
  tr.username,
  SUM(tr.points) AS total_points,
  COUNT(*) FILTER (WHERE tr.correct) AS correct_count,
  COUNT(*) AS total_questions,
  AVG(tr.response_ms)::integer AS avg_response_ms
FROM trivia_results tr
JOIN users u ON tr.username = u.username
WHERE tr.created_at >= date_trunc('day', now())
GROUP BY tr.username
ORDER BY total_points DESC, correct_count DESC;

-- All-time leaderboard view
CREATE VIEW leaderboard_all AS
SELECT
  tr.username,
  SUM(tr.points) AS total_points,
  COUNT(*) FILTER (WHERE tr.correct) AS correct_count,
  COUNT(*) AS total_questions,
  AVG(tr.response_ms)::integer AS avg_response_ms
FROM trivia_results tr
JOIN users u ON tr.username = u.username
GROUP BY tr.username
ORDER BY total_points DESC, correct_count DESC;