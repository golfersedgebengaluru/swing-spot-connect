import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

// Capture the most recent .select() argument so we can assert on it.
const lastSelectArgs: { bays?: string; bay_config?: string } = {};

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => ({
    select: (cols: string) => {
      lastSelectArgs[table as "bays" | "bay_config"] = cols;
      const chain: any = {
        order: () => chain,
        eq: () => chain,
        then: (resolve: any) => resolve({ data: [], error: null }),
      };
      return chain;
    },
  });
  return {
    supabase: {
      from: (t: string) => builder(t),
    },
  };
});

import { useBays, useBayConfig } from "@/hooks/useBookings";

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children
  );

describe("calendar_email privacy", () => {
  beforeEach(() => {
    lastSelectArgs.bays = undefined;
    lastSelectArgs.bay_config = undefined;
  });

  it("useBays() never selects calendar_email (public path)", async () => {
    const { result } = renderHook(() => useBays(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(lastSelectArgs.bays).toBeDefined();
    expect(lastSelectArgs.bays).not.toMatch(/calendar_email/);
    expect(lastSelectArgs.bays).not.toBe("*");
  });

  it("useBayConfig() never selects calendar_email (public path)", async () => {
    const { result } = renderHook(() => useBayConfig(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(lastSelectArgs.bay_config).toBeDefined();
    expect(lastSelectArgs.bay_config).not.toMatch(/calendar_email/);
    expect(lastSelectArgs.bay_config).not.toBe("*");
  });
});
