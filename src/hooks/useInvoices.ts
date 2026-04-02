import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CalculatedLineItem } from "@/lib/gst-utils";
import { isGstRegistered } from "@/lib/gst-utils";

// ─── GST Profile (per-city) ─────────────────────────────
export interface GstProfile {
  id?: string;
  city: string;
  legal_name: string;
  gstin: string;
  address: string;
  state: string;
  state_code: string;
  invoice_prefix: string;
  invoice_start_number: number;
}

export function useGstProfile(city?: string) {
  return useQuery({
    queryKey: ["gst_profile", city],
    enabled: !!city,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("gst_profiles")
        .select("*")
        .eq("city", city)
        .maybeSingle();
      if (error) throw error;
      return (data as GstProfile | null) ?? {
        city: city!,
        legal_name: "",
        gstin: "",
        address: "",
        state: "",
        state_code: "",
        invoice_prefix: "INV",
        invoice_start_number: 1,
      };
    },
  });
}

export function useSaveGstProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profile: GstProfile) => {
      const { error } = await (supabase as any)
        .from("gst_profiles")
        .upsert(
          {
            city: profile.city,
            legal_name: profile.legal_name,
            gstin: profile.gstin,
            address: profile.address,
            state: profile.state,
            state_code: profile.state_code,
            invoice_prefix: profile.invoice_prefix,
            invoice_start_number: profile.invoice_start_number,
          },
          { onConflict: "city" }
        );
      if (error) throw error;
    },
    onSuccess: (_, profile) => qc.invalidateQueries({ queryKey: ["gst_profile", profile.city] }),
  });
}

// ─── Invoices ───────────────────────────────────────────
export interface InvoiceFilters {
  startDate?: string;
  endDate?: string;
  status?: string;
  invoiceType?: string;
  search?: string;
  city?: string;
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

      if (filters?.city) query = query.eq("city", filters.city);
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
  notes?: string;
  dueDate?: string;
  invoiceCategory?: string;
  paymentReference?: string;
  addToUserList?: boolean;
  amountPaid?: number;
  paymentStatus?: string;
  // Booking-specific
  bookingDate?: string;
  bookingStartTime?: string;
  bookingEndTime?: string;
  bookingBayId?: string;
  bookingSessionType?: string;
  bookingUserId?: string;
}

