# Leagues-only Admin Login

Create a dedicated admin account `contests@golfers-edge.com` that, on login, sees **only the Leagues screen** in the admin panel — nothing else. Password changeable later by the user themselves from their Profile page.

## Approach (pragmatic, fastest to ship)

The account gets the regular `admin` role (full DB write power on league tables), but we add a tiny "leagues-only" flag that the UI uses to:
- force the admin panel to land on the **Leagues** tab,
- hide every other sidebar group/item,
- block URL tampering (`/admin?tab=settings` → snaps back to Leagues),
- redirect them to `/admin?tab=leagues` from `/`, `/dashboard`, etc.

This avoids rewriting every league-related RLS policy across ~15 tables. Security model: this account is for trusted contests staff; restriction is UI-enforced. We can upgrade to a separate DB role later if needed.

## Backend changes

1. **Migration** — create one tiny table:
   ```sql
   create table public.leagues_only_admins (
     user_id uuid primary key references auth.users(id) on delete cascade,
     created_at timestamptz not null default now()
   );
   alter table public.leagues_only_admins enable row level security;
   create policy "Self can read" on public.leagues_only_admins
     for select to authenticated using (auth.uid() = user_id);
   create policy "Admins manage" on public.leagues_only_admins
     for all to authenticated
     using (public.has_role(auth.uid(), 'admin'))
     with check (public.has_role(auth.uid(), 'admin'));
   ```

2. **Edge function `seed-leagues-admin`** (idempotent, one-shot):
   - Uses service role to:
     - find or create auth user `contests@golfers-edge.com` with password `Passwd@geb1234!` and `email_confirm: true`
     - upsert `user_roles { user_id, role: 'admin' }`
     - insert into `leagues_only_admins`
   - I'll deploy + curl it once to provision the account, then it stays available if needed.

## Frontend changes

3. **`useAdmin.ts`** — add a `isLeaguesOnly` flag (cheap select on `leagues_only_admins` for the current user; cached 5 min).

4. **`AdminSidebar.tsx`** — when `isLeaguesOnly`:
   - render only the **Leagues** nav item (skip all groups/sections)
   - keep the sign-out + collapse controls

5. **`Admin.tsx`** — when `isLeaguesOnly`:
   - force `activeTab = "leagues"` on mount and any URL-`?tab=` change
   - if the URL has another tab, rewrite it to `?tab=leagues`

6. **Route gating** — in `Index.tsx` (and `Dashboard.tsx` if needed), if `isLeaguesOnly`, redirect to `/admin?tab=leagues` so they can't browse the member site.

7. **Password change** — add a small "Change password" card in `src/pages/Profile.tsx` (current + new password fields, calls `supabase.auth.updateUser({ password })`). Available to all logged-in users, not just this account.

## Out of scope

- No new DB role / no rewriting of league RLS
- No separate `/league-admin` route — reuses `/admin` with tab pinned to `leagues`
- No restriction on which leagues they can manage (full admin within Leagues)

## What you'll be able to do after this ships

- Log in at `/auth` as `contests@golfers-edge.com` / `Passwd@geb1234!`
- Land directly on the Leagues admin screen with full league management powers
- See no other tabs, no dashboard, no settings, no members, etc.
- Change password anytime from `/profile`
