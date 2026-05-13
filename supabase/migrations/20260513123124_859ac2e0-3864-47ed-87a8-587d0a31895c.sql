
-- Add join token to team registrations
ALTER TABLE public.legacy_league_team_registrations
  ADD COLUMN IF NOT EXISTS join_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_llt_reg_join_token ON public.legacy_league_team_registrations(join_token);

-- Pending row needs to carry the invite emails until payment succeeds
ALTER TABLE public.pending_legacy_league_team_registrations
  ADD COLUMN IF NOT EXISTS invite_emails text[] NOT NULL DEFAULT '{}';

-- ── Team members (roster)
CREATE TABLE IF NOT EXISTS public.legacy_league_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_registration_id uuid NOT NULL REFERENCES public.legacy_league_team_registrations(id) ON DELETE CASCADE,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('captain','member')),
  joined_via text NOT NULL DEFAULT 'invite' CHECK (joined_via IN ('captain','invite','token')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_registration_id, user_id),
  UNIQUE (league_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_llt_members_user ON public.legacy_league_team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_llt_members_league ON public.legacy_league_team_members(league_id);

ALTER TABLE public.legacy_league_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read own team" ON public.legacy_league_team_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.legacy_league_team_members m2
      WHERE m2.team_registration_id = legacy_league_team_members.team_registration_id
        AND m2.user_id = auth.uid()
    )
    OR public.is_admin_or_site_admin(auth.uid())
  );

CREATE POLICY "admins manage team members" ON public.legacy_league_team_members
  FOR ALL TO authenticated
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

-- ── Email invites
CREATE TABLE IF NOT EXISTS public.legacy_league_team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_registration_id uuid NOT NULL REFERENCES public.legacy_league_team_registrations(id) ON DELETE CASCADE,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','joined','revoked')),
  claimed_user_id uuid,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_registration_id, email)
);
CREATE INDEX IF NOT EXISTS idx_llt_invites_email ON public.legacy_league_team_invites(lower(email));
CREATE INDEX IF NOT EXISTS idx_llt_invites_league ON public.legacy_league_team_invites(league_id);

ALTER TABLE public.legacy_league_team_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "captain reads team invites" ON public.legacy_league_team_invites
  FOR SELECT TO authenticated
  USING (
    invited_by = auth.uid()
    OR claimed_user_id = auth.uid()
    OR public.is_admin_or_site_admin(auth.uid())
  );

CREATE POLICY "admins manage invites" ON public.legacy_league_team_invites
  FOR ALL TO authenticated
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

-- ── Claim invites by email (auto-join on login)
CREATE OR REPLACE FUNCTION public.claim_legacy_league_invites(_user_id uuid, _email text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  joined_count integer := 0;
BEGIN
  IF _user_id IS NULL OR _email IS NULL OR length(trim(_email)) = 0 THEN
    RETURN 0;
  END IF;

  FOR inv IN
    SELECT i.* FROM public.legacy_league_team_invites i
    WHERE i.status = 'pending'
      AND lower(i.email) = lower(_email)
      AND NOT EXISTS (
        SELECT 1 FROM public.legacy_league_team_members m
        WHERE m.league_id = i.league_id AND m.user_id = _user_id
      )
  LOOP
    BEGIN
      INSERT INTO public.legacy_league_team_members
        (team_registration_id, league_id, user_id, role, joined_via)
      VALUES (inv.team_registration_id, inv.league_id, _user_id, 'member', 'invite');

      UPDATE public.legacy_league_team_invites
      SET status = 'joined', claimed_user_id = _user_id, claimed_at = now()
      WHERE id = inv.id;

      joined_count := joined_count + 1;
    EXCEPTION WHEN unique_violation THEN
      -- already on a team in this league; just mark invite revoked-ish
      UPDATE public.legacy_league_team_invites
      SET status = 'joined', claimed_user_id = _user_id, claimed_at = now()
      WHERE id = inv.id;
    END;
  END LOOP;

  RETURN joined_count;
END;
$$;

-- ── Claim by share token
CREATE OR REPLACE FUNCTION public.claim_legacy_league_team_by_token(_user_id uuid, _token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg RECORD;
  v_count integer;
BEGIN
  IF _user_id IS NULL OR _token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_args');
  END IF;

  SELECT * INTO v_reg FROM public.legacy_league_team_registrations WHERE join_token = _token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;
  IF v_reg.payment_status <> 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_not_paid');
  END IF;

  -- Already a member?
  IF EXISTS (SELECT 1 FROM public.legacy_league_team_members
             WHERE team_registration_id = v_reg.id AND user_id = _user_id) THEN
    RETURN jsonb_build_object('ok', true, 'already_member', true,
      'league_id', v_reg.league_id, 'team_registration_id', v_reg.id, 'team_name', v_reg.team_name);
  END IF;

  -- Already on a different team in this league?
  IF EXISTS (SELECT 1 FROM public.legacy_league_team_members
             WHERE league_id = v_reg.league_id AND user_id = _user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_on_other_team');
  END IF;

  -- Capacity check
  SELECT COUNT(*) INTO v_count FROM public.legacy_league_team_members WHERE team_registration_id = v_reg.id;
  IF v_count >= v_reg.team_size THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_full');
  END IF;

  INSERT INTO public.legacy_league_team_members
    (team_registration_id, league_id, user_id, role, joined_via)
  VALUES (v_reg.id, v_reg.league_id, _user_id, 'member', 'token');

  RETURN jsonb_build_object('ok', true, 'league_id', v_reg.league_id,
    'team_registration_id', v_reg.id, 'team_name', v_reg.team_name);
END;
$$;