export function useCreateInvoice() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateInvoiceParams) => {
      if (!params.city) throw new Error("City is required for invoice generation.");

      // 1. Get per-city GST profile
      const { data: gstProfile, error: gstErr } = await (supabase as any)
        .from("gst_profiles")
        .select("*")
        .eq("city", params.city)
        .maybeSingle();
      if (gstErr) throw gstErr;
      if (!gstProfile) throw new Error(`GST profile not configured for ${params.city}. Please set up the GST profile in Finance → GST Settings.`);

      const gstRegistered = isGstRegistered(gstProfile.gstin);
      // Use GSTIN for sequencing if registered, otherwise use city as fallback identifier
      const sequenceGstin = gstRegistered ? gstProfile.gstin : `NOGST-${params.city}`;

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
          p_gstin: sequenceGstin,
          p_fy_id: fy.id,
          p_prefix: gstProfile.invoice_prefix || "INV",
          p_start: gstProfile.invoice_start_number || 1,
        }
      );
      if (seqErr) throw seqErr;

      // 4. Create revenue transaction first (so we can link it)
      const { data: revTxn, error: revErr } = await (supabase as any)
        .from("revenue_transactions")
        .insert({
          amount: params.total,
          user_id: params.customerUserId || null,
          transaction_type: params.invoiceCategory === "booking" ? "booking" : "purchase",
          description: `Invoice for ${params.customerName}`,
          status: "confirmed",
          city: params.city,
          gateway_name: params.paymentMethod || null,
        })
        .select()
        .single();
      if (revErr) throw revErr;

      // 5. Insert invoice
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
        business_name: gstProfile.legal_name,
        business_gstin: gstRegistered ? gstProfile.gstin : "",
        business_address: gstProfile.address || null,
        business_state: gstProfile.state || null,
        business_state_code: gstProfile.state_code || null,
        subtotal: params.subtotal,
        cgst_total: params.cgstTotal,
        sgst_total: params.sgstTotal,
        igst_total: params.igstTotal,
        total: params.total,
        status: "issued",
        invoice_type: params.invoiceType || "invoice",
        credit_note_for: params.creditNoteFor || null,
        payment_method: params.paymentMethod || null,
        revenue_transaction_id: revTxn.id,
        city: params.city,
        notes: params.notes || null,
        due_date: params.dueDate || new Date().toISOString().split("T")[0],
        invoice_category: params.invoiceCategory || "purchase",
        payment_reference: params.paymentReference || null,
        amount_paid: params.amountPaid ?? params.total,
        payment_status: params.paymentStatus || "paid",
      };

      const { data: invoice, error: invErr } = await (supabase as any)
        .from("invoices")
        .insert(invoicePayload)
        .select()
        .single();
      if (invErr) throw invErr;

      // 6. Insert line items
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

      // 6b. Auto-create profile for new customers if needed
      const shouldCreateProfile =
        !params.customerUserId &&
        params.customerName &&
        ((params.invoiceCategory === "booking") || (params.invoiceCategory === "purchase" && params.addToUserList));

      let createdProfileId: string | null = null;
      if (shouldCreateProfile) {
        // Check if profile already exists by email
        let existingProfile = null;
        if (params.customerEmail) {
          const { data } = await (supabase as any)
            .from("profiles")
            .select("id, user_id")
            .eq("email", params.customerEmail)
            .maybeSingle();
          existingProfile = data;
        }

        if (!existingProfile) {
          const { data: newProfile, error: profErr } = await (supabase as any)
            .from("profiles")
            .insert({
              display_name: params.customerName,
              email: params.customerEmail || null,
              phone: params.customerPhone || null,
              preferred_city: params.city || null,
              user_type: "registered",
            })
            .select()
            .single();
          if (profErr) throw profErr;
          createdProfileId = newProfile.id;

          // Link invoice and revenue to the new profile
          await (supabase as any).from("invoices").update({ customer_user_id: newProfile.id }).eq("id", invoice.id);
          await (supabase as any).from("revenue_transactions").update({ user_id: newProfile.id }).eq("id", revTxn.id);
        } else {
          createdProfileId = existingProfile.id;
          const linkId = existingProfile.user_id || existingProfile.id;
          await (supabase as any).from("invoices").update({ customer_user_id: linkId }).eq("id", invoice.id);
          await (supabase as any).from("revenue_transactions").update({ user_id: linkId }).eq("id", revTxn.id);
        }
      }

      // 7. If booking category, create a booking record
      if (params.invoiceCategory === "booking" && params.bookingDate && params.bookingStartTime && params.bookingEndTime) {
        const startDateTime = `${params.bookingDate}T${params.bookingStartTime}:00`;
        const endDateTime = `${params.bookingDate}T${params.bookingEndTime}:00`;
        const startD = new Date(startDateTime);
        const endD = new Date(endDateTime);
        const durationMinutes = Math.max(Math.round((endD.getTime() - startD.getTime()) / 60000), 0);

        const bookingPayload: Record<string, any> = {
          user_id: params.bookingUserId || params.customerUserId || createdProfileId || null,
          city: params.city,
          start_time: startDateTime,
          end_time: endDateTime,
          duration_minutes: durationMinutes,
          status: "confirmed",
          session_type: params.bookingSessionType || "practice",
          note: `Invoice ${invoiceNumber}`,
        };
        if (params.bookingBayId) {
          bookingPayload.bay_id = params.bookingBayId;
        }

        const { data: booking, error: bookErr } = await (supabase as any)
          .from("bookings")
          .insert(bookingPayload)
          .select()
          .single();
        if (bookErr) throw bookErr;

        // Link booking to revenue transaction
        await (supabase as any)
          .from("revenue_transactions")
          .update({ booking_id: booking.id })
          .eq("id", revTxn.id);
      }

      return invoice;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["revenue_transactions"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["profile_search"] });
    },
  });
}

