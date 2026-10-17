# Gemini analysis and meeting reports

Gemini is the only inference provider for speech transcription, workflow suggestions,
clarification questions, process overviews and proposed pilot recommendations.
Qwen/Bifrost routing has been removed. Retired provider selectors and Qwen credentials
cannot switch the app away from Gemini and can be removed from GitLab settings.
Previously saved analysis remains readable with its original model provenance; it is
not relabeled as Gemini output. Regenerate a draft to produce a new Gemini report.

## Configuration

Set server-only `GEMINI_API_KEY` and `GEMINI_MODEL`. Select a model available to your
key that supports both audio input and structured text output. For local Next.js use
.env.local; for Compose use .env as described in handover.md. Never use NEXT_PUBLIC_
for credentials. `npm run ai:models` lists candidate models without sending interviews;
catalog membership alone does not verify usable quota or audio capabilities.

In GitLab, use protected variables scoped to ai-cup-2026, expansion disabled.
Mask/hide the API key. CI syncs the Gemini configuration to the app. If both model
and key are absent, manual review remains available; partial configuration fails.
No database migration is needed for this provider change.

The default API is Google's native HTTPS generateContent endpoint. Run the server in a region where the Gemini API is available (the live deployment uses Cloud Run in us-central1). `GEMINI_BASE_URL` and `GEMINI_GATEWAY_KEY` are only needed for an optional authenticated relay.

## Review flow

Save speech, chat or imported text as a transcript source first. In Session review,
select at least one transcript and optional plain-text documents, then choose
**Draft meeting report with Gemini**. Only selected saved sources and the objective
are sent. Consent and speech recovery are documented in meetings.md.

The saved unreviewed draft includes cited steps, questions/reasons, an overview,
missing information and a proposed recommendation. Exact quotes and source IDs are
validated; that cannot prove an interpretation is true. Missing information requires
a needs-info recommendation. Draft generation never overwrites confirmed workflow
steps or the manually saved decision. Add reviewed suggestions and edit the final
recommendation in Next steps. Download report draft exports the separate unreviewed
report; Export snapshot exports the saved reviewed session.

Sources are capped at 40,000 characters including labels per analysis request,
responses at 1 MB, model output at 8,192 tokens, and provider requests at 60 seconds.
Requests require sign-in, origin checks, rate limits and session revision checks.
Failures leave saved interviews unchanged. Incomplete output and invalid citations
are rejected. Stale report exports carry a warning.

Automated document comparison, an AI interviewer, durable audio archives and automatic
approval are not implemented. See workspace.md and meetings.md for boundaries.

## Verification

Run npm test, npm run lint and npm run type-check. Gemini tests cover native requests,
report/citation validation, multilingual output, thought filtering, incomplete output,
secrets, and failure recovery. Configuration tests verify retired settings cannot
select another provider. Deployment must additionally verify a real saved transcript
produces a Gemini report and remains readable after reload.

Reference: https://ai.google.dev/gemini-api/docs/structured-output
