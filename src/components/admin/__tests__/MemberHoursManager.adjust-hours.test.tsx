import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemberHoursManager } from "../MemberHoursManager";

// Adjust Hours is an hours-only correction tool: it must never ask for money.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        order: () => Promise.resolve({ data: [], error: null }),
      }),
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "t1" }, error: null }) }) }),
    }),
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "staff-1" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useMemberHours", () => ({ useHoursTransactions: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/useNotificationEmail", () => ({ sendNotificationEmail: vi.fn() }));

beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture = () => false;
  proto.setPointerCapture = () => {};
  proto.releasePointerCapture = () => {};
  proto.scrollIntoView = () => {};
});

const member = {
  id: "m1",
  user_id: "u1",
  display_name: "A Bhamini Nair",
  preferred_city: "Bangalore",
  hours_purchased: 0,
  hours_used: 0,
};

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
  fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
  await waitFor(() => expect(screen.queryByRole("option", { name })).toBeTruthy(), { timeout: 2500 });
  fireEvent.click(screen.getByRole("option", { name }));
}

describe("Adjust Hours dialog", () => {
  it("collects no payment details in either action, and still gates Confirm", async () => {
    renderDialog();
    await screen.findByRole("dialog");

    const confirm = () => screen.getByRole("button", { name: "Confirm" });
    const noPaymentFields = () => {
      expect(screen.queryByText("Paid By")).toBeNull();
      expect(screen.queryByText("Amount Collected")).toBeNull();
      expect(document.body.textContent).not.toMatch(/Paid By|Amount Collected/);
    };

    noPaymentFields();
    expect(confirm()).toBeDisabled();

    // "Add Hours" is the action that used to show Paid By / Amount Collected.
    await openSelect(screen.getAllByRole("combobox")[0], "Add Hours");
    noPaymentFields();
    expect(screen.queryByLabelText(/Service Date/)).toBeNull();

    typeInto(document.querySelector('input[type="number"]') as HTMLInputElement, "2");
    await openSelect(screen.getAllByRole("combobox")[1], "Correction");
    typeInto(document.querySelector('input[placeholder*="audit trail"]') as HTMLInputElement, "correction note");

    noPaymentFields();
    await waitFor(() => expect(confirm()).toBeEnabled(), { timeout: 2500 });
  });
});
