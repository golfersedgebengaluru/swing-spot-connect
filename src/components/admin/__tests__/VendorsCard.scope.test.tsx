import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VendorsCard } from "@/components/admin/VendorsCard";

// Mocks
const eqMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: (...args: any[]) => {
          eqMock(...args);
          return { order: vi.fn().mockResolvedValue({ data: [], error: null }) };
        },
      })),
    })),
  },
}));

vi.mock("@/contexts/AdminCityContext", () => ({
  useAdminCity: () => ({ selectedCity: "" }), // global = All Cities
}));

vi.mock("@/hooks/useAdmin", () => ({
  useAdmin: () => ({ isAdmin: true, assignedCities: [] }),
}));

vi.mock("@/hooks/useBookings", () => ({
  useAllCities: () => ({ data: ["Bengaluru", "Chennai"] }),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("VendorsCard city scoping", () => {
  beforeEach(() => eqMock.mockClear());

  it("uses the city prop, not the alphabetical fallback, when global is 'All Cities'", async () => {
    wrap(<VendorsCard city="Chennai" />);
    await waitFor(() => expect(eqMock).toHaveBeenCalled());
    expect(eqMock).toHaveBeenCalledWith("city", "Chennai");
    expect(eqMock).not.toHaveBeenCalledWith("city", "Bengaluru");
  });

  it("falls back to first city only when no prop and no global is set (back-compat)", async () => {
    wrap(<VendorsCard />);
    await waitFor(() => expect(eqMock).toHaveBeenCalled());
    expect(eqMock).toHaveBeenCalledWith("city", "Bengaluru");
  });
});
