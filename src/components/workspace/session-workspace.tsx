"use client";

import Link from "next/link";
import { MeetingRoom } from "./meeting-room";
import { AnalysisPanel } from "./analysis-panel";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  blockers,
  evidence,
  exportMarkdown,
  newId,
  outcomeLabels,
  paragraphs,
  reviseStep,
  stage,
  type Decision,
  type Gap,
  type Session,
  type Source,
} from "@/lib/interviews";
import {
  downloadFile,
  removeSession,
  updateSession,
  useWorkspace,
} from "@/lib/workspace-store";
import { errorText, Field, formText, Panel } from "./ui";

type View = "interview" | "review" | "next-steps";
type Commit = (
  change: (session: Session) => Session,
  message: string,
) => Promise<boolean>;

export function SessionWorkspace({ id, view }: { id: string; view: View }) {
  const { sessions, loaded, error } = useWorkspace();
  const session = sessions.find((session) => session.id === id);
  if (!loaded)
    return (
      <p role="status" className="empty-state">
        Opening your session…
      </p>
    );
  if (error)
    return (
      <div className="notice error" role="alert">
        {error} <Link href="/workspace">Return to dashboard</Link>
      </div>
    );
  if (!session)
    return (
      <div className="empty-state">
        <h1>Session not found</h1>
        <p>This session was removed or is not in your team workspace.</p>
        <Link className="button" href="/workspace">
          Back to sessions
        </Link>
      </div>
    );
  return <SessionEditor key={id} session={session} view={view} />;
}

function SessionEditor({ session, view }: { session: Session; view: View }) {
  const [feedback, setFeedback] = useState({ text: "", error: false });
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (feedback.error) feedbackRef.current?.focus();
  }, [feedback]);
  const router = useRouter();
  const href = `/workspace/${session.id}`;
  const commit: Commit = async (change, message) => {
    try {
      setFeedback({ text: "Saving…", error: false });
      await updateSession(session.id, session.revision, change);
      setFeedback({ text: message, error: false });
      return true;
    } catch (error) {
      setFeedback({ text: errorText(error), error: true });
      return false;
    }
  };
  const report = (error: unknown) =>
    setFeedback({ text: errorText(error), error: true });

  return (
    <>
      <Link href="/workspace" className="back-link">
        ← All sessions
      </Link>
      <div className="page-heading session-heading">
        <div>
          <span className="eyebrow">
            {session.factory}
            {session.synthetic && " · Synthetic example"}
          </span>
          <h1>{session.process}</h1>
          <p>{session.objective}</p>
          <div className="inline-meta">
            <span className="badge">{stage(session)}</span>
            <span>Reviewer: {session.reviewer}</span>
            <span>Revision {session.revision}</span>
          </div>
        </div>
        <button
          className="button secondary"
          onClick={() =>
            downloadFile(
              `interview-${session.id}-v${session.revision}.md`,
              exportMarkdown(session),
            )
          }
        >
          Export snapshot <span aria-hidden="true">↓</span>
        </button>
      </div>
      <nav className="session-tabs" aria-label="Session sections">
        {(
          [
            ["interview", "01", "Interview"],
            ["review", "02", "Session review"],
            ["next-steps", "03", "Next steps"],
          ] as const
        ).map(([key, number, label]) => (
          <Link
            key={key}
            href={`${href}?view=${key}`}
            aria-current={view === key ? "page" : undefined}
          >
            <span>{number}</span>
            {label}
          </Link>
        ))}
      </nav>
      {feedback.text && (
        <p
          className={`notice ${feedback.error ? "error" : "positive"}`}
          role={feedback.error ? "alert" : "status"}
          ref={feedbackRef}
          tabIndex={-1}
        >
          {feedback.text}
        </p>
      )}
      {view === "interview" && (
        <Interview session={session} commit={commit} report={report} />
      )}
      {view === "review" && (
        <Review session={session} commit={commit} report={report} />
      )}
      {view === "next-steps" && (
        <NextSteps session={session} commit={commit} report={report} />
      )}
      <details className="session-settings">
        <summary>Session details and removal</summary>
        <form
          className="form-stack"
          key={JSON.stringify([
            session.factory,
            session.process,
            session.objective,
            session.reviewer,
          ])}
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              const data = new FormData(event.currentTarget);
              const reviewer = formText(data, "reviewer");
              const factory = formText(data, "factory");
              const process = formText(data, "process");
              const objective = formText(data, "objective");
              await commit(
                (current) => ({
                  ...current,
                  factory,
                  process,
                  objective,
                  reviewer,
                  steps:
                    current.reviewer === reviewer
                      ? current.steps
                      : current.steps.map((step) => ({
                          ...step,
                          confirmedBy: "",
                        })),
                }),
                "Session updated. Reviewer changes require a fresh review.",
              );
            } catch (error) {
              report(error);
            }
          }}
        >
          <Field
            label="Factory or workspace"
            name="factory"
            value={session.factory}
            maxLength={120}
          />
          <Field
            label="Process name"
            name="process"
            value={session.process}
            maxLength={160}
          />
          <Field
            label="Interview objective"
            name="objective"
            value={session.objective}
            multiline
            maxLength={1000}
          />
          <Field
            label="Responsible reviewer"
            name="reviewer"
            value={session.reviewer}
            maxLength={120}
          />
          <div className="row">
            <button type="submit" className="button secondary">
              Save session details
            </button>
            <button
              type="button"
              className="text-button danger"
              onClick={async () => {
                if (
                  window.confirm(
                    "Remove this session and all its sources from the server? Export a snapshot first if you need a copy.",
                  )
                ) {
                  try {
                    await removeSession(session.id, session.revision);
                    router.push("/workspace");
                  } catch (error) {
                    report(error);
                  }
                }
              }}
            >
              Remove session
            </button>
          </div>
        </form>
      </details>
    </>
  );
}

