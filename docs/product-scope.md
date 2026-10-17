# Factory interview SaaS — initial product scope

Status: initial implementation plan, 2026-09-26. This document defines the four product sections requested for the Next.js starter. It does not imply that these features are already implemented or that all partners have approved the wider proposal.

## Product goal

Help a factory successor or improvement owner decide whether one factory process is ready for a small AI pilot. Capture practical knowledge through an interview, compare it with available documents, resolve important gaps, and produce a recommendation supported by traceable evidence.

The source proposal is `partner-planning-v0.2.md` supplied from the user's Downloads directory. Its main constraint is one process, one main interview, and at most one focused review. The recommendation may be to try AI, use conventional automation, collect more information, or stop.

## 1. Dashboard

**Purpose:** Give the operator one place to organize factory interviews and see what needs attention.

Planned behavior:

- Create a session with a factory/workspace name, process name, interview objective, and responsible reviewer.
- Show sessions with their stage: planned, in progress, awaiting review, or decision ready.
- Open the meeting room, review, or next steps for a selected session.
- Show missing information and pending reviews without implying that unanswered items are approved.

**Output:** A scoped session that connects its conversation, documents, review, and recommendation.

**Acceptance:** A user can create and reopen a session, distinguish its stage, and navigate to the relevant section. Empty and failed-load states explain what to do next. Persistent sessions and workspace isolation must be implemented before this is considered a working SaaS feature.

**Proposal mapping:** S0, session setup and data-use boundaries.

## 2. Meeting room

**Purpose:** Provide a familiar Google Meet–style environment for discussing one factory process.

Planned behavior:

- Display the process objective and participants alongside the conversation.
- Support meeting chat and clearly labeled microphone, camera, and leave controls if human audio/video is selected.
- Make recording consent and recording state explicit; do not start capturing on page load.
- Capture source-linked conversation material for later review, including speaker and time information where available.
- Handle denied device permissions, disconnections, and unavailable transcription visibly.
- Support importing an existing transcript as a separate path when live capture is unavailable.

**Output:** Session conversation material with its source and capture status.

**Acceptance:** For a live meeting implementation, two separate browser sessions can communicate, controls affect actual media, recording only starts after the consent flow, and ending capture releases devices. Transcription errors remain visible rather than appearing as successful output.

**Implementation:** LiveKit provides human-to-human audio/video and typed chat. Consented microphone speech capture uses Gemini batch transcription and saves an AI-labeled transcript for review. Audio drafts are temporary browser data; durable recording storage remains undecided. Google Meet is an interaction reference. AI interviewing is not implemented.

**Proposal mapping:** S1, interview capture and source material.

## 3. Session review

**Purpose:** Turn conversation material into a workflow draft that a person can check.

Planned behavior:

- Read the transcript and edit draft workflow steps, decisions, and exceptions.
- Attach relevant process documents with their date/version and permitted use.
- Link important statements back to transcript passages or document locations.
- Compare statements under the same operating conditions; distinguish conflicts, different conditions, one-sided information, and insufficient evidence.
- Let the reviewer correct, confirm, or leave a statement unresolved, preserving revision history.
- Show “document comparison not completed” when documents are unavailable.

**Output:** A reviewed workflow draft, evidence references, and unresolved questions.

**Acceptance:** Every decision-critical statement can be traced to its source or is explicitly marked as an inference or gap. Corrections retain history. Missing sources and failed analysis never produce a verified status.

**Proposal mapping:** S1–S2 and S4, structured evidence, comparison, and review snapshots.

## 4. Next steps

**Purpose:** Convert the reviewed workflow into a concrete, limited decision.

Planned behavior:

- List unanswered questions with an owner, reason, and agreed review checkpoint.
- Allow responses such as confirmed, unknown, deferred, or declined.
- Draft one pilot recommendation with the proposed change, supporting evidence, prerequisites, a non-AI alternative, responsible person, next small test, success criteria, and stop conditions.
- Support outcomes of AI pilot, conventional automation, more information needed, or no pilot.
- Export a Markdown snapshot that preserves evidence references, version, and unresolved items.

**Output:** One reviewable pilot recommendation and a bounded follow-up list.

**Acceptance:** Missing critical information produces a not-ready recommendation. No response is never treated as approval. Exported content matches the reviewed version and identifies remaining uncertainty.

**Proposal mapping:** S3–S5, follow-up, versioned evidence, and the pilot recommendation.

## Implementation status — 2026-10-01

The Next.js app includes a team workspace at `/workspace`, backed by PostgreSQL schema `ai_cup_2026` and individual email/password sign-in. It supports session creation/search, text transcript capture, source-linked manual workflow review, confirmation invalidation, questions, readiness checks and Markdown/JSON exports. Protected CI runs versioned migrations before deployment.

This does not complete the full SaaS acceptance criteria above. Live browser calls and explicit chat capture into PostgreSQL transcript sources are implemented in the current code; this status does not establish deployment or live connectivity. Each connection can use its own attendee display name, including multiple connections using one signed-in account. Audio/video recording, voice transcription, automated document comparison, AI-generated pilot recommendations, invitations, password reset, multiple organizations and role-based permissions are not implemented. Meeting chat can now feed the existing cited AI-assisted review; pilot recommendations remain manually authored. See `meetings.md` for capture boundaries and recovery. All provisioned accounts share one team workspace. See `workspace.md` and `database.md` for setup and limits.

## Suggested implementation order

1. Session creation and persistence, with a dashboard and workspace access controls.
2. One selected conversation mode, plus transcript import and clear capture states.
3. Source-linked review and correction using a small synthetic example.
4. Follow-up questions, the recommendation card, and Markdown export.

The first complete product slice should connect all four sections for one process. Implementing and measuring a factory's actual AI pilot remains a later phase.

AI-assisted transcript review is now available when configured: cited workflow suggestions and clarification questions, stored separately from confirmed work. See `ai-analysis.md`.

## Saved-transcript Gemini reports — 2026-10-07

Gemini can now draft a report from selected saved transcripts and optional documents. Drafts include cited process overviews, workflow steps and questions, missing information, and a proposed pilot recommendation with evidence and test fields. They persist in analysis runs and export as explicitly unreviewed Markdown. Human workflow confirmation and the saved decision remain separate; copy and edit a reviewed recommendation in Next steps. Earlier Qwen analysis remains supported. Automated document comparison, audio recording/transcription and live Gemini connectivity are not established by this implementation. Configuration and limits are in `ai-analysis.md`.
