import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CalculatedLineItem } from "@/lib/gst-utils";

// ─── GST Profile ────────────────────────────────────────
const GST_KEYS = ["gst_legal_name", "gst_gstin", "gst_address", "gst_state", "gst_state_code", "invoice_prefix", "invoice_start_number"] as const;

export interface GstProfile {
  gst_legal_name: string;
  gst_gstin: string;
  gst_address: string;
  gst_state: string;
  gst_state_code: string;
  invoice_prefix: string;
  invoice_start_number: string;
}

export function useGstProfile() {
  return useQuery({
    queryKey: ["gst_profile"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_config")
        .select("key, value")
        .in("key", GST_KEYS as any);
      if (error) throw error;
      const profile: Record<string, string> = {};
      for (const row of data ?? []) profile[row.key] = row.value;
      return profile as unknown as GstProfile;
    },
  });
}

export function useSaveGstProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profile: Partial<GstProfile>) => {
      for (const [key, value] of Object.entries(profile)) {
        // Try update first
        const { data } = await supabase
          .from("admin_config")
          .update({ value } as any)
          .eq("key", key)
          .select("id")
          .maybeSingle();
        // If no row updated, insert
        if (!data) {
          await supabase.from("admin_config").insert({ key, value } as any);
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gst_profile"] }),
  });
}

// ─── Invoices ───────────────────────────────────────────
export interface InvoiceFilters {
  startDate?: string;
  endDate?: string;
  status?: string;
  invoiceType?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useInvoices(filters?: InvoiceFilters) {
  const page = filters?.page ?? 0;
  const pageSize = filters?.pageSize ?? 25;

  return useQuery({
    queryKey: ["invoices", filters],
    queryFn: async () => {
      let query = (supabase as any)
        .from("invoices")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (filters?.startDate) query = query.gte("invoice_date", filters.startDate);
      if (filters?.endDate) query = query.lte("invoice_date", filters.endDate);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.invoiceType) query = query.eq("invoice_type", filters.invoiceType);
      if (filters?.search) {
        query = query.or(
          `invoice_number.ilike.%${filters.search}%,customer_name.ilike.%${filters.search}%,customer_email.ilike.%${filters.search}%,customer_gstin.ilike.%${filters.search}%`
        );
      }

      query = query.range(page * pageSize, (page + 1) * pageSize - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0 };
    },
  });
}

export function useInvoiceWithItems(invoiceId: string | null) {
  return useQuery({
    queryKey: ["invoice", invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data: invoice, error } = await (supabase as any)
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();
      if (error) throw error;

      const { data: items, error: itemsError } = await (supabase as any)
        .from("invoice_line_items")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("sort_order");
      if (itemsError) throw itemsError;

      return { ...invoice, line_items: items ?? [] };
    },
  });
}

export interface CreateInvoiceParams {
  customerUserId?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerGstin?: string;
  customerState?: string;
  customerStateCode?: string;
  lineItems: CalculatedLineItem[];
  subtotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  total: number;
  paymentMethod?: string;
  revenueTransactionId?: string;
  city?: string;
  invoiceType?: string;
  creditNoteFor?: string;
}

