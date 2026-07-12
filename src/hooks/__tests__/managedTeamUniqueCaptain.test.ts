// Test: the partial-unique-index migration on legacy_league_team_registrations
// allows admins to create multiple managed teams in the same league, while
// still preventing a real captain from self-registering two teams in the
// same league.
//
// Pure predicate test — mirrors:
//   CREATE UNIQUE INDEX legacy_league_team_unique_captain
//     ON public.legacy_league_team_registrations (league_id, captain_user_id)
//     WHERE created_by_admin = false;
import { describe, it, expect } from 'vitest'

interface Row {
  league_id: string
  captain_user_id: string
  created_by_admin: boolean
}

function wouldViolateUniqueCaptain(existing: Row[], next: Row): boolean {
  if (next.created_by_admin) return false // partial index excludes managed rows
  return existing.some(
    (r) =>
      !r.created_by_admin &&
      r.league_id === next.league_id &&
      r.captain_user_id === next.captain_user_id,
  )
}

describe('legacy_league_team_unique_captain (partial index)', () => {
  const league = 'league-1'
  const admin = 'admin-user'
  const captain = 'captain-user'

  it('allows an admin to create multiple managed teams in the same league', () => {
    const rows: Row[] = [{ league_id: league, captain_user_id: admin, created_by_admin: true }]
    expect(
      wouldViolateUniqueCaptain(rows, {
        league_id: league,
        captain_user_id: admin,
        created_by_admin: true,
      }),
    ).toBe(false)
  })

  it('allows a managed team even when a captain-registered team exists for the same user', () => {
    const rows: Row[] = [
      { league_id: league, captain_user_id: admin, created_by_admin: false },
    ]
    expect(
      wouldViolateUniqueCaptain(rows, {
        league_id: league,
        captain_user_id: admin,
        created_by_admin: true,
      }),
    ).toBe(false)
  })

  it('still blocks a real captain from self-registering two teams in the same league', () => {
    const rows: Row[] = [
      { league_id: league, captain_user_id: captain, created_by_admin: false },
    ]
    expect(
      wouldViolateUniqueCaptain(rows, {
        league_id: league,
        captain_user_id: captain,
        created_by_admin: false,
      }),
    ).toBe(true)
  })

  it('lets the same captain register in a different league', () => {
    const rows: Row[] = [
      { league_id: league, captain_user_id: captain, created_by_admin: false },
    ]
    expect(
      wouldViolateUniqueCaptain(rows, {
        league_id: 'league-2',
        captain_user_id: captain,
        created_by_admin: false,
      }),
    ).toBe(false)
  })
})
