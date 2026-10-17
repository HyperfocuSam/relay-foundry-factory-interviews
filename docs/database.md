# PostgreSQL and team sign-in

## Configure the environment once

Add these **Type: Variable** values, protected and scoped to environment `ai-cup-2026`. Disable variable expansion. Make connection strings and passwords masked/hidden. Do not prefix any of these with `NEXT_PUBLIC_`.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | PostgreSQL URL for this application, using direct PostgreSQL or the session-mode pooler |
| `APP_ORIGIN` | `https://<your-public-origin>`, the public browser origin without a trailing slash; use `http://localhost:3000` for local development |
| `BOOTSTRAP_ADMIN_EMAIL` | First team member's sign-in email |
| `BOOTSTRAP_ADMIN_PASSWORD` | Initial password, 12–256 characters |

Keep the existing kubeconfig and registry variables. The bootstrap password is used only by the migration job; it is not copied into the app pod. An existing account's password is never reset during deployment.

Use a dedicated application role, not another application's runtime role or a superuser. Provision that role and an empty `ai_cup_2026` schema owned by it once with your database administrator, or give the role permission to create its schema. The same role runs this first version's migrations and runtime queries; it needs ownership of this schema and its tables, and no access to other applications' schemas. Percent-encode special characters in the URL password. Never commit a real URL.

## What a protected-main pipeline does

1. Verify code and run database integration tests against a disposable PostgreSQL instance inside the test container.
2. Build the application image.
3. Run `npm run db:migrate`, then `npm run db:create-user` against `DATABASE_URL`.
4. Only on success, sync `DATABASE_URL` and `APP_ORIGIN` into Kubernetes Secret `ai-cup-database`, patch the deployment and wait for rollout.

Migrations are ordered SQL files in `db/migrations`. `schema_migrations` stores checksums; edited applied migrations fail instead of silently drifting. Each migration runs in a transaction, and an advisory lock serializes concurrent migration jobs. Add a new file for every schema change. Keep migrations compatible with the previous running app during rolling deployments. Rollbacks of application images do not undo schema changes.

## Team access

Open `/login`. Each provisioned email/password gets a seven-day HttpOnly session cookie. Database rows store password hashes and hashed session tokens. The server checks authentication on every session API request; writes require the configured origin. All accounts currently have equal access to one team workspace, including editing and deleting interviews. There is no public signup, password-reset email, role management, or invitation UI yet.

To provision another member, run `npm run db:create-user` with `DATABASE_URL`, `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` set privately for that member. Do not put passwords directly in shell history. Rerunning for an existing email leaves its password unchanged. Deleting a user's row with an administrator connection revokes their sessions through the foreign key cascade.

## Data and migration from the prototype

`sessions` stores each interview as a JSONB aggregate with an explicit revision. Server validation, workspace-scoped queries, immutable existing source passages and transactional revision checks protect the review flow. Concurrent stale edits/deletes return 409. A save is confirmed only after PostgreSQL commits. There is no automatic live refresh: reload to see another member's latest changes.

## Local development and tests

Set `DATABASE_URL` and `APP_ORIGIN` in `.env.local` for Next.js. For command-line setup, supply the same variables through your shell environment (the scripts do not automatically read `.env.local`).

```sh
npm run db:migrate
npm run db:create-user
npm run dev
```

Run `npm run test:db` with `TEST_DATABASE_URL` pointing to a **disposable database**. It never falls back to `DATABASE_URL`. Tests verify repeat/concurrent migrations, saved multilingual data, revision conflicts, source immutability, password hashing, account bootstrap, session expiry/revocation and login throttling.

### Runner networking

### Existing schema permissions

The migration runner checks whether `ai_cup_2026` exists before creating it. A role that owns this pre-provisioned schema does not need database-wide `CREATE` permission. The original `001_workspace.sql` checksum is preserved; its redundant schema-creation statement is skipped during execution after the runner's schema check. Tables created previously by another role still require appropriate ownership/permissions.
