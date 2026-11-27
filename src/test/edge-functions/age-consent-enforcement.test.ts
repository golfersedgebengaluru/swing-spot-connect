import { describe, expect, it, vi } from "vitest";
import { memberAgeConsentAllowed } from "../../../supabase/functions/_shared/age-consent";

function client(data: boolean | null, error: { message: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc };
}

describe("member age-consent enforcement", () => {
  it("allows only an explicit eligible result", async () => {
    const eligible = client(true);
    await expect(memberAgeConsentAllowed(eligible, "member-1")).resolves.toBe(true);
    expect(eligible.rpc).toHaveBeenCalledWith("member_age_consent_allows_writes", { _user_id: "member-1" });
    await expect(memberAgeConsentAllowed(client(false), "member-1")).resolves.toBe(false);
    await expect(memberAgeConsentAllowed(client(null), "member-1")).resolves.toBe(false);
  });

  it("fails closed when the consent status cannot be read", async () => {
    await expect(memberAgeConsentAllowed(client(null, { message: "offline" }), "member-1")).resolves.toBe(false);
  });
});
