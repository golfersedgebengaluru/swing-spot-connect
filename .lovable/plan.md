# Add GitHub Actions quality gates

## Build
- Add `.github/workflows/ci.yml` for pushes and pull requests to `main`, using the repository lockfile to install dependencies, then running `npm test` and `npm run build` as separate required steps.
- Add a separate nightly/manual migration-drift workflow that reads the production migration ledger through a GitHub Actions secret, compares applied migration versions with every repository migration filename, prints every missing migration, and exits non-zero when drift or configuration errors are found.
- Keep the drift check strictly read-only and change no application files, migrations, or database state.

## Verification
- Validate both workflow files locally.
- Run the complete test suite and production build.
- Prove failure propagation by temporarily introducing a deliberately failing test outside committed project files, running the same test command, recording its non-zero result, and removing it immediately.

## Technical details
- The drift workflow will expect a GitHub repository secret named `PRODUCTION_DATABASE_URL` with read access to production PostgreSQL. It will query only `supabase_migrations.schema_migrations` and compare the ledger `version` values to the leading numeric version in each `supabase/migrations/*.sql` filename.
- If the secret is absent, inaccessible, or the ledger query fails, the scheduled check fails rather than silently passing.
- Notifications remain GitHub-native only: failed workflow runs and GitHub's standard Actions notifications. No external notification channel will be wired.
- Branch protection cannot be guaranteed from workflow code. After the first CI run, require the CI job's status check in GitHub's `main` branch protection/ruleset and require branches to be up to date before merging.
