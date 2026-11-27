import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthProvider } from "../AuthContext";

const mockGetSession = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    functions: { invoke: vi.fn().mockResolvedValue({ data: {}, error: null }) },
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn(),
    },
  },
}));

vi.mock("@/components/AppleProfileCompletionModal", () => ({
  AppleProfileCompletionModal: () => <div data-testid="apple-step" />,
}));
vi.mock("@/components/PhoneCompletionModal", () => ({
  PhoneCompletionModal: () => <div data-testid="phone-step" />,
}));
vi.mock("@/components/AgeConsentCompletionModal", () => ({
  AgeConsentCompletionModal: () => <div data-testid="age-step" />,
}));

function queryReturning(data: Record<string, unknown>) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

describe("AuthContext completion ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue(queryReturning({ phone: "+919999999999", display_name: "Test Member", email: "member@example.com" }));
  });

  it.each(["email", "google", "apple"])("reaches the age step after %s account details and mobile are complete", async (provider) => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: `${provider}-user`, app_metadata: { provider }, identities: [{ provider }] } } },
      error: null,
    });
    render(<AuthProvider><div /></AuthProvider>);
    expect(await screen.findByTestId("age-step")).toBeTruthy();
    expect(screen.queryByTestId("phone-step")).toBeNull();
    expect(screen.queryByTestId("apple-step")).toBeNull();
  });

  it("does not stack the age step on the mobile step", async () => {
    mockFrom.mockReturnValue(queryReturning({ phone: "", display_name: "Test Member", email: "member@example.com" }));
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "phone-user", app_metadata: {}, identities: [] } } }, error: null });
    render(<AuthProvider><div /></AuthProvider>);
    expect(await screen.findByTestId("phone-step")).toBeTruthy();
    expect(screen.queryByTestId("age-step")).toBeNull();
  });

  it("does not stack mobile or age steps on Apple detail completion", async () => {
    mockFrom.mockReturnValue(queryReturning({ phone: "", display_name: "", email: "relay@privaterelay.appleid.com" }));
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "apple-user", app_metadata: { provider: "apple" }, identities: [{ provider: "apple" }] } } }, error: null });
    render(<AuthProvider><div /></AuthProvider>);
    expect(await screen.findByTestId("apple-step")).toBeTruthy();
    expect(screen.queryByTestId("phone-step")).toBeNull();
    expect(screen.queryByTestId("age-step")).toBeNull();
  });
});
