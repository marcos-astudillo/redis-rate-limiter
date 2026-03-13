-- Rate Limiter Schema
-- Run once: npm run migrate

CREATE TABLE IF NOT EXISTS rate_limit_policies (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(64) UNIQUE NOT NULL,
  capacity      INTEGER            NOT NULL CHECK (capacity > 0),
  refill_per_sec NUMERIC(10, 4)    NOT NULL CHECK (refill_per_sec > 0),
  created_at    TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

-- Default plans: limits vary by plan per the design doc
INSERT INTO rate_limit_policies (name, capacity, refill_per_sec) VALUES
  ('free',       20,   0.33),  -- ~20 req/min  burst 20
  ('pro',        100,  1.67),  -- ~100 req/min burst 100
  ('enterprise', 1000, 16.67)  -- ~1000 req/min burst 1000
ON CONFLICT (name) DO NOTHING;
