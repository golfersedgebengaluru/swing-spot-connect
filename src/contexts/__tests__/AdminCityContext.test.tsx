import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminCityProvider, useAdminCity } from "../AdminCityContext";

const mocks = vi.hoisted(() => ({ admin: { isAdmin: false, assignedCities: ["Bengaluru"], loading: false }, cities: { data: ["Bengaluru", "Chennai"], isLoading: false } }));
vi.mock("@/hooks/useAdmin", () => ({ useAdmin: () => mocks.admin }));
vi.mock("@/hooks/useBookings", () => ({ useAllCities: () => mocks.cities }));
function Consumer() {
  const { selectedCity, setSelectedCity, isLoadingCities } = useAdminCity();
  return <><output aria-label="Selected city">{selectedCity || "All"}</output><output aria-label="Loading cities">{String(isLoadingCities)}</output><button onClick={() => setSelectedCity("Chennai")}>Other city</button><button onClick={() => setSelectedCity("")}>All cities</button></>;
}
describe("admin city selection", () => {
  beforeEach(() => { sessionStorage.clear(); mocks.admin = { isAdmin: false, assignedCities: ["Bengaluru"], loading: false }; });
  it("does not replace a saved selection while roles are still loading", async () => {
    sessionStorage.setItem("admin_selected_city", "Chennai");
    mocks.admin.loading = true;
    const view = render(<AdminCityProvider><Consumer /></AdminCityProvider>);
    expect(screen.getByLabelText("Selected city").textContent).toBe("Chennai");
    expect(screen.getByLabelText("Loading cities").textContent).toBe("true");
    mocks.admin = { isAdmin: true, assignedCities: [], loading: false };
    view.rerender(<AdminCityProvider><Consumer /></AdminCityProvider>);
    await waitFor(() => expect(screen.getByLabelText("Selected city").textContent).toBe("Chennai"));
  });
  it("restricts site staff to their assigned city and rejects global selection", async () => {
    render(<AdminCityProvider><Consumer /></AdminCityProvider>);
    await waitFor(() => expect(screen.getByLabelText("Selected city").textContent).toBe("Bengaluru"));
    fireEvent.click(screen.getByText("Other city"));
    fireEvent.click(screen.getByText("All cities"));
    expect(screen.getByLabelText("Selected city").textContent).toBe("Bengaluru");
  });
  it("clears a stale city when staff no longer have assigned locations", async () => {
    sessionStorage.setItem("admin_selected_city", "Chennai");
    mocks.admin.assignedCities = [];
    render(<AdminCityProvider><Consumer /></AdminCityProvider>);
    await waitFor(() => expect(sessionStorage.getItem("admin_selected_city")).toBeNull());
  });
});