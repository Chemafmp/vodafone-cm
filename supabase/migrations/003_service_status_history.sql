-- Service status history — one row per market per tick (~30s cadence)
-- 10 markets × 2880 ticks/day ≈ 28,800 rows/day (~1.4 MB/day)
-- Rows older than 25h are purged hourly by the poller (pruneHistory).

CREATE TABLE IF NOT EXISTS service_status_history (
  id          bigserial    PRIMARY KEY,
  recorded_at timestamptz  NOT NULL DEFAULT now(),
  market_id   text         NOT NULL,
  complaints  integer      NOT NULL,
  ratio       numeric(6,2) NOT NULL,
  status      text         NOT NULL,
  data_source text         NOT NULL DEFAULT 'simulated'
);

-- Efficient restore query: all markets in one shot ordered by time
CREATE INDEX IF NOT EXISTS idx_ssh_market_time
  ON service_status_history (market_id, recorded_at DESC);

-- Efficient retention DELETE sweep
CREATE INDEX IF NOT EXISTS idx_ssh_recorded_at
  ON service_status_history (recorded_at);
