
-- Add coaching_mode to bays table: 'instant' or 'approval_required'
ALTER TABLE public.bays ADD COLUMN coaching_mode text NOT NULL DEFAULT 'instant';
-- Add coaching_hours_per_session to bays (hours deducted for coaching, default 1)
ALTER TABLE public.bays ADD COLUMN coaching_hours numeric NOT NULL DEFAULT 1;

-- Add session_type to bookings: 'practice' or 'coaching'
ALTER TABLE public.bookings ADD COLUMN session_type text NOT NULL DEFAULT 'practice';

-- Also update overlap check to include 'pending' status
-- We need pending bookings to block slots too
