
-- Private bucket for per-booking .ics calendar invites
INSERT INTO storage.buckets (id, name, public)
VALUES ('booking-ics', 'booking-ics', false)
ON CONFLICT (id) DO NOTHING;

-- Service role bypasses RLS so no INSERT policy required.
-- No SELECT policy: access only via signed URLs from edge functions.
