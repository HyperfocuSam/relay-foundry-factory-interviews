"use client";
import { useEffect, useState } from "react";
import type { Session } from "@/lib/interviews";
import type { Analysis } from "@/lib/analysis";
import { ReportDraft } from "./report-draft";
import { Panel, Field, formText, errorText } from "./ui";
type Commit = (
  change: (session: Session) => Session,
  message: string,
) => Promise<boolean>;
export function AnalysisPanel({
  session,
  commit,
}: {
  session: Session;
  commit: Commit;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState<string[]>([]);
  const [service, setService] = useState<{ provider: string; model: string } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/analysis?sessionId=${session.id}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setAnalysis(data.analysis);
        setService(data.service);
        setLoading(false);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setError(errorText(error));
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [session.id]);
  return (
    <Panel
      title="AI-assisted review"
      description={service?.provider === "gemini"
        ? "Send selected saved passages and the interview objective to Google Gemini to draft a cited report. Review each suggestion before using it."
        : "Choose saved sources to send to your configured AI service. Suggestions need your review before they become workflow drafts."}
    >
      {loading && <p role="status">Loading AI service and saved drafts…</p>}
      {!loading && !service && <p className="notice">AI is not configured. Ask the administrator to configure Gemini or Bifrost; saved drafts and manual review remain available.</p>}
      <fieldset disabled={busy || loading || !service} className="form-stack" aria-busy={busy}>
        <legend>Sources to analyze</legend>
        {session.sources.map((source) => (
          <label
            key={source.id}
            className="row"
            style={{ justifyContent: "flex-start" }}
          >
            <input
              type="checkbox"
              style={{ width: 20, height: 20 }}
              checked={selected.includes(source.id)}
              onChange={(event) =>
                setSelected((ids) =>
                  event.target.checked
                    ? [...ids, source.id]
                    : ids.filter((id) => id !== source.id),
                )
              }
            />
            {source.label} · {source.kind}
          </label>
        ))}
        {!session.sources.length && (
          <p>Save a transcript in Interview first.</p>
        )}
        <button
          type="button"
          className="button"
          disabled={!selected.length || busy || loading || !service ||
            (service.provider === "gemini" && !session.sources.some((source) => source.kind === "transcript" && selected.includes(source.id)))}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const response = await fetch("/api/analysis", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sessionId: session.id,
                  revision: session.revision,
                  sourceIds: selected,
                }),
              });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error);
              setAnalysis(data.analysis);
              setHidden([]);
            } catch (error) {
              setError(errorText(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Generating draft…" : service?.provider === "gemini" ? "Draft meeting report with Gemini" : "Analyze selected sources"}
        </button>
        {service?.provider === "gemini" && <small>Select at least one transcript. Supporting documents are optional; document comparison remains manual.</small>}
      </fieldset>
      {busy && (
        <p role="status">
          Reading source passages. This can take up to a minute; your reviewed
          steps stay unchanged.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {analysis && (
        <div className="stack">
          <p className="muted">
            AI draft · source revision {analysis.revision} · {analysis.model}.{" "}
            {analysis.revision !== session.revision &&
              "The session has changed since this analysis; review suggestions against the current workflow."}
          </p>
          <ReportDraft session={session} analysis={analysis} />
          {!analysis.steps.length && !analysis.questions.length && (
            <p>
              No supported suggestions were returned. You can continue the
              review manually.
            </p>
          )}
          {analysis.steps
            .filter((step) => !hidden.includes(step.id))
            .map((step) => (
              <section className="notice" key={step.id}>
                <h3>Suggested workflow step</h3>
                <blockquote>{step.quote}</blockquote>
                <p className="muted">
                  {session.sources.find((s) => s.id === step.sourceId)?.label} ·
                  ¶{step.paragraph + 1}
                </p>
                {session.steps.some((item) => item.id === step.id) ? (
                  <p role="status">
                    Added to workflow — still requires review.
                  </p>
                ) : (
                  <form
                    className="form-stack"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      setError("");
                      try {
                        const data = new FormData(event.currentTarget);
                        const text = formText(data, "text");
                        const conditions = formText(data, "conditions", false);
                        await commit(
                          (current) => ({
                            ...current,
                            steps: [
                              ...current.steps,
                              {
                                id: step.id,
                                text,
                                conditions,
                                sourceId: step.sourceId,
                                paragraph: step.paragraph,
                                confirmedBy: "",
                                history: [],
                              },
                            ],
                          }),
                          "AI suggestion added as an unconfirmed workflow step.",
                        );
                      } catch (error) {
                        setError(errorText(error));
                      }
                    }}
                  >
                    <Field
                      name="text"
                      label="Suggested step"
                      value={step.text}
                      multiline
                      maxLength={1500}
                    />
                    <Field
                      name="conditions"
                      label="Suggested conditions"
                      value={step.conditions}
                      multiline
                      required={false}
                      maxLength={1000}
                    />
                    <div className="row">
                      <button className="button secondary">
                        Add to workflow
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setHidden((ids) => [...ids, step.id])}
                      >
                        Hide for now
                      </button>
                    </div>
                  </form>
                )}
              </section>
            ))}
          {analysis.questions
            .filter((q) => !hidden.includes(q.id))
            .map((q) => (
              <section className="notice" key={q.id}>
                <h3>Clarification to consider</h3>
                <p>{q.question}</p>
                <p className="muted">Why ask: {q.reason}</p>
                <blockquote>{q.quote}</blockquote>
                <p className="muted">
                  {session.sources.find((s) => s.id === q.sourceId)?.label} · ¶
                  {q.paragraph + 1}
                </p>
                {session.gaps.some((g) => g.id === q.id) ? (
                  <p>Added to next steps.</p>
                ) : (
                  <div className="row">
                    <button
                      className="button secondary"
                      onClick={async () => {
                        const label = session.sources.find(
                          (s) => s.id === q.sourceId,
                        )?.label;
                        await commit(
                          (current) => ({
                            ...current,
                            gaps: [
                              ...current.gaps,
                              {
                                id: q.id,
                                question: `${q.question}\nReason: ${q.reason}\nSource: ${label} · ¶${q.paragraph + 1}\n${q.quote}`,
                                owner: current.reviewer,
                                status: "open",
                                response: "",
                              },
                            ],
                          }),
                          "Clarification added to next steps. Assign an owner and record the answer there.",
                        );
                      }}
                    >
                      Add question
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setHidden((ids) => [...ids, q.id])}
                    >
                      Hide for now
                    </button>
                  </div>
                )}
              </section>
            ))}
        </div>
      )}
    </Panel>
  );
}