export interface UpdateInvoiceParams {
  invoiceId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerGstin?: string;
  customerState?: string;
  customerStateCode?: string;
  invoiceDate?: string;
  paymentMethod?: string;
  lineItems?: CalculatedLineItem[];
  subtotal?: number;
  cgstTotal?: number;
  sgstTotal?: number;
  igstTotal?: number;
  total?: number;
  notes?: string;
  dueDate?: string;
  invoiceCategory?: string;
  paymentReference?: string;
  amountPaid?: number;
  paymentStatus?: string;
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: UpdateInvoiceParams) => {
      const { invoiceId, lineItems, ...invoiceFields } = params;
      const updatePayload: Record<string, any> = {};
      if (invoiceFields.customerName !== undefined) updatePayload.customer_name = invoiceFields.customerName;
      if (invoiceFields.customerEmail !== undefined) updatePayload.customer_email = invoiceFields.customerEmail || null;
      if (invoiceFields.customerPhone !== undefined) updatePayload.customer_phone = invoiceFields.customerPhone || null;
      if (invoiceFields.customerGstin !== undefined) updatePayload.customer_gstin = invoiceFields.customerGstin || null;
      if (invoiceFields.customerState !== undefined) updatePayload.customer_state = invoiceFields.customerState || null;
      if (invoiceFields.customerStateCode !== undefined) updatePayload.customer_state_code = invoiceFields.customerStateCode || null;
      if (invoiceFields.invoiceDate !== undefined) updatePayload.invoice_date = invoiceFields.invoiceDate;
      if (invoiceFields.paymentMethod !== undefined) updatePayload.payment_method = invoiceFields.paymentMethod || null;
      if (invoiceFields.subtotal !== undefined) updatePayload.subtotal = invoiceFields.subtotal;
      if (invoiceFields.cgstTotal !== undefined) updatePayload.cgst_total = invoiceFields.cgstTotal;
      if (invoiceFields.sgstTotal !== undefined) updatePayload.sgst_total = invoiceFields.sgstTotal;
      if (invoiceFields.igstTotal !== undefined) updatePayload.igst_total = invoiceFields.igstTotal;
      if (invoiceFields.total !== undefined) updatePayload.total = invoiceFields.total;
      if (invoiceFields.notes !== undefined) updatePayload.notes = invoiceFields.notes || null;
      if (invoiceFields.dueDate !== undefined) updatePayload.due_date = invoiceFields.dueDate || null;
      if (invoiceFields.invoiceCategory !== undefined) updatePayload.invoice_category = invoiceFields.invoiceCategory;
      if (invoiceFields.paymentReference !== undefined) updatePayload.payment_reference = invoiceFields.paymentReference || null;

      if (Object.keys(updatePayload).length > 0) {
        const { error } = await (supabase as any).from("invoices").update(updatePayload).eq("id", invoiceId);
        if (error) throw error;
      }

      if (lineItems) {
        await (supabase as any).from("invoice_line_items").delete().eq("invoice_id", invoiceId);
        const payload = lineItems.map((item, idx) => ({
          invoice_id: invoiceId,
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
        const { error: liErr } = await (supabase as any).from("invoice_line_items").insert(payload);
        if (liErr) throw liErr;
      }
    },
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", params.invoiceId] });
    },
  });
}

export function useCancelInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      await (supabase as any)
        .from("invoices")
        .update({ status: "cancelled" })
        .eq("id", invoiceId);

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

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data: invoice, error: fetchErr } = await (supabase as any)
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();
      if (fetchErr) throw fetchErr;
      if (!invoice) throw new Error("Invoice not found");

      const parts = (invoice.invoice_number as string).split("/");
      const seqNumber = parts.length >= 3 ? parseInt(parts[parts.length - 1], 10) : null;
      const prefix = parts.length >= 3 ? parts[0] : "INV";

      if (seqNumber && invoice.financial_year_id && invoice.business_gstin) {
        await (supabase as any).from("recycled_invoice_numbers").insert({
          gstin: invoice.business_gstin,
          financial_year_id: invoice.financial_year_id,
          prefix,
          number: seqNumber,
          invoice_number_text: invoice.invoice_number,
        });
      }

      await (supabase as any).from("invoice_line_items").delete().eq("invoice_id", invoiceId);
      const { error: delErr } = await (supabase as any).from("invoices").delete().eq("id", invoiceId);
      if (delErr) throw delErr;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}
