CREATE OR REPLACE FUNCTION public.trg_auto_create_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Auto-invoice every confirmed, positive-amount revenue event.
  -- auto_create_invoice_for_revenue() is idempotent per revenue row
  -- (it returns the existing invoice when one is already linked), so
  -- code paths that create their own invoice can never double-count.
  IF NEW.status = 'confirmed'
     AND COALESCE(NEW.amount, 0) > 0
     AND NEW.transaction_type IN (
       'guest_booking', 'payment', 'booking', 'purchase',
       'product_order', 'league_registration', 'qc_entry'
     ) THEN
    PERFORM public.auto_create_invoice_for_revenue(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_auto_create_invoice() FROM PUBLIC, anon, authenticated;