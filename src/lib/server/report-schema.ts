const string = { type: "string" };
const citation = {
  sourceId: string,
  paragraph: { type: "integer", minimum: 0 },
  quote: string,
};
const object = (properties: Record<string, unknown>) => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false,
});
const array = (items: unknown, maxItems: number, minItems = 0) => ({ type: "array", items, maxItems, minItems });

// The server independently checks every citation and the decision fields.
export const reportSchema = object({
  steps: array(object({ ...citation, text: string, conditions: string }), 20),
  questions: array(object({ ...citation, question: string, reason: string }), 5),
  report: object({
    overview: array(object({ ...citation, text: string }), 8),
    missingInformation: array(string, 10),
    recommendation: object({
      outcome: { type: "string", enum: ["needs-info", "ai", "automation", "stop"] },
      summary: string, rationale: string, alternative: string, owner: string,
      test: string, baseline: string, success: string, stop: string,
    }),
    evidence: array(object(citation), 6, 1),
  }),
});
