export type Source = {
  id: string;
  kind: "transcript" | "document";
  label: string;
  content: string;
  addedAt: string;
};

export type StepRevision = { text: string; conditions: string; at: string };
export type WorkflowStep = {
  id: string;
  text: string;
  conditions: string;
  sourceId: string;
  paragraph: number;
  confirmedBy: string;
  history: StepRevision[];
};

export type Gap = {
  id: string;
  question: string;
  owner: string;
  status: "open" | "resolved" | "unknown" | "deferred" | "declined";
  response: string;
};

export type Decision = {
  outcome: "needs-info" | "ai" | "automation" | "stop";
  summary: string;
  rationale: string;
  alternative: string;
  owner: string;
  test: string;
  baseline: string;
  success: string;
  stop: string;
};

export type Session = {
  id: string;
  factory: string;
  process: string;
  objective: string;
  reviewer: string;
  synthetic: boolean;
  createdAt: string;
  updatedAt: string;
  revision: number;
  sources: Source[];
  steps: WorkflowStep[];
  gaps: Gap[];
  decision: Decision;
};

export const outcomeLabels: Record<Decision["outcome"], string> = {
  "needs-info": "Collect more information",
  ai: "Try a small AI pilot",
  automation: "Use ordinary automation",
  stop: "Do not start a pilot",
};

// These IDs also work on the LAN HTTP deployment, where randomUUID may not exist.
export function newId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}

export function createSession(
  input: Pick<Session, "factory" | "process" | "objective" | "reviewer">,
): Session {
  const at = new Date().toISOString();
  return {
    ...input,
    id: newId(),
    synthetic: false,
    createdAt: at,
    updatedAt: at,
    revision: 1,
    sources: [],
    steps: [],
    gaps: [],
    decision: {
      outcome: "needs-info",
      summary: "",
      rationale: "",
      alternative: "",
      owner: input.reviewer,
      test: "",
      baseline: "",
      success: "",
      stop: "",
    },
  };
}

