CREATE TABLE IF NOT EXISTS profile_cache (
  handle        TEXT PRIMARY KEY,
  followers     INTEGER NOT NULL,
  avg_likes     INTEGER NOT NULL,
  avg_comments  INTEGER NOT NULL,
  posts_sampled INTEGER NOT NULL,
  scraped_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shortlist (
  id          SERIAL PRIMARY KEY,
  handle      TEXT NOT NULL,
  followers   INTEGER,
  eng_rate    NUMERIC(5,2),
  verdict     TEXT,
  notes       TEXT,
  added_by    TEXT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
