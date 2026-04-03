ALTER TABLE public.bays
  ADD COLUMN peak_start time DEFAULT '17:00',
  ADD COLUMN peak_end time DEFAULT '21:00';