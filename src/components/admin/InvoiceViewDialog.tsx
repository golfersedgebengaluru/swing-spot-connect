import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Printer, Loader2 } from "lucide-react";
import { useInvoiceWithItems } from "@/hooks/useInvoices";
import { useDefaultCurrency } from "@/hooks/useCurrency";
import { format } from "date-fns";

interface Props {
  invoiceId: string | null;
  onClose: () => void;
}

export function InvoiceViewDialog({ invoiceId, onClose }: Props) {
  const { data: invoice, isLoading } = useInvoiceWithItems(invoiceId);
  const currency = useDefaultCurrency();
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>${invoice?.invoice_number ?? "Invoice"}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #111; padding: 24px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 24px; }
        .header-left h1 { font-size: 20px; margin-bottom: 4px; }
        .header-right { text-align: right; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
        .badge-invoice { background: #e0f2fe; color: #0369a1; }
        .badge-credit { background: #fee2e2; color: #dc2626; }
        .section { margin-bottom: 16px; }
        .section-title { font-size: 10px; font-weight: 600; text-transform: uppercase; color: #666; margin-bottom: 4px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: #f5f5f5; text-align: left; padding: 8px; font-size: 11px; font-weight: 600; border-bottom: 2px solid #ddd; }
        td { padding: 8px; border-bottom: 1px solid #eee; font-size: 11px; }
        .text-right { text-align: right; }
        .totals { margin-top: 16px; margin-left: auto; width: 280px; }
        .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
        .total-row.grand { font-weight: 700; font-size: 14px; border-top: 2px solid #111; padding-top: 8px; margin-top: 4px; }
        .footer { margin-top: 32px; text-align: center; font-size: 10px; color: #888; }
      </style></head><body>
      ${printRef.current.innerHTML}
      <script>window.onload = function() { window.print(); }</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  if (!invoiceId) return null;

  return (
    <Dialog open={!!invoiceId} onOpenChange={() => onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{invoice?.invoice_number ?? "Invoice"}</DialogTitle>
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={isLoading}>
              <Printer className="mr-2 h-4 w-4" /> Print / PDF
            </Button>
          </div>
        </DialogHeader>

        {isLoading ? (
          <Loader2 className="mx-auto h-8 w-8 animate-spin" />
        ) : invoice ? (
          <div ref={printRef}>
            {/* Header */}
            <div className="header" style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div className="header-left">
                <h1 style={{ fontSize: 18, fontWeight: 700 }}>{invoice.business_name}</h1>
                <p style={{ fontSize: 12, color: "#666" }}>GSTIN: {invoice.business_gstin}</p>
                {invoice.business_address && <p style={{ fontSize: 12, color: "#666" }}>{invoice.business_address}</p>}
                {invoice.business_state && <p style={{ fontSize: 12, color: "#666" }}>{invoice.business_state} ({invoice.business_state_code})</p>}
              </div>
              <div className="header-right" style={{ textAlign: "right" }}>
                <Badge variant={invoice.invoice_type === "credit_note" ? "destructive" : "secondary"}>
                  {invoice.invoice_type === "credit_note" ? "Credit Note" : "Tax Invoice"}
                </Badge>
                <p style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{invoice.invoice_number}</p>
                <p style={{ fontSize: 12, color: "#666" }}>{format(new Date(invoice.invoice_date), "dd MMM yyyy")}</p>
                {invoice.credit_note_for && (
                  <p style={{ fontSize: 11, color: "#666" }}>Against: {invoice.credit_note_for}</p>
                )}
              </div>
            </div>

            <Separator className="my-3" />

            {/* Customer */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "#666", marginBottom: 4 }}>Bill To</p>
              <p style={{ fontWeight: 600 }}>{invoice.customer_name}</p>
              {invoice.customer_email && <p style={{ fontSize: 12, color: "#666" }}>{invoice.customer_email}</p>}
              {invoice.customer_phone && <p style={{ fontSize: 12, color: "#666" }}>{invoice.customer_phone}</p>}
              {invoice.customer_gstin && <p style={{ fontSize: 12, color: "#666" }}>GSTIN: {invoice.customer_gstin}</p>}
            </div>

            {/* Line Items */}
            <div className="overflow-x-auto">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f5f5f5", borderBottom: "2px solid #ddd" }}>
                    <th style={{ textAlign: "left", padding: 8, fontSize: 11 }}>#</th>
                    <th style={{ textAlign: "left", padding: 8, fontSize: 11 }}>Item</th>
                    <th style={{ textAlign: "left", padding: 8, fontSize: 11 }}>Type</th>
                    <th style={{ textAlign: "left", padding: 8, fontSize: 11 }}>HSN/SAC</th>
                    <th style={{ textAlign: "right", padding: 8, fontSize: 11 }}>Qty</th>
                    <th style={{ textAlign: "right", padding: 8, fontSize: 11 }}>Unit Price</th>
                    <th style={{ textAlign: "right", padding: 8, fontSize: 11 }}>GST%</th>
                    {invoice.igst_total > 0 ? (
                      <th style={{ textAlign: "right", padding: 8, fontSize: 11 }}>IGST</th>
                    ) : (
                      <>
                        <th style={{ textAlign: "right", padding: 8, fontSize: 11 }}>CGST</th>
                        <th style={{ textAlign: "right", padding: 8, fontSize: 11 }}>SGST</th>
                      </>
                    )}
                    <th style={{ textAlign: "right", padding: 8, fontSize: 11 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoice.line_items ?? []).map((item: any, idx: number) => (
                    <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: 8 }}>{idx + 1}</td>
                      <td style={{ padding: 8 }}>{item.item_name}</td>
                      <td style={{ padding: 8 }}>
                        <Badge variant="outline" className="text-[10px]">
                          {item.item_type === "service" ? "Service" : "Product"}
                        </Badge>
                      </td>
                      <td style={{ padding: 8, fontSize: 11 }}>{item.item_type === "service" ? item.sac_code : item.hsn_code}</td>
                      <td style={{ padding: 8, textAlign: "right" }}>{item.quantity}</td>
                      <td style={{ padding: 8, textAlign: "right" }}>{currency.format(Number(item.unit_price))}</td>
                      <td style={{ padding: 8, textAlign: "right" }}>{item.gst_rate}%</td>
                      {invoice.igst_total > 0 ? (
                        <td style={{ padding: 8, textAlign: "right" }}>{currency.format(Number(item.igst_amount))}</td>
                      ) : (
                        <>
                          <td style={{ padding: 8, textAlign: "right" }}>{currency.format(Number(item.cgst_amount))}</td>
                          <td style={{ padding: 8, textAlign: "right" }}>{currency.format(Number(item.sgst_amount))}</td>
                        </>
                      )}
                      <td style={{ padding: 8, textAlign: "right", fontWeight: 600 }}>{currency.format(Number(item.line_total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div style={{ marginTop: 16, marginLeft: "auto", width: 280 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
                <span style={{ color: "#666" }}>Subtotal</span>
                <span>{currency.format(Number(invoice.subtotal))}</span>
              </div>
              {invoice.igst_total > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
                  <span style={{ color: "#666" }}>IGST</span>
                  <span>{currency.format(Number(invoice.igst_total))}</span>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
                    <span style={{ color: "#666" }}>CGST</span>
                    <span>{currency.format(Number(invoice.cgst_total))}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
                    <span style={{ color: "#666" }}>SGST</span>
                    <span>{currency.format(Number(invoice.sgst_total))}</span>
                  </div>
                </>
              )}
              <Separator className="my-1" />
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 4px", fontSize: 14, fontWeight: 700 }}>
                <span>Total</span>
                <span>{currency.format(Number(invoice.total))}</span>
              </div>
            </div>

            {invoice.payment_method && (
              <p style={{ marginTop: 16, fontSize: 12, color: "#666" }}>Payment: {invoice.payment_method}</p>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
