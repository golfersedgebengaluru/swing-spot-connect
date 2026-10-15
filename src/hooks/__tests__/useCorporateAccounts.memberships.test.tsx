import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
import { useAssignProfileToCorporate, useDeferredItemsForCorporate, useProfileBillingInfo } from "../useCorporateAccounts";

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);
}
function chain(data: unknown[]) {
  const q = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), is: vi.fn(), neq: vi.fn(), order: vi.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
  for (const fn of [q.select, q.eq, q.in, q.is, q.neq, q.order]) fn.mockReturnValue(q);
  return q;
}
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ error: null }); });
describe("multi-account corporate memberships", () => {
  it("adds B atomically without replacing A", async () => {
    const { result } = renderHook(() => useAssignProfileToCorporate(), { wrapper });
    await act(() => result.current.mutateAsync({ profileId: "member", corporateAccountId: "B" }));
    expect(mocks.rpc).toHaveBeenCalledWith("change_corporate_membership", { _profile_id: "member", _account_id: "B", _remove: false });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("removes only the selected company", async () => {
    const { result } = renderHook(() => useAssignProfileToCorporate(), { wrapper });
    await act(() => result.current.mutateAsync({ profileId: "member", corporateAccountId: "B", remove: true }));
    expect(mocks.rpc).toHaveBeenCalledWith("change_corporate_membership", { _profile_id: "member", _account_id: "B", _remove: true });
  });
  it("does not hide a failed membership write", async () => {
    mocks.rpc.mockResolvedValue({ error: new Error("Inactive account") });
    const { result } = renderHook(() => useAssignProfileToCorporate(), { wrapper });
    await expect(result.current.mutateAsync({ profileId: "member", accountIds: ["A", "B"] })).rejects.toThrow("Inactive account");
  });
  it("offers only active memberships for new bookings", async () => {
    mocks.from.mockReturnValue(chain([{ corporate_account_id: "A", account: { id: "A", is_active: true } }, { corporate_account_id: "B", account: { id: "B", is_active: false } }]));
    const { result } = renderHook(() => useProfileBillingInfo("member"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.accounts.map(a => a.id)).toEqual(["A"]);
    expect(result.current.data?.accountIds).toEqual(["A", "B"]);
  });
  it("reads historical sessions by payer even with no current members", async () => {
    const booking = chain([{ id: "bookingB", user_id: "former-member", city: "City", start_time: "2026-10-01", billing_status: "deferred", status: "confirmed" }]);
    const coaching = chain([]);
    mocks.from.mockImplementation((table: string) => table === "bookings" ? booking : table === "coaching_sessions" ? coaching : chain([]));
    const { result } = renderHook(() => useDeferredItemsForCorporate("B"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map(b => b.id)).toEqual(["bookingB"]);
    expect(booking.eq).toHaveBeenCalledWith("corporate_account_id", "B");
    expect(coaching.is).toHaveBeenCalledWith("booking_id", null);
    expect(coaching.neq).toHaveBeenCalledWith("session_type", "self_directed");
  });
});