import { describe, it, expect } from "vitest";
import { groupByCategory } from "@/hooks/useProducts";

describe("storefront grouping", () => {
  it("groups products by catalogue category, alphabetically", () => {
    const groups = groupByCategory([
      { category: "F&B", name: "Coffee" },
      { category: "Apparel", name: "Cap" },
      { category: "F&B", name: "Beer" },
    ] as any);
    expect(groups.map((g) => g.category)).toEqual(["Apparel", "F&B"]);
    expect(groups[1].items.map((i: any) => i.name)).toEqual(["Coffee", "Beer"]);
  });

  it("falls back to Other for blank/null categories", () => {
    const groups = groupByCategory([{ category: null }, { category: "  " }] as any);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("Other");
    expect(groups[0].items).toHaveLength(2);
  });
});