function Interview({
  session,
  commit,
  report,
}: {
  session: Session;
  commit: Commit;
  report: (error: unknown) => void;
}) {
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<Source["kind"]>("transcript");
  const [reading, setReading] = useState(false);
  const [filename, setFilename] = useState("");

  async function addSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const form = event.currentTarget;
      const label = formText(new FormData(form), "label");
      if (!content.trim())
        throw new Error("Add some source text before saving.");
      if (content.length > 50000)
        throw new Error(
          "Keep each source under 50,000 characters. Split longer interviews into named parts.",
        );
      const source: Source = {
        id: newId(),
        kind,
        label,
        content: content.trim(),
        addedAt: new Date().toISOString(),
      };
      if (
        await commit(
          (current) => ({ ...current, sources: [...current.sources, source] }),
          "Source saved. You can now reference it in session review.",
        )
      ) {
        setContent("");
        setFilename("");
        form.reset();
      }
    } catch (error) {
      report(error);
    }
  }

  return (
    <div className="interview-grid">
      <div className="stack">
        <MeetingRoom
          sessionId={session.id}
          reviewer={session.reviewer}
          onSaveChat={(source) => commit(
            (current) => ({ ...current, sources: [...current.sources, source] }),
            "Meeting chat saved. Open Session review to analyze this source.",
          )}
        />
        <Panel
          title="Capture the conversation"
          description="Paste interview notes, or import a plain-text transcript. Keep the original speaker labels and timestamps if you have them."
        >
          <form className="form-stack" onSubmit={addSource}>
            <div className="field">
              <label htmlFor="source-kind">Source type</label>
              <select
                id="source-kind"
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as Source["kind"])
                }
              >
                <option value="transcript">Interview / transcript</option>
                <option value="document">Supporting document</option>
              </select>
            </div>
            <Field
              label="Source name and version"
              name="label"
              maxLength={200}
              hint="For example: Interview with supervisor, 28 Sep. Use separate sources for revised documents."
            />
            <div className="field">
              <label htmlFor="source-file">Import text file · optional</label>
              <input
                id="source-file"
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                disabled={reading}
                onChange={async (event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  setReading(true);
                  try {
                    if (!/\.(txt|md)$/i.test(file.name))
                      throw new Error(
                        "Choose a .txt or .md file. PDF and audio import are not available yet.",
                      );
                    if (file.size > 200000)
                      throw new Error(
                        "Choose a text file smaller than 200 KB.",
                      );
                    const text = await file.text();
                    if (
                      text.length > 50000 ||
                      text.includes("\u0000") ||
                      !text.trim()
                    )
                      throw new Error(
                        "Use a non-empty plain-text file under 50,000 characters.",
                      );
                    if (
                      content.trim() &&
                      !window.confirm(
                        "Replace the unsaved source text with this file?",
                      )
                    )
                      return;
                    setContent(text);
                    setFilename(file.name);
                  } catch (error) {
                    report(error);
                  } finally {
                    setReading(false);
                    input.value = "";
                  }
                }}
              />
              <small>
                {reading
                  ? "Reading file…"
                  : filename
                    ? `Loaded ${filename}; save the source to keep it.`
                    : "TXT or Markdown · up to 200 KB / 50,000 characters"}
              </small>
            </div>
            <div className="field">
              <label htmlFor="source-content">Source text</label>
              <textarea
                id="source-content"
                name="content"
                required
                maxLength={50000}
                rows={12}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Interviewer: Walk me through the last delivery…"
              />
              <small>
                Separate passages with blank lines. No timestamps or facts are
                invented.
              </small>
            </div>
            <button type="submit" disabled={reading} className="button">
              Save source <span aria-hidden="true">→</span>
            </button>
          </form>
        </Panel>
      </div>
      <div className="interview-questions">
        <Panel title="A few useful prompts">
          <ol className="prompt-list">
            <li>What triggers this process, and what comes in?</li>
            <li>Walk me through the last real example.</li>
            <li>What do you check before moving on?</li>
            <li>When would you do something differently?</li>
            <li>Who confirms the result, and where is it recorded?</li>
          </ol>
          <p className="form-note">
            Use these prompts during your call. Capture the answers below, then
            review the source material together.
          </p>
        </Panel>
      </div>
      <div className="full-width">
        <Panel
          title={`Source material (${session.sources.length})`}
          description="Sources stay unchanged once saved, so review references remain stable. Add a new source for a corrected version."
        >
          {!session.sources.length ? (
            <p className="empty-inline">
              No source material yet. Save your first interview above.
            </p>
          ) : (
            <div className="source-list">
              {session.sources.map((source) => (
                <details
                  key={source.id}
                  id={`source-${source.id}`}
                  open={session.sources.length === 1}
                >
                  <summary>
                    <span>{source.label}</span>
                    <span className="badge">{source.kind}</span>
                  </summary>
                  {paragraphs(source).map((text, index) => (
                    <div
                      className="source-passage"
                      key={index}
                      id={`source-${source.id}-${index}`}
                    >
                      <span>Paragraph {index + 1}</span>
                      <p>{text}</p>
                    </div>
                  ))}
                </details>
              ))}
            </div>
          )}
          <div className="panel-footer">
            <Link
              className="button secondary"
              href={`/workspace/${session.id}?view=review`}
            >
              Continue to review →
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Review({
  session,
  commit,
  report,
}: {
  session: Session;
  commit: Commit;
  report: (error: unknown) => void;
}) {
  const references = session.sources.flatMap((source) =>
    paragraphs(source).map((text, index) => ({
      value: `${source.id}:${index}`,
      label: `${source.label} · ¶${index + 1}: ${text.slice(0, 75)}`,
    })),
  );
  return (
    <div className="review-grid">
      <div className="stack">
        <div className="notice">
          <strong>Review the evidence, not just the wording.</strong>
          <p>
            Confirmations record the named reviewer&apos;s manual check. AI
            suggestions remain drafts until you review their evidence.
          </p>
        </div>
        <AnalysisPanel session={session} commit={commit} />
        <Panel
          title="Workflow draft"
          description={`${session.steps.filter((step) => step.confirmedBy).length} of ${session.steps.length} steps confirmed by the reviewer.`}
        >
          {!session.steps.length ? (
            <div className="empty-inline">
              <h3>Turn one passage into one step</h3>
              <p>
                Add a step using the form, then check its source and conditions
                before confirming.
              </p>
            </div>
          ) : (
            <ol className="workflow-list">
              {session.steps.map((step, index) => (
                <li key={step.id} className="workflow-step">
                  <div className="row">
                    <span className="step-number">Step {index + 1}</span>
                    <span
                      className={`badge ${step.confirmedBy ? "success" : "warning"}`}
                    >
                      {step.confirmedBy ? "Confirmed" : "Needs review"}
                    </span>
                  </div>
                  <h3>{step.text}</h3>
                  <p className="muted">
                    {step.conditions ||
                      "Applicable conditions have not been specified."}
                  </p>
                  <details className="evidence">
                    <summary>View source passage</summary>
                    <blockquote>{evidence(session, step)}</blockquote>
                    <Link
                      href={`/workspace/${session.id}?view=interview#source-${step.sourceId}`}
                    >
                      Open original source →
                    </Link>
                  </details>
                  <details className="edit-step">
                    <summary>Edit wording and conditions</summary>
                    <form
                      className="form-stack"
                      key={`${step.id}-${step.history.length}`}
                      onSubmit={async (event) => {
                        event.preventDefault();
                        try {
                          const data = new FormData(event.currentTarget);
                          const text = formText(data, "text");
                          const conditions = formText(
                            data,
                            "conditions",
                            false,
                          );
                          await commit(
                            (current) => ({
                              ...current,
                              steps: current.steps.map((item) =>
                                item.id === step.id
                                  ? reviseStep(item, text, conditions)
                                  : item,
                              ),
                            }),
                            "Step saved. Changed wording needs a fresh confirmation.",
                          );
                        } catch (error) {
                          report(error);
                        }
                      }}
                    >
                      <Field
                        label="Workflow step"
                        name="text"
                        value={step.text}
                        multiline
                      />
                      <Field
                        label="Applicable conditions"
                        name="conditions"
                        value={step.conditions}
                        required={false}
                      />
                      <button className="button secondary" type="submit">
                        Save step changes
                      </button>
                    </form>
                  </details>
                  {step.history.length > 0 && (
                    <details className="edit-step">
                      <summary>
                        Previous wording ({step.history.length})
                      </summary>
                      {step.history.map((revision, i) => (
                        <blockquote key={i}>
                          {revision.text}
                          <br />
                          <span className="muted">
                            {revision.conditions} · {revision.at}
                          </span>
                        </blockquote>
                      ))}
                    </details>
                  )}
                  <button
                    className="text-button"
                    onClick={async () =>
                      await commit(
                        (current) => ({
                          ...current,
                          steps: current.steps.map((item) =>
                            item.id === step.id
                              ? {
                                  ...item,
                                  confirmedBy: item.confirmedBy
                                    ? ""
                                    : current.reviewer,
                                }
                              : item,
                          ),
                        }),
                        step.confirmedBy
                          ? "Step returned to review."
                          : `Step confirmed as ${session.reviewer}.`,
                      )
                    }
                  >
                    {step.confirmedBy
                      ? "Reopen review"
                      : `Confirm as ${session.reviewer}`}
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div className="panel-footer">
            <Link
              className="button secondary"
              href={`/workspace/${session.id}?view=next-steps`}
            >
              Continue to next steps →
            </Link>
          </div>
        </Panel>
      </div>
      <div className="stack">
        <Panel
          title="Add a workflow step"
          description="Summarize an observed action, then attach the passage that supports it."
        >
          {!references.length ? (
            <p className="empty-inline">
              Save a transcript or document in{" "}
              <Link href={`/workspace/${session.id}`}>Interview</Link> first.
            </p>
          ) : (
            <form
              className="form-stack"
              onSubmit={async (event) => {
                event.preventDefault();
                try {
                  const form = event.currentTarget;
                  const data = new FormData(form);
                  const text = formText(data, "text");
                  const conditions = formText(data, "conditions", false);
                  const [sourceId, paragraph] = formText(
                    data,
                    "evidence",
                  ).split(":");
                  if (
                    await commit(
                      (current) => ({
                        ...current,
                        steps: [
                          ...current.steps,
                          {
                            id: newId(),
                            text,
                            conditions,
                            sourceId,
                            paragraph: Number(paragraph),
                            confirmedBy: "",
                            history: [],
                          },
                        ],
                      }),
                      "Workflow step added as a draft.",
                    )
                  )
                    form.reset();
                } catch (error) {
                  report(error);
                }
              }}
            >
              <Field label="Workflow step" name="text" multiline />
              <Field
                label="Applicable conditions"
                name="conditions"
                required={false}
                hint="Product, equipment, shift, or exception. Leave unknown conditions unresolved."
              />
              <div className="field">
                <label htmlFor="step-source">Supporting passage</label>
                <select
                  id="step-source"
                  name="evidence"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select a source passage
                  </option>
                  {references.map((reference) => (
                    <option value={reference.value} key={reference.value}>
                      {reference.label}
                    </option>
                  ))}
                </select>
              </div>
              <button className="button" type="submit">
                Add draft step
              </button>
            </form>
          )}
        </Panel>
        <div className="mini-note">
          <span className="eyebrow">Documents</span>
          <p>
            {session.sources.some((source) => source.kind === "document")
              ? "Supporting documents are available. Check their conditions and version manually alongside the interview."
              : "No supporting document has been added. Document comparison has not been completed."}
          </p>
        </div>
      </div>
    </div>
  );
}

function NextSteps({
  session,
  commit,
  report,
}: {
  session: Session;
  commit: Commit;
  report: (error: unknown) => void;
}) {
  const requirements = blockers(session);
  const [outcome, setOutcome] = useState(session.decision.outcome);
  return (
    <div className="review-grid">
      <div className="stack">
        <Panel
          title="A small, defensible next step"
          description="Write a recommendation using the reviewed workflow. This is a manual draft, not an AI-generated or approved decision."
        >
          <form
            className="form-stack"
            key={JSON.stringify(session.decision)}
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                const data = new FormData(event.currentTarget);
                const decision: Decision = {
                  outcome,
                  summary: formText(data, "summary"),
                  rationale: formText(data, "rationale"),
                  owner: formText(data, "owner"),
                  alternative: formText(data, "alternative", false),
                  test: formText(data, "test", false),
                  baseline: formText(data, "baseline", false),
                  success: formText(data, "success", false),
                  stop: formText(data, "stop", false),
                };
                await commit(
                  (current) => ({ ...current, decision }),
                  "Recommendation saved. Export includes saved values and any unresolved requirements.",
                );
              } catch (error) {
                report(error);
              }
            }}
          >
            <div className="field">
              <label htmlFor="decision-outcome">Proposed outcome</label>
              <select
                id="decision-outcome"
                value={outcome}
                onChange={(event) =>
                  setOutcome(event.target.value as Decision["outcome"])
                }
              >
                {Object.entries(outcomeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <Field
              label="Recommendation"
              name="summary"
              value={session.decision.summary}
              multiline
            />
            <Field
              label="Rationale and prerequisites"
              name="rationale"
              value={session.decision.rationale}
              multiline
              hint="Explain which reviewed steps support this recommendation and what still needs to be true."
            />
            <Field
              label="Decision owner"
              name="owner"
              value={session.decision.owner}
            />
            <Field
              label="Non-AI alternative"
              name="alternative"
              value={session.decision.alternative}
              required={false}
            />
            <Field
              label="Next small test"
              name="test"
              value={session.decision.test}
              multiline
              required={false}
            />
            <Field
              label="Current baseline"
              name="baseline"
              value={session.decision.baseline}
              required={false}
              hint="For example, the current lookup time. If unknown, add a follow-up question before proposing a pilot."
            />
            <div className="two-fields">
              <Field
                label="Success criteria"
                name="success"
                value={session.decision.success}
                multiline
                required={false}
              />
              <Field
                label="Stop conditions"
                name="stop"
                value={session.decision.stop}
                multiline
                required={false}
              />
            </div>
            <p className="form-note">
              A pilot or automation recommendation needs all test fields before
              it is ready for a decision. You can save an incomplete draft.
            </p>
            <button className="button" type="submit">
              Save recommendation
            </button>
          </form>
        </Panel>
      </div>
      <div className="stack">
        <section
          className={`readiness ${requirements.length ? "" : "is-ready"}`}
        >
          <span className="eyebrow">Saved decision status</span>
          <h2>
            {requirements.length ? "Not ready yet" : "Ready for a decision"}
          </h2>
          {requirements.length ? (
            <ul>
              {requirements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>
              The draft has reviewed evidence and completed fields. The owner
              must still decide whether to proceed.
            </p>
          )}
          <p className="form-note">
            Export includes the saved recommendation, sources, review history,
            and unresolved questions.
          </p>
        </section>
        <Panel
          title="Questions to resolve"
          description="Give each important gap an owner. No answer is never treated as approval."
        >
          <div className="gap-list">
            {session.gaps.map((gap) => (
              <details key={gap.id} className="gap-card">
                <summary>
                  <span>{gap.question}</span>
                  <span
                    className={`badge ${gap.status === "resolved" ? "success" : "warning"}`}
                  >
                    {gap.status}
                  </span>
                </summary>
                <form
                  className="form-stack"
                  key={JSON.stringify(gap)}
                  onSubmit={async (event) => {
                    event.preventDefault();
                    try {
                      const data = new FormData(event.currentTarget);
                      const status = formText(data, "status") as Gap["status"];
                      const response = formText(
                        data,
                        "response",
                        status === "resolved",
                      );
                      const owner = formText(data, "owner");
                      await commit(
                        (current) => ({
                          ...current,
                          gaps: current.gaps.map((item) =>
                            item.id === gap.id
                              ? { ...item, status, response, owner }
                              : item,
                          ),
                        }),
                        "Question updated.",
                      );
                    } catch (error) {
                      report(error);
                    }
                  }}
                >
                  <Field
                    label="Question owner"
                    name="owner"
                    value={gap.owner}
                  />
                  <label className="field">
                    Response status
                    <select name="status" defaultValue={gap.status}>
                      {[
                        "open",
                        "resolved",
                        "unknown",
                        "deferred",
                        "declined",
                      ].map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label="Response or reason"
                    name="response"
                    value={gap.response}
                    multiline
                    required={false}
                    hint="A resolved question requires a response."
                  />
                  <button className="button secondary" type="submit">
                    Save response
                  </button>
                </form>
              </details>
            ))}
          </div>
          <form
            className="form-stack gap-form"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                const form = event.currentTarget;
                const data = new FormData(form);
                const question = formText(data, "question");
                const owner = formText(data, "owner");
                if (
                  await commit(
                    (current) => ({
                      ...current,
                      gaps: [
                        ...current.gaps,
                        {
                          id: newId(),
                          question,
                          owner,
                          status: "open",
                          response: "",
                        },
                      ],
                    }),
                    "Follow-up question added.",
                  )
                )
                  form.reset();
              } catch (error) {
                report(error);
              }
            }}
          >
            <Field label="Question to resolve" name="question" multiline />
            <Field
              label="Question owner"
              name="owner"
              value={session.reviewer}
            />
            <button className="button secondary" type="submit">
              Add question
            </button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
