REVOKE ALL ON TABLE public.booking_cancellation_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.booking_cancellation_receipts TO service_role;