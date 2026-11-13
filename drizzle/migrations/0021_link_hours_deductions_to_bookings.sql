-- Hours deductions were recorded without their booking, so hours-paid sessions
-- never counted as visits. Restore the link from the existing revenue ledger row
-- that already names both the booking and the hours deduction.
UPDATE public.hours_transactions h
SET booking_id = r.booking_id
FROM public.revenue_transactions r
WHERE r.hours_transaction_id = h.id
  AND r.transaction_type = 'hours_deduction'
  AND r.booking_id IS NOT NULL
  AND h.booking_id IS NULL
  AND h.type = 'deduction';
