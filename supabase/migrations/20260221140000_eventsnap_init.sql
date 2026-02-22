BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  default_timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  client_event_id text,
  title text,
  start_datetime timestamptz,
  end_datetime timestamptz,
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  location text,
  host text,
  registration_link text,
  cost text,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_event_id)
);

DROP TRIGGER IF EXISTS events_set_updated_at ON public.events;
CREATE TRIGGER events_set_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_events_user_created_at ON public.events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_user_start_datetime ON public.events(user_id, start_datetime);

CREATE TABLE IF NOT EXISTS public.extension_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text NOT NULL,
  token_prefix text NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token_hash)
);

DROP TRIGGER IF EXISTS extension_tokens_set_updated_at ON public.extension_tokens;
CREATE TRIGGER extension_tokens_set_updated_at
BEFORE UPDATE ON public.extension_tokens
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extension_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are selectable by owner" ON public.profiles;
CREATE POLICY "Profiles are selectable by owner"
ON public.profiles
FOR SELECT
USING (id = auth.uid());

DROP POLICY IF EXISTS "Profiles are insertable by owner" ON public.profiles;
CREATE POLICY "Profiles are insertable by owner"
ON public.profiles
FOR INSERT
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Profiles are updatable by owner" ON public.profiles;
CREATE POLICY "Profiles are updatable by owner"
ON public.profiles
FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Events are selectable by owner" ON public.events;
CREATE POLICY "Events are selectable by owner"
ON public.events
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Events are insertable by owner" ON public.events;
CREATE POLICY "Events are insertable by owner"
ON public.events
FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Events are updatable by owner" ON public.events;
CREATE POLICY "Events are updatable by owner"
ON public.events
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Events are deletable by owner" ON public.events;
CREATE POLICY "Events are deletable by owner"
ON public.events
FOR DELETE
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Tokens are selectable by owner" ON public.extension_tokens;
CREATE POLICY "Tokens are selectable by owner"
ON public.extension_tokens
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Tokens are insertable by owner" ON public.extension_tokens;
CREATE POLICY "Tokens are insertable by owner"
ON public.extension_tokens
FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Tokens are updatable by owner" ON public.extension_tokens;
CREATE POLICY "Tokens are updatable by owner"
ON public.extension_tokens
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Tokens are deletable by owner" ON public.extension_tokens;
CREATE POLICY "Tokens are deletable by owner"
ON public.extension_tokens
FOR DELETE
USING (user_id = auth.uid());

COMMIT;
