
-- Fix Advaith's booking: change to July 4, 2026 7:00 PM - 8:00 PM IST (UTC+5:30)
UPDATE bookings 
SET start_time = '2026-07-04 13:30:00+00',
    end_time = '2026-07-04 14:30:00+00',
    duration_minutes = 60,
    updated_at = now()
WHERE id = 'ce2483c0-c8ed-46c1-804e-9019f8b9aa16';

-- Fix Advaith's user_type to guest
UPDATE profiles SET user_type = 'guest', updated_at = now()
WHERE id = '04b31863-984a-4ff2-b5ad-7b06e4c2edee';

-- Create Lipika's profile (she had none)
INSERT INTO profiles (display_name, phone, user_type)
VALUES ('Lipika', '+91 7483 781 701', 'guest');

-- After profile creation, update Lipika's booking and invoice to point to the new profile
-- We use a CTE to get the newly created profile ID
WITH lipika AS (
  SELECT id FROM profiles WHERE display_name = 'Lipika' AND phone = '+91 7483 781 701' AND user_id IS NULL LIMIT 1
)
UPDATE bookings SET user_id = (SELECT id FROM lipika), updated_at = now()
WHERE id = 'cfc7ffe2-16de-4eb3-b1ba-3bdd89feafa5';

WITH lipika AS (
  SELECT id FROM profiles WHERE display_name = 'Lipika' AND phone = '+91 7483 781 701' AND user_id IS NULL LIMIT 1
)
UPDATE invoices SET customer_user_id = (SELECT id FROM lipika), updated_at = now()
WHERE id = 'cf9449f3-38eb-40c5-8dad-f9eb580a39ea';

-- Also update Lipika's revenue transaction
WITH lipika AS (
  SELECT id FROM profiles WHERE display_name = 'Lipika' AND phone = '+91 7483 781 701' AND user_id IS NULL LIMIT 1
)
UPDATE revenue_transactions SET user_id = (SELECT id FROM lipika), updated_at = now()
WHERE booking_id = 'cfc7ffe2-16de-4eb3-b1ba-3bdd89feafa5';
