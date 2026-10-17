# Using the interview workspace

Open `/workspace` and sign in with a provisioned team account. Interviews are stored in PostgreSQL and shared with all signed-in team members. Selected source passages are sent to the configured model only when you request AI analysis. See [database and deployment setup](database.md).

## Walk through a session

1. Create a session with its factory, process, objective, and reviewer, or open the clearly marked synthetic example.
2. In **Interview**, optionally join a live meeting and explicitly capture its chat, stop capture, then save it as a source (see [meetings](meetings.md)). You can also paste notes or import a `.txt` / `.md` transcript. Give each source a name and version. Blank lines separate source passages; speaker labels and supplied timestamps are kept as text. Supporting documents use the same plain-text input.
3. In **Session review**, optionally analyze selected sources to generate cited suggestions, or write a workflow step and choose its supporting passage. When Gemini is configured, **Draft meeting report with Gemini** generates a saved, unreviewed report with a process overview and proposed recommendation; download its Markdown draft separately. Add selected suggestions, check their evidence, and enter your reviewed recommendation in Next steps. Record applicable conditions and manually confirm as the named reviewer. Editing wording or conditions clears that step's confirmation and retains prior wording. Changing the session reviewer clears all confirmations.
4. In **Next steps**, assign important questions to an owner. A resolved question requires a response; unknown, deferred, and declined questions remain outstanding. Save a recommendation, including a small test, baseline, non-AI alternative, success criteria, and stop conditions for pilot/automation outcomes.
5. Export a Markdown snapshot. It contains the saved revision, source material, workflow evidence, prior step wording, questions, and readiness requirements. Unsaved form text is not included.

## Readiness means reviewable, not approved

At least one source-linked workflow step must be confirmed, no question can remain unresolved, and the decision fields must be completed before the draft is shown as ready for a decision. Choosing “collect more information” deliberately keeps it not ready. These checks verify completeness of a manual draft; they do not prove accuracy, authority, safety, ROI, or suitability for AI. Confirmation names are user-entered, not authenticated identities.

## Storage and recovery

- Save forms explicitly before navigating. Unsaved form text is not persisted.
- Up to 30 interviews per team, 100 sources per interview, 50,000 characters per source, and 2 MB per saved interview.
- Sources remain immutable; add a corrected version instead of changing original text.
- Use **Import earlier browser interviews** to copy legacy local records into the shared team workspace. Importing shares those records with the team. Original local data is retained.
- Export JSON backups or Markdown snapshots before removing sessions. There is no JSON restore UI yet.
- A failed save retains your draft. If another member saves first, reload after retaining your draft; stale revisions are rejected. Reload to see other members' changes.
- Every account currently has equal read/write/delete access. Confirmation names are descriptive reviewer labels, not verified signatures or approval permissions.

## Not implemented

Audio/video recording, automatic voice transcription, automated document comparison, PDFs, account invitations, password reset emails, role management, multiple organizations and actual factory pilot execution. Live meetings and explicit text-chat capture are implemented; see [meetings](meetings.md).

## Verification

`npm test` covers review rules and exports. `npm run test:db` verifies migrations, persistence and sign-in against a disposable database. Also run lint, type checks, production build and browser tests for sign-in, shared sessions, import/review/export, concurrent edits and sign-out.

See [AI analysis setup](ai-analysis.md) for Bifrost configuration and review limits.
