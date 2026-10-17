"use client";

import { outcomeLabels, type Session } from "@/lib/interviews";
import {
  exportReportMarkdown,
  recommendationFields,
  type Analysis,
  type Citation,
} from "@/lib/analysis";
import { downloadFile } from "@/lib/workspace-store";

export function ReportDraft({ session, analysis }: { session: Session; analysis: Analysis }) {
  const report = analysis.report;
  if (!report) return null;

  function evidence(item: Citation) {
    return (
      <>
        <blockquote>{item.quote}</blockquote>
        <p className="muted">
          {session.sources.find((source) => source.id === item.sourceId)?.label}
          {" · "}¶{item.paragraph + 1}
        </p>
      </>
    );
  }

  return (
    <section className="notice stack" aria-label="Meeting report draft">
      <h3>Meeting report draft · unreviewed</h3>
      <p>
        This report is saved separately from your reviewed workflow and decision.
        Check its evidence, add the steps and questions below, then edit your
        recommendation in Next steps.
      </p>
      <button
        type="button"
        className="button secondary"
        onClick={() => downloadFile(
          `meeting-report-${session.id}-${analysis.id}.md`,
          exportReportMarkdown(session, analysis),
        )}
      >
        Download report draft
      </button>
      <h4>Process overview</h4>
      {report.overview.map((item, index) => (
        <div key={index}>
          <p>{item.text}</p>
          {evidence(item)}
        </div>
      ))}
      <h4>Missing information</h4>
      {report.missingInformation.length ? (
        <ul>
          {report.missingInformation.map((item, index) => <li key={index}>{item}</li>)}
        </ul>
      ) : (
        <p>No additional gaps identified by the model. Human review is still required.</p>
      )}
      <h4>Proposed recommendation · inference requiring review</h4>
      <p>{outcomeLabels[report.recommendation.outcome]}</p>
      <dl className="report-recommendation">
        {Object.entries(recommendationFields).map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>
              {report.recommendation[key as keyof typeof recommendationFields] || "Not provided"}
            </dd>
          </div>
        ))}
      </dl>
      <details>
        <summary>Recommendation evidence</summary>
        {report.evidence.map((item, index) => <div key={index}>{evidence(item)}</div>)}
      </details>
      <p className="muted">
        Automated document comparison has not been completed. Review supporting
        documents manually.
      </p>
    </section>
  );
}
