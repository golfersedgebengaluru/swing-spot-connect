UPDATE bookings 
SET end_time = start_time + (duration_minutes || ' minutes')::interval,
    updated_at = now()
WHERE id IN (
  '3ecb3629-2e5d-475a-8d66-4b87d7f223e0',
  '03a54282-4def-4532-8258-73a87453e8bb',
  'b4ea4981-14d9-4693-9eb0-ad97ba64e904'
);