export function paragraphs(source: Source): string[] {
  return source.content
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function evidence(
  session: Session,
  step: WorkflowStep,
): string | undefined {
  const source = session.sources.find((item) => item.id === step.sourceId);
  return source ? paragraphs(source)[step.paragraph] : undefined;
}

export function blockers(session: Session): string[] {
  const result: string[] = [];
  if (!session.steps.length)
    result.push("Add at least one workflow step with a source.");
  if (
    session.steps.some((step) => !step.confirmedBy || !evidence(session, step))
  )
    result.push("Review every workflow step and its source.");
  if (
    session.gaps.some(
      (gap) => gap.status !== "resolved" || !gap.response.trim(),
    )
  )
    result.push(
      "Resolve the outstanding questions, or keep the decision not ready.",
    );
  const decision = session.decision;
  if (decision.outcome === "needs-info")
    result.push("The current outcome is to collect more information.");
  if (
    !decision.summary.trim() ||
    !decision.rationale.trim() ||
    !decision.owner.trim()
  )
    result.push("Add the recommendation, rationale, and decision owner.");
  if (
    ["ai", "automation"].includes(decision.outcome) &&
    [
      decision.alternative,
      decision.test,
      decision.baseline,
      decision.success,
      decision.stop,
    ].some((value) => !value.trim())
  ) {
    result.push(
      "Define the alternative, small test, baseline, success criteria, and stop conditions.",
    );
  }
  return result;
}

export function stage(session: Session): string {
  if (!session.sources.length) return "Planned";
  if (!session.steps.length) return "In progress";
  return blockers(session).length ? "Needs review" : "Ready for decision";
}

export function reviseStep(
  step: WorkflowStep,
  text: string,
  conditions: string,
): WorkflowStep {
  if (text === step.text && conditions === step.conditions) return step;
  return {
    ...step,
    text,
    conditions,
    confirmedBy: "",
    history: [
      ...step.history,
      {
        text: step.text,
        conditions: step.conditions,
        at: new Date().toISOString(),
      },
    ],
  };
}

export function createExample(): Session {
  const session = createSession({
    factory: "Harbour Workshop",
    process: "Incoming material inspection",
    objective:
      "Understand how the team checks incoming boards and handles exceptions.",
    reviewer: "Alex (example reviewer)",
  });
  session.synthetic = true;
  const source: Source = {
    id: newId(),
    kind: "transcript",
    label: "Example interview · synthetic",
    addedAt: session.createdAt,
    content:
      "Interviewer: What happens when a delivery arrives?\nSupervisor: We compare the delivery note with the purchase order before unloading.\n\nInterviewer: How do you inspect the boards?\nSupervisor: For our standard boards, we check the edges and surface on a sample. Custom finishes need a different inspection, but I need to confirm who owns that.\n\nInterviewer: What happens to a rejected delivery?\nSupervisor: We hold it in the marked area and ask the purchasing team to contact the supplier. We write the issue in the inspection log.",
  };
  session.sources = [source];
  session.steps = [
    {
      id: newId(),
      text: "Compare the delivery note with the purchase order.",
      conditions: "Before unloading an incoming delivery.",
      sourceId: source.id,
      paragraph: 0,
      confirmedBy: "Alex (example reviewer)",
      history: [],
    },
    {
      id: newId(),
      text: "Check a sample of the boards for edge and surface issues.",
      conditions: "Standard boards only; custom finishes need confirmation.",
      sourceId: source.id,
      paragraph: 1,
      confirmedBy: "",
      history: [],
    },
  ];
  session.gaps = [
    {
      id: newId(),
      question: "Who confirms the inspection procedure for custom finishes?",
      owner: "Alex",
      status: "open",
      response: "",
    },
  ];
  return session;
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue =>
  !!value && typeof value === "object" && !Array.isArray(value);
const strings = (value: RecordValue, keys: string[]) =>
  keys.every((key) => typeof value[key] === "string");

// Browser storage is untrusted: reject incomplete/corrupted data rather than
// silently clearing it or rendering records that cannot reference their sources.
export function parseSessions(raw: string): Session[] {
  const data: unknown = JSON.parse(raw);
  if (!record(data) || data.version !== 1 || !Array.isArray(data.sessions))
    throw new Error("Unsupported workspace data.");
  const ids = new Set<string>();
  for (const session of data.sessions) {
    if (
      !record(session) ||
      !strings(session, [
        "id",
        "factory",
        "process",
        "objective",
        "reviewer",
        "createdAt",
        "updatedAt",
      ]) ||
      typeof session.synthetic !== "boolean" ||
      !Number.isInteger(session.revision) ||
      (session.revision as number) < 1 ||
      !Array.isArray(session.sources) ||
      !Array.isArray(session.steps) ||
      !Array.isArray(session.gaps) ||
      !record(session.decision)
    )
      throw new Error("Invalid session data.");
    if (ids.has(session.id as string)) throw new Error("Duplicate session ID.");
    ids.add(session.id as string);
    for (const source of session.sources) {
      if (
        !record(source) ||
        !strings(source, ["id", "label", "content", "addedAt"]) ||
        !["transcript", "document"].includes(source.kind as string) ||
        !(source.content as string).trim()
      )
        throw new Error("Invalid source data.");
    }
    for (const step of session.steps) {
      if (
        !record(step) ||
        !strings(step, [
          "id",
          "text",
          "conditions",
          "sourceId",
          "confirmedBy",
        ]) ||
        !Number.isInteger(step.paragraph) ||
        (step.paragraph as number) < 0 ||
        !Array.isArray(step.history) ||
        step.history.some(
          (revision: unknown) =>
            !record(revision) ||
            !strings(revision, ["text", "conditions", "at"]),
        )
      )
        throw new Error("Invalid review data.");
      if (!evidence(session as Session, step as WorkflowStep))
        throw new Error("Missing source reference.");
    }
    for (const gap of session.gaps) {
      if (
        !record(gap) ||
        !strings(gap, ["id", "question", "owner", "response"]) ||
        !["open", "resolved", "unknown", "deferred", "declined"].includes(
          gap.status as string,
        ) ||
        (gap.status === "resolved" && !(gap.response as string).trim())
      )
        throw new Error("Invalid question data.");
    }
    if (
      !strings(session.decision, [
        "summary",
        "rationale",
        "alternative",
        "owner",
        "test",
        "baseline",
        "success",
        "stop",
      ]) ||
      !Object.hasOwn(outcomeLabels, session.decision.outcome as string)
    )
      throw new Error("Invalid decision data.");
  }
  return data.sessions as Session[];
}

const quote = (value: string) =>
  value
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

export function exportMarkdown(session: Session): string {
  const unresolved = blockers(session);
  const lines = [
    "# Factory interview — decision snapshot",
    "",
    `Revision: ${session.revision}`,
    `Updated: ${session.updatedAt}`,
    `Material: ${session.synthetic ? "Synthetic example" : "User-entered material"}`,
    "",
    "## Session",
    "",
    quote(
      `${session.factory} / ${session.process}\nObjective: ${session.objective}\nReviewer: ${session.reviewer}`,
    ),
    "",
    "## Decision",
    "",
    `Status: ${unresolved.length ? "NOT READY" : "Ready for decision — not pilot approval"}`,
    `Outcome: ${outcomeLabels[session.decision.outcome]}`,
    "",
  ];
  for (const [key, label] of Object.entries({
    summary: "Recommendation",
    rationale: "Rationale",
    alternative: "Non-AI alternative",
    owner: "Decision owner",
    test: "Small test",
    baseline: "Current baseline",
    success: "Success criteria",
    stop: "Stop conditions",
  })) {
    lines.push(
      `### ${label}`,
      "",
      quote(session.decision[key as keyof Decision] || "Not provided"),
      "",
    );
  }
  lines.push(
    "## Outstanding requirements",
    "",
    ...(unresolved.length
      ? unresolved.map((item) => `- ${item}`)
      : ["None for this draft review."]),
    "",
    "## Workflow and evidence",
    "",
  );
  for (const [index, step] of session.steps.entries()) {
    const source = session.sources.find((item) => item.id === step.sourceId)!;
    lines.push(
      `### Step ${index + 1}`,
      "",
      quote(step.text),
      "",
      quote(
        `Conditions: ${step.conditions || "Not specified"}\nReviewed by: ${step.confirmedBy || "UNCONFIRMED"}\nSource: ${source.label} [${source.id}], paragraph ${step.paragraph + 1}`,
      ),
      "",
      quote(evidence(session, step) || "Source missing"),
      "",
    );
    for (const revision of step.history)
      lines.push(
        `Previous wording (${revision.at}):`,
        quote(`${revision.text}\nConditions: ${revision.conditions}`),
        "",
      );
  }
  lines.push("## Follow-up questions", "");
  for (const gap of session.gaps)
    lines.push(
      quote(
        `${gap.question}\nOwner: ${gap.owner}\nStatus: ${gap.status}\nResponse: ${gap.response || "No response"}`,
      ),
      "",
    );
  lines.push(
    "## Source material",
    "",
    "Document comparison is manual and has not been independently verified.",
    "",
  );
  for (const source of session.sources)
    lines.push(
      `### ${source.kind} [${source.id}]`,
      "",
      quote(`${source.label}\nAdded: ${source.addedAt}`),
      "",
      quote(source.content),
      "",
    );
  return lines.join("\n");
}
