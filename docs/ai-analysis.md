# Gemini report drafting and Qwen transcript analysis

## Gemini: saved transcript → report draft

Set `AI_ANALYSIS_PROVIDER=gemini`, `GEMINI_API_KEY`, and `GEMINI_MODEL` on the server. Choose a Gemini model available to your key that supports structured text output. The model is explicit rather than hardcoded. For local Next.js development, put these values in the ignored `.env.local`. Never use `NEXT_PUBLIC_` for the key.

If you only have a key, set `GEMINI_API_KEY` in `.env.local` and run `npm run ai:models`. No model setting is needed for this discovery command. It calls Google's [model-list endpoint](https://ai.google.dev/api/models#method:-models.list), follows pagination, and prints candidate Gemini names supporting `generateContent` without printing the key. The command does not generate content or send interview data. Catalog membership alone does not verify audio support, model access for inference or usable quota; check the candidate's capabilities and run a small relevant test before setting `GEMINI_MODEL`. For meeting transcription, verify audio input support separately. Do not paste the API key into chat or commit `.env.local`.

For deployment, add the same variables to this project's GitLab CI/CD variables: Type **Variable**, **Protected**, your deployment environment scope, expansion disabled; mark `GEMINI_API_KEY` **Masked and hidden**. App CI syncs them into `ai-cup-llm` and patches the app's environment references. No database migration is needed: the full report is stored in the existing analysis run JSONB. This implementation does not configure your key or deploy itself.

Set `AI_ANALYSIS_PROVIDER=qwen` for the existing Qwen3 workflow review, or `gemini` for report drafting. Both credential bundles can coexist; one provider handles each analysis request, and requests are not sent to both. This is a server deployment setting, not a browser selector. With the selector unset, existing Qwen configuration takes priority; Gemini is selected automatically only when there is no Qwen configuration. Adding a Gemini key therefore does not replace the existing Qwen workflow. Partial configuration fails visibly rather than switching services. All supplied provider bundles must be complete for CI deployment.

In **Session review → AI-assisted review**, select at least one saved transcript and optional supporting documents, then click **Draft meeting report with Gemini**. The page identifies Google Gemini as the recipient before submission. Only selected saved passages and the interview objective are sent. The server calls Google's native `generateContent` endpoint with a structured JSON schema and the API key in a server-only header. See Google's [structured output documentation](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).

The report includes a cited process overview, workflow suggestions with conditions, cited follow-up questions, missing information, and one proposed recommendation with its evidence, non-AI alternative, owner, small test, baseline, success criteria and stop conditions. Unknown fields remain empty. Unanswered questions or listed missing information require the outcome **Collect more information**. Citation validation checks quoted passages; it cannot establish the truth of an interpretation. Recommendations are explicitly labeled inferences requiring review.

For the current text-report feature, the selected model is `GEMINI_MODEL` (recommended candidate: `gemini-3.8-flash`, subject to testing with your key). The proposed audio pipeline uses a separate `GEMINI_TRANSCRIPTION_MODEL=gemini-3.5-transcribe`; that variable is reserved for future implementation and is not read or deployed by the current code. Do not put the dedicated transcription model into the text-report setting. Recording, upload and the transcription API adapter still need to be implemented before spoken meetings can feed Qwen analysis.

Reports persist separately from reviewed session data and can be reopened after reload. **Download report draft** exports Markdown with the generation model/time, source revision, citations, unreviewed status and a stale warning if the session has changed. Add selected steps and questions through the existing controls, confirm workflow steps manually, and edit/save the recommendation in **Next steps**. Generation never overwrites confirmed steps or the saved decision, and the existing decision snapshot remains a separate export of reviewed work.

Automated document comparison is not implemented or claimed. This slice accepts saved text only; it does not record meetings, transcribe audio, or generate PDFs. Meeting chat must still be explicitly captured and saved, or a transcript imported, before report generation. Limits, throttling, revision checks and recovery below apply to both providers; Gemini's output budget is 8,192 tokens.

## Qwen through Bifrost

## GitLab variables

Set these in the **ai-builder-cup-2026** project's CI/CD variables, Type **Variable**, **Protected**, your deployment environment scope, variable expansion disabled:

