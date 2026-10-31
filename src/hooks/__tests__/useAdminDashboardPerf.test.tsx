import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminDashboardTab } from "@/components/admin/AdminDashboardTab";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(), rpc: vi.fn(), query: vi.fn(), access: true,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc,
  from: () => { const chain: Record<string, unknown> = {}; for (const key of ['select','eq','gte','lt','lte','order','limit','range','in']) chain[key] = () => chain;
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], count:0, error:null }); return chain; },
}}));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.query }));
vi.mock("@/contexts/AdminCityContext", () => ({ useAdminCity: () => ({ selectedCity:"Bengaluru" }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: {id:'staff-1'} }) }));
vi.mock("@/hooks/useAdmin", () => ({ useAdmin: () => ({ isAdmin:true, hasAdminAccess:mocks.access, loading:false }) }));
vi.mock("@/hooks/useCurrency", () => ({ useDefaultCurrency: () => ({ format:(v:number)=>`INR ${v}` }) }));
vi.mock("react-router-dom", async original => ({ ...await original<typeof import('react-router-dom')>(), useNavigate: () => mocks.navigate }));
const person = {id:'profile-1',display_name:'Customer One',email:null,hours_remaining:1,next_booking:'2026-11-01T10:00:00Z',last_visit:null,lifetime_visits:2};
beforeEach(() => { cleanup(); vi.clearAllMocks(); mocks.access=true; mocks.rpc.mockResolvedValue({data:{renewals:[person],inactive:[],first_visits:[],renewal_total:1,inactive_total:0},error:null}); mocks.query.mockReturnValue({data:{totalBookings:0,memberCount:0,revenue:0,hoursSold:0,upcomingBookings:[],attention:{renewals:[person],inactive:[{...person,id:'profile-2',display_name:'Customer Two'}],first_visits:[],renewal_total:1,inactive_total:1}},isLoading:false}); });
function mount() { render(<MemoryRouter><AdminDashboardTab /></MemoryRouter>); }
describe('Dashboard shared reporting', () => {
 it('makes one city-scoped batch rather than one history request per customer', async () => {
  mount(); const options=mocks.query.mock.calls[0][0]; await options.queryFn();
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledWith('customer_report',expect.objectContaining({_city:'Bengaluru',_preset:'dashboard',_limit:1}));
  expect(options.queryKey).toEqual(['admin-dashboard-stats','staff-1','Bengaluru']);
 });
 it('disables requests without staff access', () => { mocks.access=false; mount(); expect(mocks.query.mock.calls[0][0].enabled).toBe(false); });
 it('opens the existing customer profile and full report from each view', () => {
  mount(); fireEvent.click(screen.getByRole('button',{name:'Open Customer One Member360'}));
  expect(mocks.navigate).toHaveBeenLastCalledWith('/members/profile-1/360');
  fireEvent.click(screen.getByRole('button',{name:'View all (1) →'}));
  expect(mocks.navigate).toHaveBeenLastCalledWith('/admin?tab=allusers&preset=renewal-opportunities');
  fireEvent.mouseDown(screen.getByRole('tab',{name:'Inactive repeat'}),{button:0,ctrlKey:false});
  fireEvent.click(screen.getByRole('button',{name:'View all (1) →'}));
  expect(mocks.navigate).toHaveBeenLastCalledWith('/admin?tab=allusers&preset=inactive-repeat');
 });
 it('propagates reporting failure rather than claiming there are no opportunities', async () => {
  mocks.rpc.mockResolvedValue({data:null,error:new Error('denied')}); mount();
  await expect(mocks.query.mock.calls[0][0].queryFn()).rejects.toThrow('denied');
 });
});
