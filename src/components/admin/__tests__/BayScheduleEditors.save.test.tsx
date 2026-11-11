import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const updates: unknown[] = [];
const upserts: unknown[] = [];
let upsertRows: unknown[] = [{ id: "o1" }];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "bays") {
        return {
          update: (payload: unknown) => {
            updates.push(payload);
            return { eq: () => ({ select: () => Promise.resolve({ data: [{ id: "bay-1" }], error: null }) }) };
          },
        };
      }
      // bay_hours_overrides
      return {
        select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
        upsert: (payload: unknown) => {
          upserts.push(payload);
          return { select: () => Promise.resolve({ data: upsertRows, error: null }) };
        },
      };
    }),
  },
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import { WeeklyOffEditor, DayHoursOverrideEditor } from "@/components/admin/BayScheduleEditors";
import { saveBayHoursOverride } from "@/hooks/useBayHoursOverrides";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  updates.length = 0;
  upserts.length = 0;
  upsertRows = [{ id: "o1" }];
  toast.mockClear();
});

describe("bay schedule settings save what staff entered", () => {
  it("ticking Monday then Tuesday keeps both as off days", async () => {
    wrap(<WeeklyOffEditor bayId="bay-1" weeklyOffDays={[]} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /mon/i }));
    await waitFor(() => expect(updates).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /mon/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("checkbox", { name: /tue/i }));
    await waitFor(() => expect(updates).toHaveLength(2));
    expect(updates[1]).toEqual({ weekly_off_days: [1, 2] });
  });

  it("Sunday 10:00–18:00 typed but not added is handed to the dialog's Save", async () => {
    const onPending = vi.fn();
    wrap(<DayHoursOverrideEditor bayId="bay-1" bayOpen="10:00" bayClose="22:00" onPendingChange={onPending} />);
    fireEvent.change(screen.getByLabelText("Open"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("Close"), { target: { value: "18:00" } });
    await waitFor(() =>
      expect(onPending).toHaveBeenLastCalledWith({ day_of_week: 0, open_time: "10:00", close_time: "18:00" }),
    );
  });

  it("Add stores Sunday closing at 18:00 for the bay", async () => {
    wrap(<DayHoursOverrideEditor bayId="bay-1" bayOpen="10:00" bayClose="22:00" />);
    fireEvent.change(screen.getByLabelText("Close"), { target: { value: "18:00" } });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    await waitFor(() => expect(upserts).toHaveLength(1));
    expect(upserts[0]).toEqual({ bay_id: "bay-1", day_of_week: 0, open_time: null, close_time: "18:00" });
  });

  it("a save that changes nothing is reported as a failure, not as saved", async () => {
    upsertRows = [];
    await expect(
      saveBayHoursOverride({ bay_id: "bay-1", day_of_week: 0, open_time: null, close_time: "18:00" }),
    ).rejects.toThrow(/permission/);
  });
});
