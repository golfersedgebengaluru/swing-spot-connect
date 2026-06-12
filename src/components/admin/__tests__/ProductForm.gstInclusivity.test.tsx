import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProductForm } from "@/components/admin/ProductForm";

// Hook mocks — keep the form rendering deterministic and side-effect free.
vi.mock("@/hooks/useProductCategories", () => ({
  useProductCategories: () => ({ data: [{ id: "1", name: "Other" }] }),
}));
vi.mock("@/hooks/useUnitsOfMeasure", () => ({
  useUnitsOfMeasure: () => ({ data: [{ id: "1", name: "Each" }] }),
}));
vi.mock("@/hooks/useBookings", () => ({
  useCities: () => ({ data: ["Bengaluru"] }),
}));
vi.mock("@/hooks/useAdmin", () => ({
  useAdmin: () => ({ isAdmin: true, isSiteAdmin: false, assignedCities: [] }),
}));
vi.mock("@/hooks/useCorporateAccounts", () => ({
  useCorporateAccounts: () => ({ data: [] }),
}));
vi.mock("@/hooks/useCostPrice", () => ({
  useProductCostPrices: () => ({ data: new Map() }),
  useSetProductCostPrice: () => ({ mutateAsync: vi.fn() }),
  useCityCostPriceAccess: () => ({ data: {} }),
}));
// Avoid loading TipTap in tests; the editor's onChange is irrelevant here.
vi.mock("@/components/ui/rich-text-editor", () => ({
  RichTextEditor: ({ content }: any) => <div data-testid="rte">{content}</div>,
}));

function getPriceInput(): HTMLInputElement {
  const label = screen.getByText("Selling Price");
  const container = label.closest("div.rounded-lg") as HTMLElement;
  return container.querySelector('input[type="number"]') as HTMLInputElement;
}
function getInputByLabel(text: string): HTMLInputElement {
  const label = screen.getByText(text);
  const wrap = label.parentElement as HTMLElement;
  return wrap.querySelector("input") as HTMLInputElement;
}

describe("ProductForm GST inclusivity invariant", () => {
  it("stores price as GST-inclusive even when entered as Excl. GST", async () => {
    const onSave = vi.fn();
    render(<ProductForm onSave={onSave} onCancel={() => {}} />);

    // 1. Fill required name
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Test SKU" } });

    // 2. Set GST rate to 18
    const gstInput = screen.getByPlaceholderText("18") as HTMLInputElement;
    fireEvent.change(gstInput, { target: { value: "18" } });

    // 3. Flip to Excl. GST (switch is currently "checked = inclusive")
    const toggle = screen.getByRole("switch", { name: "" }) ||
      document.querySelector('[role="switch"]') as HTMLElement;
    // There are multiple switches; pick the one inside Selling Price block.
    const priceBlock = screen.getByText("Selling Price").closest("div.rounded-lg") as HTMLElement;
    const priceToggle = priceBlock.querySelector('[role="switch"]') as HTMLElement;
    fireEvent.click(priceToggle);

    // 4. Enter 100 as exclusive price
    const priceInput = getPriceInput();
    fireEvent.change(priceInput, { target: { value: "100" } });

    // 5. Save
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const payload = onSave.mock.calls[0][0];
    // Invariant: persisted price is inclusive → 100 * 1.18 = 118
    expect(payload.price).toBe(118);
    expect(payload.gst_rate).toBe(18);
  });

  it("stores entered value verbatim when in Incl. GST mode", async () => {
    const onSave = vi.fn();
    render(<ProductForm onSave={onSave} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "X" } });
    fireEvent.change(screen.getByPlaceholderText("18"), { target: { value: "18" } });
    fireEvent.change(getPriceInput(), { target: { value: "118" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].price).toBe(118);
  });

  it("stores price unchanged when GST rate is 0 regardless of toggle", async () => {
    const onSave = vi.fn();
    render(<ProductForm onSave={onSave} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "X" } });
    // gst_rate defaults to 0
    const priceBlock = screen.getByText("Selling Price").closest("div.rounded-lg") as HTMLElement;
    const priceToggle = priceBlock.querySelector('[role="switch"]') as HTMLElement;
    fireEvent.click(priceToggle); // flip to exclusive
    fireEvent.change(getPriceInput(), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].price).toBe(500);
  });
});