| Variable | Value |
| --- | --- |
| `AI_ANALYSIS_PROVIDER` | `qwen` for the current Qwen3 review; `gemini` for report drafting |
| `QWEN_BASE_URL` | `https://<your-bifrost-gateway>/v1`, or the reachable private Bifrost base URL ending in `/v1` |
| `QWEN_MODEL` | `vllm-qwen3-6-35b-a3b/qwen3.6-35b-a3b` |
| `QWEN_BIFROST_VIRTUAL_KEY` | Your Qwen app-specific Bifrost virtual key; **Masked and hidden** |
| `GEMINI_API_KEY` | Your Google Gemini API key; **Masked and hidden** |
| `GEMINI_MODEL` | A Gemini model available to the key that supports structured text output |

### Migrating existing variable names

Copy the existing values to their provider-specific names, then set the shared selector explicitly:

| Existing name | New name |
| --- | --- |
| `LLM_BASE_URL` | `QWEN_BASE_URL` |
| `LLM_MODEL` | `QWEN_MODEL` |
| `BIFROST_VIRTUAL_KEY` | `QWEN_BIFROST_VIRTUAL_KEY` |
| `LLM_PROVIDER=bifrost` | `AI_ANALYSIS_PROVIDER=qwen` |
| `LLM_PROVIDER=gemini` | `AI_ANALYSIS_PROVIDER=gemini` |

Old names remain fallback aliases. Nonempty new names take precedence, including the selector; existing Qwen deployments do not require an immediate variable migration. CI resolves names before deployment, writes both canonical names and synchronized legacy aliases into `ai-cup-llm`, and adds their app environment references. Keeping the aliases supports older application images and rollbacks. Never copy the Qwen virtual key into `GEMINI_API_KEY`: they authenticate different services. These code changes do not modify GitLab's stored variables automatically.

The app uses the exact header `x-bf-vk: <key>`, without a `Bearer` prefix. This works with legacy Bifrost virtual keys too. Create/restrict the key in Bifrost to the provider/model above and set appropriate request/token budgets there.

## Deployment

App CI writes the provider-specific variables, selector and compatibility aliases into Secret `ai-cup-llm` in namespace `ai-cup-2026`, then patches the Deployment's app environment references. The sibling infrastructure manifest may still contain the legacy references; application CI supplies the current references. No key belongs in git, public environment variables, build arguments, or browser code. Partial configuration stops deployment. With both credential bundles and the selector unset, manual review remains available and analysis explains that it is unconfigured.

Migration `003_ai_analysis.sql` adds saved analysis runs and shared per-account throttling. It runs before app rollout through the existing migration job. Successful runs retain the model, requesting user, input revision and output; removal of an interview deletes its runs. Removing a user revokes access while retaining analysis with a null requester.

## Review flow

In **Session review → AI-assisted review**, select sources, then analyze. Only those saved passages and the interview objective are sent. Up to 40,000 input characters (including labels) are accepted; longer input is rejected, never silently truncated. Output is capped at 20 steps and 5 selective questions.

Every suggestion must reference a selected source paragraph with a matching verbatim quote. Invalid or truncated output fails without changing the interview. These checks validate references, not the truth of the generated interpretation. Reviewer confirmation is still required.

Edit a suggested step before **Add to workflow**. It is saved as unconfirmed. **Add question** saves an open question, its reason and quoted evidence under Next steps, initially assigned to the session reviewer. **Hide for now** only hides a suggestion in the current view; reload restores hidden suggestions. Accepted suggestions are identified by stable IDs. Reanalysis creates a separate run and never replaces saved steps, questions or confirmations. The most recent run is shown after reload; older runs remain in the database.

If the interview changes during generation, the response is rejected or subsequently marked as based on an older revision. Saving still uses the existing revision checks. There is a 60-second gateway timeout, a bounded response size, and at least 30 seconds between analyses per signed-in account; an in-flight lease blocks parallel requests from that account across app replicas. No automatic retries spend extra model capacity.

The Bifrost slice does not generate pilot recommendations. Neither provider implements an AI interviewer, live transcription, or automated approval. Clarification answers continue to be recorded manually in Next steps.

## Validation

`tests/gemini-report.test.mjs` verifies native Gemini requests, structured output, report citations, incomplete/blocked responses, error redaction, provider selection, unchanged reviewed data and Markdown draft exports. Live Gemini inference requires a configured key/model and is not established by mocked tests.

`tests/ai-config.test.mjs` checks runtime and CI naming, provider selection, default preservation of Qwen, legacy migration/rollback aliases, and incomplete configurations without connecting to GitLab, Kubernetes or either model service.
