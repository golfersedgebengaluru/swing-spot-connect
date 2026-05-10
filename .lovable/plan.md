## Goal

Let each Quick Competition have multiple categories (e.g. Men, Ladies, Juniors…), assign each player to a category, and show a separate Longest / Straightest board per category on the bay-screen view. Categories are flexible — admin can add/rename/remove them per competition.

## 1. Database (migration)

New table `quick_competition_categories`:

```text
id            uuid pk
competition_id uuid fk → quick_competitions(id) on delete cascade
name          text not null   -- "Men", "Ladies", "Juniors"...
sort_order    int  not null default 0
created_at    timestamptz default now()
unique (competition_id, lower(name))
```

`quick_competition_players`: add nullable `category_id uuid references quick_competition_categories(id) on delete set null`.

`quick_competitions`: add `categories_enabled boolean default false` so existing single-board comps keep working unchanged.

**Winner columns**: keep existing `longest_winner_*` / `straightest_winner_*` for the overall winner (used when categories are off). Add a JSONB `category_winners` column on `quick_competitions` that the end-competition function fills with `[{ category_id, name, longest:{player_id,value}, straightest:{player_id,value} }]` so each category gets its own certificate references.

Add `longest_card_url` and `straightest_card_url` *per category* by extending the JSONB rather than adding columns — simpler and flexible.

RLS: same policies as existing tables (tenant-scoped via competition).

## 2. Admin console — `QuickCompetitionConsole.tsx`

- New small "Categories" panel above "Add Player & Score":
  - Toggle: **Use categories** (writes `categories_enabled`).
  - When on: chip list of categories with inline rename + delete; an "Add category" input. Defaults seeded once when toggled on: **Men**, **Ladies**.
- "Add Player & Score" card: when categories are on, add a **Category** select next to the player picker. New-player flow accepts a category too. Existing players show their category as a small badge in the picker and can be re-assigned via a tiny dropdown in the leaderboard table row.
- Leaderboard table: when categories are on, group rows by category (sub-headings) so admin sees the same split as the bay screen.

## 3. Create dialog — `QuickCompetitionDialog.tsx`

Add an optional **Categories** field (comma-separated, default `Men, Ladies`) only shown when the new "Use categories" switch is ticked. On submit, the categories are inserted alongside the competition.

## 4. Bay-screen view — `QuickCompetitionPublic.tsx`

- Fetch categories + players (with category_id) + attempts.
- If `categories_enabled` is false → render exactly as today (one Longest + one Straightest board).
- If true → render a section per category, each with its own **Longest Drive** and **Straightest Drive** white cards. Players without a category fall under an "Unassigned" section (hidden if empty). Existing realtime subscriptions cover the new tables (add a channel for `quick_competition_categories`).

## 5. End-competition edge function — `quick-competition-end/index.ts`

- If `categories_enabled` is false → unchanged (overall winners + 2 cards).
- If true → for each category compute longest/straightest from that category's attempts, generate one SVG per (category × award), upload to `quick-comp-sponsors` bucket (existing), and write the array into `category_winners`. The SVG template gets a small "{Category Name}" line under the title so the cert is self-explanatory. Overall winner columns stay null in this mode.

## 6. Hooks — `useQuickCompetitions.ts`

- New `useQCCategories(competitionId)` query + realtime.
- `useAddCategory`, `useRenameCategory`, `useRemoveCategory`, `useToggleCategoriesEnabled`.
- `useAddPlayer` accepts an optional `category_id`.
- `useUpdatePlayerCategory(playerId, category_id | null)`.
- Extend `buildLeaderboards` to accept an optional `category_id` filter, or add `buildLeaderboardsByCategory(players, attempts, categories)` returning a map.

## Out of scope

- No change to paid-entry flow — paid players land in "Unassigned" until admin assigns them a category (or we can add a category picker on the join page later if you want).
- Existing certificates for already-ended comps stay as-is.
