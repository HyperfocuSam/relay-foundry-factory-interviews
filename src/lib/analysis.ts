import {
  outcomeLabels,
  paragraphs,
  type Decision,
  type Session,
} from "./interviews.ts";
export type Citation = { sourceId: string; paragraph: number; quote: string };
export type ReportDraft = {
  overview: (Citation & { text: string })[];
  missingInformation: string[];
  recommendation: Decision;
  evidence: Citation[];
};
export type SuggestedStep = Citation & {
  id: string;
  text: string;
  conditions: string;
};
export type SuggestedQuestion = Citation & {
  id: string;
  question: string;
  reason: string;
};
export type Analysis = {
  id: string;
  revision: number;
  model: string;
  createdAt: string;
  steps: SuggestedStep[];
  questions: SuggestedQuestion[];
  report?: ReportDraft;
};
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number, empty = false): value is string =>
  typeof value === "string" && value.length <= max && (empty || !!value.trim());
export function validateAnalysis(
  value: unknown,
  session: Session,
  sourceIds: string[],
): Omit<Analysis, "id" | "revision" | "model" | "createdAt"> {
  if (
    !object(value) ||
    !Array.isArray(value.steps) ||
    !Array.isArray(value.questions) ||
    value.steps.length > 20 ||
    value.questions.length > 5
  )
    throw new Error("Invalid analysis structure.");
  function citation(item: Record<string, unknown>): Citation {
    if (
      typeof item.sourceId !== "string" ||
      !sourceIds.includes(item.sourceId) ||
      !Number.isInteger(item.paragraph) ||
      !text(item.quote, 2000) ||
      item.quote.trim().length < 4
    )
      throw new Error("Invalid analysis citation.");
    const source = session.sources.find((s) => s.id === item.sourceId);
    const passage = source && paragraphs(source)[item.paragraph as number];
    if (!passage || !passage.includes(item.quote))
      throw new Error("Analysis citation does not match the original source.");
    return {
      sourceId: item.sourceId,
      paragraph: item.paragraph as number,
      quote: item.quote,
    };
  }
  let report: ReportDraft | undefined;
  if (value.report !== undefined) {
    const draft = value.report;
    if (
      !object(draft) ||
      !Array.isArray(draft.overview) || draft.overview.length > 8 ||
      !Array.isArray(draft.evidence) || !draft.evidence.length ||
      draft.evidence.length > 6 ||
      !Array.isArray(draft.missingInformation) ||
      draft.missingInformation.length > 10 ||
      !draft.missingInformation.every((item) => text(item, 1000)) ||
      !object(draft.recommendation)
    )
      throw new Error("Invalid report draft.");
    const decision = draft.recommendation;
    const fields = Object.keys(recommendationFields);
    if (
      typeof decision.outcome !== "string" ||
      !Object.hasOwn(outcomeLabels, decision.outcome) ||
      !fields.every((key) => text(decision[key], 2000, !["summary", "rationale"].includes(key))) ||
      ((draft.missingInformation.length || value.questions.length) &&
        decision.outcome !== "needs-info") ||
      (["ai", "automation"].includes(decision.outcome) &&
        ["alternative", "test", "baseline", "success", "stop"].some((key) => !(decision[key] as string).trim()))
    )
      throw new Error("Invalid report recommendation or unresolved information.");
    report = {
      overview: draft.overview.map((item) => {
        if (!object(item) || !text(item.text, 1500))
          throw new Error("Invalid report overview.");
        return { ...citation(item), text: item.text };
      }),
      missingInformation: draft.missingInformation as string[],
      recommendation: Object.fromEntries(
        ["outcome", ...fields].map((key) => [key, decision[key]]),
      ) as Decision,
      evidence: draft.evidence.map((item) => {
        if (!object(item)) throw new Error("Invalid report evidence.");
        return citation(item);
      }),
    };
  }
  return {
    ...(report ? { report } : {}),
    steps: value.steps.map((item) => {
      if (
        !object(item) ||
        !text(item.text, 1500) ||
        !text(item.conditions, 1000, true)
      )
        throw new Error("Invalid suggested step.");
      return {
        ...citation(item),
        id: "",
        text: item.text,
        conditions: item.conditions,
      };
    }),
    questions: value.questions.map((item) => {
      if (
        !object(item) ||
        !text(item.question, 1000) ||
        !text(item.reason, 1000)
      )
        throw new Error("Invalid suggested question.");
      return {
        ...citation(item),
        id: "",
        question: item.question,
        reason: item.reason,
      };
    }),
  };
}

export function exportReportMarkdown(session: Session, analysis: Analysis): string {
  if (!analysis.report) throw new Error("This analysis has no report draft.");
  const report = analysis.report;
  const quote = (value: string) =>
    value.split("\n").map((line) => `> ${line}`).join("\n");
  const cite = (item: Citation) => quote(
    `Source: ${session.sources.find((source) => source.id === item.sourceId)?.label ?? item.sourceId} [${item.sourceId}], paragraph ${item.paragraph + 1}\n${item.quote}`,
  );
  const lines = [
    "# Factory interview — AI report draft", "",
    "UNREVIEWED — not a confirmed workflow or pilot approval.", "",
    `Analysis: ${analysis.id} · ${analysis.createdAt} · ${analysis.model}`,
    `Source revision: ${analysis.revision} · Current session revision: ${session.revision}`,
    ...(analysis.revision !== session.revision ? ["STALE — the session has changed since generation."] : []),
    "", quote(`${session.factory} / ${session.process}\nObjective: ${session.objective}`), "",
    "## Process overview", "",
  ];
  for (const item of report.overview)
    lines.push(quote(item.text), "", cite(item), "");
  lines.push("## Workflow draft", "");
  for (const step of analysis.steps)
    lines.push(
      quote(`${step.text}\nConditions: ${step.conditions || "Not specified"}\nStatus: UNCONFIRMED`),
      "", cite(step), "",
    );
  lines.push("## Follow-up questions", "");
  for (const question of analysis.questions)
    lines.push(
      quote(`${question.question}\nReason: ${question.reason}\nOwner: unassigned · Status: open`),
      "", cite(question), "",
    );
  lines.push(
    "## Missing information", "", ...report.missingInformation.map(quote), "",
    "## Document comparison", "",
    "Automated document comparison has not been completed. Review supplied documents manually.", "",
    "## Proposed recommendation — inference requiring review", "",
    `Outcome: ${outcomeLabels[report.recommendation.outcome]}`, "",
  );
  for (const [key, label] of Object.entries(recommendationFields))
    lines.push(
      `### ${label}`, "",
      quote(report.recommendation[key as keyof Decision] || "Not provided"), "",
    );
  lines.push("## Recommendation evidence", "");
  for (const item of report.evidence) lines.push(cite(item), "");
  return lines.join("\n");
}

export const recommendationFields = {
  summary: "Recommendation",
  rationale: "Rationale",
  alternative: "Non-AI alternative",
  owner: "Proposed decision owner",
  test: "Small test",
  baseline: "Current baseline",
  success: "Success criteria",
  stop: "Stop conditions",
} as const;
