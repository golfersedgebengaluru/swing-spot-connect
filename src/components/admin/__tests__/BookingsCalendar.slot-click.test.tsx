import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BookingsCalendar } from "../BookingsCalendar";

// Wednesday 2 December 2026, Gurugram (IST). Bay 1 is booked 7–8 PM; every bay is blocked 9–10 AM.
const DATE = "2026-12-02";
const items = [
  { kind: "booking", id: "b1", bay_id: "bay-1", start_time: "2026-12-02T13:30:00Z", end_time: "2026-12-02T14:30:00Z", label: "Kapil", session_type: "practice", on_google: true },
  { kind: "blockout", id: "x1", bay_id: null, start_time: "2026-12-02T03:30:00Z", end_time: "2026-12-02T04:30:00Z", label: "Cleaning", session_type: null, on_google: false },
];
const bay = (id: string, name: string, sort: number) => ({
  id, name, city: "Gurugram", is_active: true, sort_order: sort, open_time: "08:00", close_time: "22:00", weekly_off_days: [], hours_overrides: [],
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: () => Promise.resolve({ data: items, error: null }) },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "staff-1" } }) }));
vi.mock("@/contexts/AdminCityContext", () => ({ useAdminCity: () => ({ selectedCity: "Gurugram", availableCities: ["Gurugram"] }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useBayHolidays", () => ({ useBayHolidays: () => ({ data: [] }) }));
vi.mock("@/hooks/useBookings", () => ({
  useBays: () => ({ data: [bay("bay-1", "Bay #1", 1), bay("bay-2", "Bay #2", 2)] }),
  useBayConfig: () => ({ data: [{ city: "Gurugram", timezone: "Asia/Kolkata", availability_source: "app" }] }),
}));

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${DATE}T06:00:00Z`));
});
afterAll(() => vi.useRealTimers());

function renderCalendar(onSlotClick = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><BookingsCalendar onSlotClick={onSlotClick} /></QueryClientProvider>);
  return onSlotClick;
}

describe("Bookings calendar: click a free time to book", () => {
  it("opens a booking for the clicked bay, date and time", async () => {
    const onSlotClick = renderCalendar();
    fireEvent.click(await screen.findByRole("button", { name: "Book Bay #2 at 7:00 PM" }));
    expect(onSlotClick).toHaveBeenCalledWith({ city: "Gurugram", bayId: "bay-2", date: DATE, time: "19:00" });
  });

  it("does not offer a time that is already booked on that bay", async () => {
    renderCalendar();
    await screen.findByRole("button", { name: "Book Bay #2 at 7:00 PM" });
    expect(screen.queryByRole("button", { name: "Book Bay #1 at 7:00 PM" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Book Bay #1 at 7:30 PM" })).toBeNull();
    expect(screen.getByRole("button", { name: "Book Bay #1 at 8:00 PM" })).toBeTruthy();
  });

  it("does not offer a time blocked for all bays", async () => {
    renderCalendar();
    await screen.findByRole("button", { name: "Book Bay #2 at 7:00 PM" });
    expect(screen.queryByRole("button", { name: "Book Bay #1 at 9:00 AM" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Book Bay #2 at 9:30 AM" })).toBeNull();
  });

  it("does not offer times outside opening hours", async () => {
    renderCalendar();
    await screen.findByRole("button", { name: "Book Bay #2 at 7:00 PM" });
    expect(screen.getByRole("button", { name: "Book Bay #2 at 8:00 AM" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Book Bay #2 at 9:30 PM" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Book Bay #2 at 10:00 PM" })).toBeNull();
  });
});
