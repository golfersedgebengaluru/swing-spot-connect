UPDATE public.invoice_line_items ili
SET product_id = p.id
FROM public.products p
WHERE p.sku = 'SVC-GLB-COA-APEXLY-NTM'
  AND ili.product_id IS NULL
  AND ili.item_name LIKE 'Apexlynx Coaching 30%';