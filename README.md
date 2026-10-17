# Factory Interviews — Relay Foundry

Team **Relay Foundry**, Google Cloud AI Builder Cup 2026.

Factory Interviews helps a team capture how a factory process really works, check every workflow step against what people actually said, and decide on one small, defensible AI pilot.

**Live prototype:** https://relay-foundry-819421860460.us-central1.run.app (Google Cloud Run, us-central1). Judges' sign-in details are in the submission form.

## What it does

1. **Dashboard:** organise interview sessions around one factory process.
2. **Interview / meeting room:** paste or import transcripts, or capture meeting chat and microphone speech.
3. **Session review:** turn source passages into workflow steps; every step cites the exact passage it came from.
4. **Next steps:** resolve open questions and write a pilot recommendation with a baseline, a small test, success criteria and stop conditions.

## Built with Gemini

- **Speech transcription:** meeting audio is sent to the Gemini API (`generateContent` with inline audio) and returned as a transcript in its original language (English or Chinese).
- **Cited meeting report:** saved transcripts go to Gemini with a JSON-schema structured output. It returns a process overview, workflow steps, clarification questions, missing information and a proposed recommendation. The server rejects any citation whose quote is not found verbatim in the selected source.
- Model: `GEMINI_MODEL` (the live deployment uses `gemini-3.8-flash`).

## Architecture

- Next.js 16 (App Router, standalone output) on Node 24, packaged by the included `Dockerfile`.
- Google Cloud Run (app), Cloud SQL for PostgreSQL (sessions, team sign-in), Secret Manager (keys), Artifact Registry and Cloud Build (images).
- LiveKit for optional live calls. Without LiveKit configured, the call shows "not configured" and the rest of the app still works.
- An optional Qwen provider (OpenAI-compatible gateway) is kept for workflow suggestions. The live deployment uses Gemini only (`AI_ANALYSIS_PROVIDER=gemini`).

## Run locally

```bash
cp .env.example .env.local   # fill in DATABASE_URL, APP_ORIGIN=http://localhost:3000, GEMINI_API_KEY, GEMINI_MODEL
npm ci
npm run db:migrate
BOOTSTRAP_ADMIN_EMAIL=you@example.com BOOTSTRAP_ADMIN_PASSWORD='a-long-password' npm run db:create-user
npm run dev                  # http://localhost:3000/login
```

Checks: `npm run lint`, `npm run type-check`, `npm test`, `npm run build`.

## Deploy to Cloud Run

See `deploy/cloudrun/`: `cloudbuild.app.yaml` (app image from the root `Dockerfile`), and `Dockerfile.migrate` plus `cloudbuild.migrate.yaml` (a one-off Cloud Run Job that applies `db/migrations` and creates the first sign-in account). Runtime variables are listed in `.env.example`. `APP_ORIGIN` must equal the public service URL exactly.

## Docs

[Product scope](docs/product-scope.md) · [Workspace](docs/workspace.md) · [Meetings](docs/meetings.md) · [AI analysis](docs/ai-analysis.md) · [Database](docs/database.md)

## Credits and licence

Original author: RaymondYKL (ray-yan). Team Relay Foundry. MIT License, see [LICENSE](LICENSE).
