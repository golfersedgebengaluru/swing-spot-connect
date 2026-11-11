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

function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, value);
  fireEvent.input(el, { target: { value } });
}

async function openSelect(trigger: HTMLElement, name: string) {
  fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse", isTrusted: true });
  await waitFor(() => expect(screen.queryByRole("option", { name })).toBeTruthy(), { timeout: 2500 });
  fireEvent.click(screen.getByRole("option", { name }));
}

describe("Adjust Hours dialog", () => {
  it("collects no payment details in either action, and still gates Confirm", async () => {
    const { container } = renderDialog();
    await screen.findByRole("dialog");
    const confirm = () => screen.getByRole("button", { name: "Confirm" });
    const noPaymentFields = () => {
      expect(screen.queryByText("Paid By")).toBeNull();
      expect(screen.queryByText("Amount Collected")).toBeNull();
      expect(container.ownerDocument.body.textContent).not.toMatch(/Paid By|Amount Collected/);
    };

    noPaymentFields();
    expect(confirm()).toBeDisabled();

    // Action -> Add Hours (the view that used to show Paid By / Amount Collected)
    const combos = screen.getAllByRole("combobox");
    await openSelect(combos[0], "Add Hours");
    noPaymentFields();
    expect(screen.queryByLabelText(/Service Date/)).toBeNull();

    // Fill the remaining fields; Confirm must enable with no payment info
    typeInto(container.querySelector('input[type="number"]') as HTMLInputElement, "2");
    await openSelect(screen.getAllByRole("combobox")[1], "Correction");
    typeInto(container.querySelector('input[placeholder*="audit trail"]') as HTMLInputElement, "playwright check");
    noPaymentFields();
    await waitFor(() => expect(confirm()).toBeEnabled(), { timeout: 2500 });
  });
});
