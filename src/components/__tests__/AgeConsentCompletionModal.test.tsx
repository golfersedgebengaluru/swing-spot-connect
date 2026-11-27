import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AgeConsentCompletionModal } from "../AgeConsentCompletionModal";

const mockRpc = vi.fn();
const mockInvoke = vi.fn();
const mockSignOut = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    auth: { signOut: (...args: unknown[]) => mockSignOut(...args) },
  },
}));

const incomplete = {
  state: "incomplete",
  needs_completion: true,
  can_use_member_features: false,
  declared_adult: null,
  parent_email: null,
  email_delivery_status: null,
  parent_expires_at: null,
  resend_available_at: null,
  terms_version: "1.0",
  privacy_version: "2.1",
};

const allowed = {
  ...incomplete,
  state: "adult",
  needs_completion: false,
  can_use_member_features: true,
  declared_adult: true,
};

function renderModal(onComplete = vi.fn()) {
  render(<MemoryRouter><AgeConsentCompletionModal open onComplete={onComplete} /></MemoryRouter>);
  return onComplete;
}

describe("AgeConsentCompletionModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: incomplete, error: null });
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
  });

  it("saves an adult declaration and current policy acceptance together", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "get_age_consent_status") {
        return Promise.resolve({ data: mockRpc.mock.calls.filter(([called]) => called === "submit_age_declaration").length ? allowed : incomplete, error: null });
      }
      return Promise.resolve({ data: allowed, error: null });
    });
    const onComplete = renderModal();
    fireEvent.click(await screen.findByRole("button", { name: "Yes" }));
    fireEvent.click(screen.getByLabelText(/I agree to the/));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(mockRpc).toHaveBeenCalledWith("submit_age_declaration", expect.objectContaining({
      _is_adult: true,
      _accept_policies: true,
    }));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("sends No into the existing parent-request flow", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "get_age_consent_status") return Promise.resolve({ data: incomplete, error: null });
      return Promise.resolve({ data: { ...incomplete, state: "parent_required", declared_adult: false }, error: null });
    });
    renderModal();
    fireEvent.click(await screen.findByRole("button", { name: "No" }));
    fireEvent.change(screen.getByLabelText("Parent / guardian email"), { target: { value: "parent@example.com" } });
    fireEvent.click(screen.getByLabelText(/I agree to the/));
    fireEvent.click(screen.getByRole("button", { name: "Save and request consent" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("request-parental-consent", {
      body: { parent_email: "parent@example.com" },
    }));
    expect(mockRpc).toHaveBeenCalledWith("submit_age_declaration", expect.objectContaining({ _is_adult: false }));
  });

  it("does not report success when the parent email fails", async () => {
    mockInvoke.mockResolvedValue({ data: { error: "Delivery failed; request saved" }, error: null });
    renderModal();
    fireEvent.click(await screen.findByRole("button", { name: "No" }));
    fireEvent.change(screen.getByLabelText("Parent / guardian email"), { target: { value: "parent@example.com" } });
    fireEvent.click(screen.getByLabelText(/I agree to the/));
    fireEvent.click(screen.getByRole("button", { name: "Save and request consent" }));

    expect(await screen.findByText("Delivery failed; request saved")).toBeTruthy();
  });

  it("lets an approved minor accept updated policies without requesting consent again", async () => {
    const approvedNeedsPolicies = { ...incomplete, state: "approved", declared_adult: false, parent_email: "parent@example.com" };
    mockRpc.mockImplementation((name: string) => {
      if (name === "get_age_consent_status") {
        const submitted = mockRpc.mock.calls.some(([called]) => called === "submit_age_declaration");
        return Promise.resolve({ data: submitted ? { ...approvedNeedsPolicies, needs_completion: false, can_use_member_features: true } : approvedNeedsPolicies, error: null });
      }
      return Promise.resolve({ data: approvedNeedsPolicies, error: null });
    });
    const onComplete = renderModal();
    fireEvent.click(await screen.findByLabelText(/I agree to the/));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("keeps member features closed when the status lookup fails", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    const onComplete = renderModal();
    expect(await screen.findByText(/couldn't check your account status/)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("does not offer an adult bypass to an existing minor declaration", async () => {
    mockRpc.mockResolvedValue({ data: { ...incomplete, state: "declined", declared_adult: false }, error: null });
    renderModal();
    expect((await screen.findByRole("button", { name: "Yes" })).closest("fieldset")?.disabled).toBe(true);
    expect(screen.getByText(/authorised correction is needed/)).toBeTruthy();
  });
});
