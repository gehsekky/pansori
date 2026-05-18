-- Campaign state: persists quest progress, faction rep, and world flags across sessions

CREATE TABLE campaign_states (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL,
  campaign_id  text        NOT NULL,
  state        jsonb       NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, campaign_id)
);

ALTER TABLE game_sessions
  ADD COLUMN campaign_state_id uuid REFERENCES campaign_states(id);
