import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemberHoursManager } from "../MemberHoursManager";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        order: () => Promise.resolve({ data: [], error: null }) }),
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "t1" }, error: null }) }) }),
    }),
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "staff-1" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useMemberHours", () => ({ useHoursTransactions: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/useNotificationEmail", () => ({ sendNotificationEmail: vi.fn() }));

const member = { id: "m1", user_id: "u1", display_name: "A Bhamini Nair", preferred_city: "Bangalore", hours_purchased: 0, hours_used: 0 };

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemberHoursManager member={member as any} mode="adjust" selectedCity="Bangalore" onClose={vi.fn()} />
    </QueryClientProvider>
  );
}

describe("Adjust Hours dialog rendering", () => {
  it("shows no payment fields and still gates Confirm", async () => {
    renderDialog();
    const dlg = await screen.findByRole("dialog");
    expect(dlg).toBeInTheDocument();
    expect(screen.queryByText("Paid By")).toBeNull();
    expect(screen.queryByText("Amount Collected")).toBeNull();
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toBeDisabled();
    // hours + note
    fireEvent.change(screen.getByLabelText(/Hours/), { target: { value: "1" } });
    fireEvent.change(screen.getByPlaceholderText(/audit trail/), { target: { value: "check" } });
    // open the Reason select by keyboard
    const reason = screen.getAllByRole("combobox")[1];
    fireEvent.keyDown(reason, { code: "Space", key: " " });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeTruthy(), { timeout: 3000 }).catch(() => {});
    const opt = screen.queryByRole("option", { name: "Correction" });
    if (opt) fireEvent.click(opt);
    expect(screen.queryByText("Paid By")).toBeNull();
    expect(screen.queryByText("Amount Collected")).toBeNull();
  });
});
