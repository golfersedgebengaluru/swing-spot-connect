import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../AuthContext";
import { mockSupabase } from "@/test/supabase-mock";

// Mock modules
vi.mock("@/integrations/supabase/client", () => ({
  supabase: mockSupabase(),
}));

vi.mock("@/components/AppleProfileCompletionModal", () => ({
  AppleProfileCompletionModal: () => null,
}));

vi.mock("@/components/PhoneCompletionModal", () => ({
  PhoneCompletionModal: () => null,
}));

import { supabase } from "@/integrations/supabase/client";

function TestConsumer() {
  const { user, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user?.id ?? "none"}</span>
    </div>
  );
}

describe("AuthContext – auto-gifts gating", () => {
  let authChangeCallback: (event: string, session: any) => void;

  const fakeUser = { id: "user-123", app_metadata: {}, identities: [] };
  const fakeSession = { user: fakeUser };

  beforeEach(() => {
    vi.clearAllMocks();

    // Capture the onAuthStateChange callback
    (supabase.auth.onAuthStateChange as any).mockImplementation((cb: any) => {
      authChangeCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    // Default: no existing session (fresh visitor)
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    // Mock profiles query for phone check
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { phone: "1234567890", display_name: "Test", email: "test@test.com" }, error: null }),
    });
  });

  it("fires auto-gifts on genuine fresh sign-in", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    // Wait for getSession to resolve (no session)
    await waitFor(() => {});

    // Simulate a fresh SIGNED_IN event
    act(() => {
      authChangeCallback("SIGNED_IN", fakeSession);
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith("process-auto-gifts", {
      body: { user_id: "user-123", trigger_event: "signup" },
    });
  });

  it("does NOT fire auto-gifts when restoring an existing session", async () => {
    // User already has a session
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: fakeSession },
      error: null,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    // Wait for getSession to resolve (has session, sets hadSessionRef)
    await waitFor(() => {});

    // onAuthStateChange fires SIGNED_IN for session restore
    act(() => {
      authChangeCallback("SIGNED_IN", fakeSession);
    });

    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("does NOT fire auto-gifts twice for the same user", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {});

    // First sign-in
    act(() => {
      authChangeCallback("SIGNED_IN", fakeSession);
    });

    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);

    // Sign out
    act(() => {
      authChangeCallback("SIGNED_OUT", null);
    });

    // Sign in again with same user – should not fire because ID is in the Set
    act(() => {
      authChangeCallback("SIGNED_IN", fakeSession);
    });

    // Still only 1 call
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
  });

  it("fires auto-gifts for a different user after sign-out", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {});

    act(() => {
      authChangeCallback("SIGNED_IN", fakeSession);
    });

    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);

    // Sign out resets hadSessionRef
    act(() => {
      authChangeCallback("SIGNED_OUT", null);
    });

    // Different user signs in
    const otherSession = { user: { ...fakeUser, id: "user-456" } };
    act(() => {
      authChangeCallback("SIGNED_IN", otherSession);
    });

    expect(supabase.functions.invoke).toHaveBeenCalledTimes(2);
    expect(supabase.functions.invoke).toHaveBeenLastCalledWith("process-auto-gifts", {
      body: { user_id: "user-456", trigger_event: "signup" },
    });
  });

  it("does not fire on TOKEN_REFRESHED events", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {});

    act(() => {
      authChangeCallback("TOKEN_REFRESHED", fakeSession);
    });

    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
});
