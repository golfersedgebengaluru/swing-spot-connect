import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * Invoice identity is now read from ONE place: the `city_invoice_identity`
 * view, which merges gst_profiles + invoice_settings (city override → global)
 * + city_invoice_profiles server-side.
 *
 * Guard: useEffectiveInvoiceSettings must read that view, honour the merged
 * template/logo/footer values, expose the override flag, and still surface the
 * extended profile fields (bank, signature, etc.) for template rendering.
 */

const rows: Record<string, any> = {};

vi.mock("@/integrations/supabase/client", () => {
  const makeBuilder = (table: string) => {
    const b: any = {};
    for (const m of ["select", "eq", "is", "order", "limit"]) b[m] = vi.fn().mockReturnValue(b);
    b.maybeSingle = vi.fn(async () => ({ data: rows[table] ?? null, error: null }));
    return b;
  };
  return { supabase: { from: vi.fn((t: string) => makeBuilder(t)) } };
});

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children,
  );

describe("useEffectiveInvoiceSettings (city_invoice_identity view)", () => {
  beforeEach(() => {
    for (const k of Object.keys(rows)) delete rows[k];
  });

  it("uses the merged view row, including extended profile fields", async () => {
    rows["invoice_settings"] = { city: null, template: "classic", logo_url: "", footer_note: "", terms: "" };
    rows["city_invoice_identity"] = {
      city: "Chennai",
      template: "modern",
      logo_url: "data:image/png;base64,AAA",
      footer_note: "Thanks",
      terms: "Net 15",
      template_overridden: true,
      bank_name: "HDFC",
      is_gst_registered: false,
    };

    const { useEffectiveInvoiceSettings } = await import("@/hooks/useInvoiceSettings");
    const { result } = renderHook(() => useEffectiveInvoiceSettings("Chennai"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data.template).toBe("modern");
    expect(result.current.data.footer_note).toBe("Thanks");
    expect(result.current.isOverridden).toBe(true);
    expect((result.current.data as any).bank_name).toBe("HDFC");
  });

  it("falls back to global settings when the city has no configuration", async () => {
    rows["invoice_settings"] = { city: null, template: "compact", logo_url: "", footer_note: "Global note", terms: "" };
    rows["city_invoice_identity"] = null;

    const { useEffectiveInvoiceSettings } = await import("@/hooks/useInvoiceSettings");
    const { result } = renderHook(() => useEffectiveInvoiceSettings("Nowhere"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data.template).toBe("compact");
    expect(result.current.data.footer_note).toBe("Global note");
    expect(result.current.isOverridden).toBe(false);
  });
});
