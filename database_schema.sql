-- Trivia Game Database Schema for Supabase/PostgreSQL
-- This is the target schema when you migrate from in-memory to Supabase

-- Guest tracking table
CREATE TABLE guests (
  gid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Trivia results table
CREATE TABLE trivia_results (
  gid uuid REFERENCES guests(gid) ON DELETE CASCADE,
  qid text NOT NULL,
  correct boolean NOT NULL,
  response_ms integer NOT NULL,
  points integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (gid, qid)
);

-- Materialized view for weekly leaderboard (refresh periodically)
CREATE MATERIALIZED VIEW leaderboard_week AS
SELECT
  tr.gid,
  g.display_name,
  SUM(tr.points) AS total_points,
  COUNT(*) FILTER (WHERE tr.correct) AS correct_count,
  COUNT(*) AS total_questions,
  AVG(tr.response_ms)::integer AS avg_response_ms
FROM trivia_results tr
JOIN guests g ON tr.gid = g.gid
WHERE tr.created_at >= date_trunc('week', now())
GROUP BY tr.gid, g.display_name
ORDER BY total_points DESC, correct_count DESC;

-- Index for performance
CREATE INDEX idx_trivia_results_created_at ON trivia_results(created_at);
CREATE INDEX idx_guests_display_name ON guests(display_name);

-- Refresh the materialized view (run this periodically via cron)
-- REFRESH MATERIALIZED VIEW leaderboard_week;