export function useCreateInvoice() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateInvoiceParams) => {
      // 1. Get GST profile
      const { data: configRows } = await supabase
        .from("admin_config")
        .select("key, value")
        .in("key", GST_KEYS as any);
      const config: Record<string, string> = {};
      for (const r of configRows ?? []) config[r.key] = r.value;

      if (!config.gst_gstin) throw new Error("GST profile not configured. Please set up your GSTIN in Finance → GST Settings.");

      // 2. Get active financial year
      const { data: fy } = await supabase
        .from("financial_years")
        .select("*")
        .eq("is_active", true)
        .maybeSingle();
      if (!fy) throw new Error("No active financial year configured.");

      // 3. Get next invoice number
      const { data: invoiceNumber, error: seqErr } = await supabase.rpc(
        "get_next_invoice_number" as any,
        {
          p_gstin: config.gst_gstin,
          p_fy_id: fy.id,
          p_prefix: config.invoice_prefix || "INV",
          p_start: parseInt(config.invoice_start_number || "1", 10),
        }
      );
      if (seqErr) throw seqErr;

      // 4. Insert invoice
      const invoicePayload = {
        invoice_number: invoiceNumber,
        invoice_date: new Date().toISOString().split("T")[0],
        financial_year_id: fy.id,
        customer_user_id: params.customerUserId || null,
        customer_name: params.customerName,
        customer_email: params.customerEmail || null,
        customer_phone: params.customerPhone || null,
        customer_gstin: params.customerGstin || null,
        customer_state: params.customerState || null,
        customer_state_code: params.customerStateCode || null,
        business_name: config.gst_legal_name,
        business_gstin: config.gst_gstin,
        business_address: config.gst_address || null,
        business_state: config.gst_state || null,
        business_state_code: config.gst_state_code || null,
        subtotal: params.subtotal,
        cgst_total: params.cgstTotal,
        sgst_total: params.sgstTotal,
        igst_total: params.igstTotal,
        total: params.total,
        status: "issued",
        invoice_type: params.invoiceType || "invoice",
        credit_note_for: params.creditNoteFor || null,
        payment_method: params.paymentMethod || null,
        revenue_transaction_id: params.revenueTransactionId || null,
        city: params.city || null,
      };

      const { data: invoice, error: invErr } = await (supabase as any)
        .from("invoices")
        .insert(invoicePayload)
        .select()
        .single();
      if (invErr) throw invErr;

      // 5. Insert line items
      const lineItemsPayload = params.lineItems.map((item, idx) => ({
        invoice_id: invoice.id,
        item_name: item.itemName,
        item_type: item.itemType,
        hsn_code: item.hsnCode || null,
        sac_code: item.sacCode || null,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        gst_rate: item.gstRate,
        cgst_amount: item.cgstAmount,
        sgst_amount: item.sgstAmount,
        igst_amount: item.igstAmount,
        line_total: item.lineTotal,
        product_id: item.productId || null,
        sort_order: idx,
      }));

      const { error: liErr } = await (supabase as any)
        .from("invoice_line_items")
        .insert(lineItemsPayload);
      if (liErr) throw liErr;

      return invoice;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useCancelInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      // Mark original as cancelled
      await (supabase as any)
        .from("invoices")
        .update({ status: "cancelled" })
        .eq("id", invoiceId);

      // Fetch original invoice + items for credit note
      const { data: original } = await (supabase as any)
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();

      const { data: items } = await (supabase as any)
        .from("invoice_line_items")
        .select("*")
        .eq("invoice_id", invoiceId);

      if (!original) throw new Error("Invoice not found");

      // Get next number for credit note
      const { data: fy } = await supabase
        .from("financial_years")
        .select("*")
        .eq("is_active", true)
        .maybeSingle();
      if (!fy) throw new Error("No active financial year");

      const { data: cnNumber } = await supabase.rpc("get_next_invoice_number" as any, {
        p_gstin: original.business_gstin,
        p_fy_id: fy.id,
        p_prefix: "CN",
        p_start: 1,
      });

      // Create credit note
      const { data: creditNote, error: cnErr } = await (supabase as any)
        .from("invoices")
        .insert({
          invoice_number: cnNumber,
          invoice_date: new Date().toISOString().split("T")[0],
          financial_year_id: fy.id,
          customer_user_id: original.customer_user_id,
          customer_name: original.customer_name,
          customer_email: original.customer_email,
          customer_phone: original.customer_phone,
          customer_gstin: original.customer_gstin,
          customer_state: original.customer_state,
          customer_state_code: original.customer_state_code,
          business_name: original.business_name,
          business_gstin: original.business_gstin,
          business_address: original.business_address,
          business_state: original.business_state,
          business_state_code: original.business_state_code,
          subtotal: original.subtotal,
          cgst_total: original.cgst_total,
          sgst_total: original.sgst_total,
          igst_total: original.igst_total,
          total: original.total,
          status: "issued",
          invoice_type: "credit_note",
          credit_note_for: invoiceId,
          payment_method: original.payment_method,
          city: original.city,
        })
        .select()
        .single();
      if (cnErr) throw cnErr;

      // Copy line items to credit note
      if (items?.length) {
        await (supabase as any).from("invoice_line_items").insert(
          items.map((item: any) => ({
            invoice_id: creditNote.id,
            item_name: item.item_name,
            item_type: item.item_type,
            hsn_code: item.hsn_code,
            sac_code: item.sac_code,
            quantity: item.quantity,
            unit_price: item.unit_price,
            gst_rate: item.gst_rate,
            cgst_amount: item.cgst_amount,
            sgst_amount: item.sgst_amount,
            igst_amount: item.igst_amount,
            line_total: item.line_total,
            product_id: item.product_id,
            sort_order: item.sort_order,
          }))
        );
      }

      return creditNote;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}
