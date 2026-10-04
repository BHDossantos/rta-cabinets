-- Pilot persistence (R1). The API keeps its working state in memory and writes every
-- change through to this table inside one transaction per request, so a restart or
-- redeploy loses nothing. One API instance per database (enforced with an advisory
-- lock at startup). db/schema.sql remains the normalized target for multi-instance
-- scale-out and reporting.
CREATE TABLE IF NOT EXISTS pilot_entity (
  kind        text        NOT NULL CHECK (kind IN (
                'meta','user','project','cart','order','subscription','lead','referral','guest_token',
                'access_window','pro','stock_position','reservation','idempotency','webhook','audit')),
  id          text        NOT NULL,
  data        jsonb       NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, id)
);
