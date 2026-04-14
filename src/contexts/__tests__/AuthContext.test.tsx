import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";

const mockInvoke = vi.fn().mockResolvedValue({ data: {}, error: null });
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignOut = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    functions: { invoke: (...args: any[]) => mockInvoke(...args) },
    auth: {
      getSession: (...args: any[]) => mockGetSession(...args),
      onAuthStateChange: (...args: any[]) => mockOnAuthStateChange(...args),
      signOut: (...args: any[]) => mockSignOut(...args),
    },
  },
}));

vi.mock("@/components/AppleProfileCompletionModal", () => ({
  AppleProfileCompletionModal: () => null,
}));

vi.mock("@/components/PhoneCompletionModal", () => ({
  PhoneCompletionModal: () => null,
}));

// Import after mocks
import { AuthProvider, useAuth } from "../AuthContext";

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

  const fakeUser = { id: "user-123", app_metadata: {}, identities: [] } as any;
  const fakeSession = { user: fakeUser };

  beforeEach(() => {
    vi.clearAllMocks();

    mockOnAuthStateChange.mockImplementation((cb: any) => {
      authChangeCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { phone: "123", display_name: "Test", email: "t@t.com" },
        error: null,
      }),
    });
  });

  it("fires auto-gifts on genuine fresh sign-in", async () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());

    act(() => { authChangeCallback("SIGNED_IN", fakeSession); });

    expect(mockInvoke).toHaveBeenCalledWith("process-auto-gifts", {
      body: { user_id: "user-123", trigger_event: "signup" },
    });
  });

  it("does NOT fire auto-gifts when restoring an existing session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: fakeSession }, error: null });

    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());

    act(() => { authChangeCallback("SIGNED_IN", fakeSession); });

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("does NOT fire auto-gifts twice for the same user", async () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());

    act(() => { authChangeCallback("SIGNED_IN", fakeSession); });
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    act(() => { authChangeCallback("SIGNED_OUT", null); });
    act(() => { authChangeCallback("SIGNED_IN", fakeSession); });

    // Still only 1 – same user ID already in the Set
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("fires auto-gifts for a different user after sign-out", async () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());

    act(() => { authChangeCallback("SIGNED_IN", fakeSession); });
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    act(() => { authChangeCallback("SIGNED_OUT", null); });

    const otherSession = { user: { ...fakeUser, id: "user-456" } };
    act(() => { authChangeCallback("SIGNED_IN", otherSession); });

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(mockInvoke).toHaveBeenLastCalledWith("process-auto-gifts", {
      body: { user_id: "user-456", trigger_event: "signup" },
    });
  });

  it("does not fire on TOKEN_REFRESHED events", async () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());

    act(() => { authChangeCallback("TOKEN_REFRESHED", fakeSession); });

    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
