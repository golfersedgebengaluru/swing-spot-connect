
CREATE OR REPLACE FUNCTION public.trg_auto_create_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only auto-invoice for confirmed gateway-paid online transactions with positive amount.
  IF NEW.status = 'confirmed'
     AND COALESCE(NEW.amount, 0) > 0
     AND NEW.transaction_type IN ('guest_booking', 'payment') THEN
    PERFORM public.auto_create_invoice_for_revenue(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_create_invoice_after_revenue ON public.revenue_transactions;
CREATE TRIGGER auto_create_invoice_after_revenue
AFTER INSERT ON public.revenue_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_create_invoice();
