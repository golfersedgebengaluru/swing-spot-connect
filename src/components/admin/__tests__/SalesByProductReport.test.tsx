import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SalesByProductReport } from "../SalesByProductReport";
import { aggregateSales, type SalesProduct } from "@/lib/sales-by-product";

const products: SalesProduct[] = [
  { id: "p-cap", category: "Apparel", sku: "PRD-BLR-APP-CAP-A1", name: "Cap", vendor_id: "v-1" },
  { id: "p-ball", category: "Accessory", sku: "PRD-BLR-ACC-BALL-C3", name: "Golf Ball", vendor_id: "v-2" },
];

const summary = aggregateSales({
  transactions: [
    { id: "t1", amount: 2500, transaction_type: "purchase", product_id: "p-cap" },
    { id: "t2", amount: 700, transaction_type: "purchase", product_id: "p-ball" },
    { id: "t3", amount: 1200, transaction_type: "purchase" },
  ],
  products,
  vendorNames: new Map([["v-1", "Acme Apparel"], ["v-2", "ProGolf Supplies"]]),
});

const renderReport = () =>
  render(
    <SalesByProductReport
      byCategoryRows={summary.byCategoryRows}
      byVendor={summary.byVendor}
      bySku={summary.bySku}
      currencySymbol="₹"
      periodLabel="2026-08-01_2026-08-31"
      cityLabel="Bengaluru"
      isLoading={false}
    />,
  );

describe("SalesByProductReport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows category totals collapsed, with SKUs hidden until drilled into", () => {
    renderReport();
    expect(screen.getByText("Apparel")).toBeInTheDocument();
    expect(screen.getByText("Accessory")).toBeInTheDocument();
    expect(screen.queryByText("PRD-BLR-APP-CAP-A1")).not.toBeInTheDocument();
  });

  it("reveals SKU rows when a category is clicked", () => {
    renderReport();
    fireEvent.click(screen.getByTestId("group-Apparel"));
    expect(screen.getByText("PRD-BLR-APP-CAP-A1")).toBeInTheDocument();
    expect(screen.getByText("Cap")).toBeInTheDocument();
  });

  it("keeps unlinked sales visible so totals reconcile with revenue", () => {
    renderReport();
    expect(screen.getByText("Uncategorised")).toBeInTheDocument();
    // 2500 + 700 + 1200
    expect(screen.getByText("₹4,400")).toBeInTheDocument();
  });

  it("switches to the vendor view", () => {
    renderReport();
    fireEvent.click(screen.getByRole("button", { name: /By Vendor/i }));
    expect(screen.getByText("Acme Apparel")).toBeInTheDocument();
    expect(screen.getByText("No vendor")).toBeInTheDocument();
  });

  it("exports every SKU row (not just the visible ones) to CSV", () => {
    const created: any[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: any) => {
      const el = realCreate(tag);
      if (tag === "a") {
        (el as any).click = vi.fn();
        created.push(el);
      }
      return el;
    });
    const blobs: any[] = [];
    vi.stubGlobal("Blob", class {
      constructor(parts: any[]) { blobs.push(parts.join("")); }
    } as any);
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => {} } as any);

    renderReport();
    fireEvent.click(screen.getByRole("button", { name: /CSV/i }));

    expect(created[0].download).toBe("sales_by_sku_Bengaluru_2026-08-01_2026-08-31.csv");
    const csv = blobs[0] as string;
    expect(csv).toContain("PRD-BLR-APP-CAP-A1");
    expect(csv).toContain("PRD-BLR-ACC-BALL-C3");
    expect(csv).toContain("Unlinked sales");
    expect(csv).toContain('"Total","","","","2","4400"');
  });

  it("renders an empty state instead of a broken table when there are no sales", () => {
    render(
      <SalesByProductReport
        byCategoryRows={[]} byVendor={[]} bySku={[]}
        currencySymbol="₹" periodLabel="p" isLoading={false}
      />,
    );
    expect(screen.getByText(/No sales for this period/i)).toBeInTheDocument();
  });
});
