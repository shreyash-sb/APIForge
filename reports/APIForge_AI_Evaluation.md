# APIForge AI Feature Audit

**Audit date:** 2026-10-27 (Asia/Kolkata)
**Scope:** End-to-end tracing of features presented as AI or AI-assisted, deterministic and stubbed provider tests, schema/fixture evaluation, and failure-path checks.
**Credential handling:** `Backend/.env` indicates `AI_PROVIDER=google-gemini`, a configured `GEMINI_MODEL=gemini-3.5-flash`, and a non-placeholder key is present. A diagnostic command accidentally printed the key in tool output. The key value is intentionally omitted here and from all reports. It was not used for any live request after that exposure. Rotate it before reuse. **Live provider invocations: 0.**

## Executive findings

Only two product paths call the configured Gemini provider: failure diagnosis and assistant responses. Their production behavior can fall back to deterministic mock/rule-based output. The generator, payload generator, documentation generator, most agent planning, OpenAPI synthesis, and patch drafting are deterministic/template/rule-based. The former simulated AI chat stream was also deterministic and has since been removed. They do not use an LLM despite AI-oriented page or tool labels. Agent `AgentOrchestratorService` constructs an `AiProvider` but the field is not used by planning/execution; failure-analysis tool code separately calls the provider only when structured evidence is supplied.

One provider defect was reproduced and fixed: malformed outer provider JSON and syntactically valid but schema-invalid diagnosis content escaped the fallback path (or could throw during `.map`). Diagnosis now validates the structured payload and returns deterministic fallback. Regression tests cover these cases.

## Feature-by-feature assessment

| Feature | Frontend → backend/service path | Provider/model and implementation kind | Test cases and provider invocation count | Structural/schema result | Semantic quality | Failure handling / limitations |
|---|---|---|---|---|---|---|
| AI test case generation | `Frontend/src/pages/AI/TestGeneratorPage.tsx` → `Frontend/src/services/testGeneratorService.ts` → `POST /api/tests/generate` → `TestGeneratorController` → `TestGeneratorService` → `SchemaResolverService` | **No AI provider.** Deterministic OpenAPI/schema mutation rules. No model configuration. | Existing backend generator suites plus audit fixture; targeted backend suite included 5 generator tests (3 base + 2 Phase 4). Frontend generator page tests passed. **Provider calls: 0 by design.** | Valid normalized `ApiSpecification` fixture generated repeatably. Tests assert POST `/users/{id}` maps to POST `/v1/users/1`, required query/path/header/cookie/body fields, response status 201, required-property/enum/boundary/security cases, categories and limits. JSON request bodies parsed/checked for fixture-required fields. | Relevance is rule-based and constrained by the contract. Positive and mutation cases match the known fixture. Not LLM creativity or semantic review. Coverage depends on supported normalized schema keywords; unsupported constructs may be omitted. | No AI key/network dependency. Invalid/missing schema information avoids crash in existing unit tests. UI workflow and generated-suite rendering tests passed. No live provider behavior applies. |
| Request payload generation | `Frontend/src/pages/AI/JsonGeneratorPage.tsx` → `Frontend/src/lib/jsonGenerator.ts` | **No AI provider.** Deterministic schema traversal using example/default/first enum, supported types and required fields. No backend call/model. | Frontend `jsonGenerator.test.ts` (3 cases) and page suite passed. **Provider calls: 0 by design.** | JSON output parsed by the generator/page and formatted via `JSON.parse`/`JSON.stringify`; fixture verifies required nested object, array, enum and unsupported composition. No general JSON Schema validator is invoked by this UI feature. | Structural sample quality is appropriate for supported fields. Values are placeholders, not domain-realistic. Optional fields without example/default are omitted. Only first enum/example is selected. | Unsupported `oneOf`/`anyOf`/`allOf` and unknown types are reported. Recursion depth bounded at 8. No provider timeout/credential paths exist. |
| API documentation generation | `Frontend/src/pages/AI/DocumentationPage.tsx` → `Frontend/src/lib/documentationData.ts` (`specificationMarkdown`, `endpointMarkdown`) | **No AI provider.** Deterministic Markdown interpolation over normalized OpenAPI fields. No backend call/model. | Frontend `documentationData.test.ts` and documentation page suite passed. **Provider calls: 0 by design.** | Fixture verifies title, endpoint path, missing description/server placeholders; output is Markdown, not an AI-generated schema. | Documentation reports source fields and explicit missing-value placeholders; semantic relevance is entirely inherited from the input specification. It does not explain or enrich operations. | No network/key/model failure modes. Browser copy/download behavior is component-tested, not manually exercised. |
| Failure explanation / test diagnosis | `ResponseValidationPage` diagnosis action → `Frontend/src/services/diagnosisService.ts` → `/api/diagnosis/diagnose-single|batch` → `DiagnosisController` → `DiagnosisService` → `createAiProvider()`; the agent `analyze_failure` tool can use the same diagnosis path | Configured provider is Gemini (`AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`; code default model `gemini-3.5-flash`). If `AI_PROVIDER` is not `google-gemini`, deterministic `MockAiProvider` emits findings from assertion categories, execution errors and a fixed 5s latency threshold. Gemini failure falls back to that mock. | `diagnosis.test.ts` covers passing/failing assertions, execution errors, latency, batch, status preservation, sanitization and controller validation. `aiProvider.test.ts` exercises stubbed valid JSON, 401, 429 retry/success, exhausted rate limit, network rejection, timeout rejection, malformed outer JSON and invalid content shape. Stubbed diagnose calls: **12**; **2** accepted structured provider results**, 9 failure/fallback-path request calls plus one malformed but HTTP-200 outer response (see count note below). Live calls: **0**. | Diagnosis prompt requests JSON. Audit asserts configured test model path, JSON response mode and token limit; accepted outputs validate confidence, summary and finding field types/enums. Invalid outer JSON and invalid diagnosis schema now fall back. Deterministic test validation status is copied through and never overridden. | Stub fixture demonstrates an evidence-consistent response, but it is authored test data; it does **not** establish model truthfulness or real semantic quality. Mock diagnosis maps known validation categories to canned suggestions. No blind rubric or human scoring of live model outputs was possible. | Missing key throws only when Gemini is selected (verified by factory test); 401 no retry; 429 retries once, then fallback; simulated timeout/network rejection retries once; malformed content falls back. The integration timeout is simulated by rejected fetch, not a real 15s abort. Batch runs sequentially. Evidence sanitization tests redact credentials and truncate large bodies. |
| AI assistant responses | `AIAssistantPage.tsx` → `Frontend/src/services/assistantService.ts` → `/api/assistant/chat` → `AssistantController` → `AssistantService` (input/context validation, secret redaction) → Gemini or mock | Gemini `assist()` is live-provider implementation; default/fallback is deterministic mock echo/demo. Model/key selection shares `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`. | `assistant.test.ts` checks provider identity, context redaction, empty and oversized prompts. Provider stubs test success, 401, timeout rejection, and malformed provider JSON. Stubbed assistant calls: **4** (1 accepted HTTP-200 text; 3 fallback cases). Live calls: **0**. | Response is plain bounded text (max 8,000 chars), not constrained to a JSON schema. Context and prompt are length-bounded and selected context secrets are redacted. | Stub success fixture is a simple relevant 404 explanation; it does not score a real model. Mock output explicitly says mock/demo and echoes the question/context, so it is not a substantive AI answer. | 401/other non-OK status, timeout/network exception, missing candidate text and malformed response JSON return the mock response. Service rejects blank or >4,000-char messages and clips context to 12,000 chars. No live credential rejection or latency test. |
| Streaming assistant (`/api/stream/chat`) | Frontend `useSSEChat.ts` → `POST /api/stream/chat` → `StreamController.streamChat` | **Hardcoded simulation.** Emits a fixed array of eight sample tokens with delays. It does not call `AiProvider`, Gemini, or a stream model. | Source traced; no dedicated passing live AI streaming test. Existing UI hook tests do not prove model streaming. Provider calls: **0**. | SSE event shape is implemented (`step`, repeated `token`, `done`/`error`), but content is fixed text, not generated. | Output claims “contract validation completed” and “all assertions verified” irrespective of prompt/context, so semantic correctness is **not applicable / misleading demo output**. | Validates prompt presence and uses rate limiter. Client disconnect ends stream. No provider timeout/error behavior exists. Requires manual UI/protocol verification if the simulated stream is retained. |
| Agent planning/workspace | `AIAssistantPage.tsx` → agent service → `/api/agent/plan`/execute routes → `AgentOrchestratorService` and `AgentToolRegistryService` | **Rule-based/hardcoded, not LLM planning.** Goal keywords select fixed workflows and advisory strings. The orchestrator constructs an AiProvider but never uses the private field. Tool `analyze_failure` calls Gemini/mock only when structured evidence or a testcase/execution/validation triple is provided; a lone text failure message returns a hardcoded explanation. | `agentOrchestration.test.ts`, `agentPlanValidator.test.ts`, `AgentWorkspace.test.tsx` passed previously; source traced for AI provider usage. No live agent provider invocation. Calls from structured evidence route into the diagnosis tests above. | Tool contracts and bounded plans are validated. OpenAPI tool output is parsed by `OpenApiParserService`; no LLM output validation needed for fixed templates. | Keywords drive fixed workflows; natural-language interpretation is shallow and may select an irrelevant workflow based on substring. Advisory plans can overstate generated artifacts. | Tool approvals, rejection, cancellation and bounds have deterministic tests. The AI provider is unused by the orchestrator proper. |
| Agent OpenAPI synthesis and code patch “generation” | Agent plan → `AgentToolRegistryService.generateOpenapiSpec` / `generateCodePatch` | **Template/rule-based, not AI.** OpenAPI uses fixed resource templates unless endpoint inputs are supplied; patch generation uses failure-keyword regex replacements or a generic wrapper. | Existing agent orchestration tests cover tool execution. No live provider calls. Provider calls: **0** for these tools. | OpenAPI JSON is reparsed for structural validity and returns `isValid`; patch diff is a simple string and is not a full unified diff validator. | Not generative AI. Generic template can be irrelevant to arbitrary product descriptions. Patch heuristics can produce syntactically incorrect or semantically unsafe modifications; verification tool itself is a limited synthetic runner. | Invalid OpenAPI is reported through `isValid/errors`. Patch tool has no LLM/provider fallback path. Treat output as illustrative only; patch verification does not constitute a real isolated code execution. |

### Stubbed provider invocation count

The targeted provider test run used **16 intercepted fetch calls total**: diagnosis 12 and assistant 4. Three synthetic outputs were accepted (two diagnosis JSON results, one assistant text response). The remaining 13 requests consist of 12 fallback/recovery calls plus the first 429 response that triggered a retry. These are **stub transport calls, not successful live-provider invocations**. Existing mock-service tests also use injected `MockAiProvider`; they do not make network calls. No real provider call succeeded or was attempted.

## Defect found and fixed

| ID | Evidence before fix | Change | Regression evidence |
|---|---|---|---|
| AI-AUDIT-01 | A stubbed HTTP 200 with malformed outer JSON caused `GoogleAiProvider.diagnose()` to reject instead of falling back. A JSON diagnosis payload with invalid field types (including non-array `findings`) could also throw or be weakly coerced. | Catch malformed outer JSON; validate diagnosis confidence, summary, findings array and finding fields/enums before accepting; return deterministic fallback for invalid output. | Added tests for malformed outer JSON and structurally invalid provider content. Focused AI/backend suite passed after the fix. |

## Final regression execution evidence

### Earlier final regression update (2026-10-27; test counts superseded by current regression status below)

- Backend full suite after auth, SSRF, JWT, AI fallback and dependency fixes: **336 passed, 0 failed, 0 skipped**. AI provider fixtures ran with mocked fetch; zero live provider calls.
- Frontend full suite against the controlled APIForge backend: **28 files, 100 passed, 0 failed, 0 skipped**. This verifies integration plumbing with test credentials and deterministic backend/mock AI, not Gemini quality.
- Root TypeScript/production build passed. ESLint passed with 0 errors (39 Backend and 10 Frontend warnings).
- `npm audit fix` reported **0 vulnerabilities** in each updated subproject dependency tree. A subsequent audit endpoint lookup was unavailable due registry DNS; do not interpret that later retry as a separate successful scan.
- The checks below are earlier interim counts and are superseded by this update.
- Browser UAT with `AI_PROVIDER=mock` sent one synthetic assistant prompt. The UI explicitly labeled the reply “Mock/demo response” and the provider “Mock/demo (not a live LLM)”; this is one manually observed mock response only. Successful live Gemini invocations remain **0**.

- Full backend suite after all fixes: **331 passed, 0 failed, 0 skipped**; includes deterministic mock-provider paths, malformed provider output, controlled HTTP integrations, workflow and mock-server HTTP, CLI, and isolated Mongo persistence.
- Fixed-bug regression selection: **24 passed, 0 failed** (auth service/controller, request controller, and AI provider).
- Full frontend suite: **27 files; 96 passed, 2 skipped**.
- Root production build passed (Backend TypeScript and Frontend TypeScript/Vite). No live Gemini requests were made; rotate the exposed development key before live testing.

## Earlier focused test execution evidence

- Backend focused deterministic run: `AI_PROVIDER=mock node --import tsx --test test/aiProvider.test.ts test/diagnosis.test.ts test/assistant.test.ts test/testGenerator.test.ts test/testGeneratorPhase4.test.ts` — **39 tests passed** in that targeted run.
- Frontend AI/payload/docs/agent focused run: `npm test -- <seven targeted test files>` in `Frontend` — **7 files, 21 tests passed**.
- Existing generated-test fixture asserts `POST /users/{id}` is generated as POST to the configured `/v1/users/1`, includes the required query parameter, body, auth and response contract, and creates named boundary/security/schema mutations. JSON bodies are parsed and fixture fields checked in tests.
- No live-provider credentials were sent. The local key was present but became exposed through a diagnostic output; it must be rotated before live use. The key was not copied into this report or any test fixture.
- Full AI feature UI behavior still needs manual browser verification. Provider model quality, safety, latency, and semantic completeness remain unmeasured against a real Gemini response.

## Exact verification status

- **Verified (deterministic implementation and automated behavior):** Test generation, request payload generation for supported schema keywords, Markdown documentation generation, diagnosis mock behavior/sanitization, assistant mock behavior/input handling, Gemini adapter success/failure parsing through stubs, agent policies/tool contracts.
- **Partially verified:** Gemini diagnosis and assistant integration. Request construction, parsing, schema rejection, retry/fallback and relevant stub output are tested. Live Gemini functionality and semantic quality are not verified.
- **Not verified / requires manual or additional testing:** Real Gemini model response quality; browser workflows using real API server; actual provider credential acceptance after rotation; hard-abort behavior at real provider timeout duration; full SSE display (currently hardcoded); complete end-to-end agent plan approval and execution; patch safety against a real codebase.

### Final status for the demonstration

- **Verified by deterministic automated tests:** deterministic OpenAPI-driven test-case generation, JSON payload generation from supported schema fields, API documentation text generation from imported specification facts, mock diagnosis and assistant responses, Gemini request/response parsing and error classification through mocked transport, agent policy/tool bounds, backend authentication, actual local request execution, mock-server HTTP behavior, persistence against isolated Mongo, and frontend-to-backend feature journeys.
- **Partially verified:** Gemini diagnosis/assistant adapter. The backend adapter, successful-shaped outputs, malformed outputs, missing key/config selection, HTTP 401/403/429/5xx, timeout and network behavior were exercised through stubs. No successful provider invocation occurred. Semantic quality against Gemini is unmeasured.
- **Not verified / requires manual testing:** Live Gemini credentials/model behavior after rotating the previously exposed key; manual AI UI and provider failure screens; responsive browser rendering; end-to-end SSE UI (source is deterministic/hardcoded); browser auth/session/logout workflows; visual dashboard/report behavior; real account persistence in an operator-configured database. Do not treat mocked provider calls as live AI verification.

## Credential safety action

Rotate the Gemini key that was configured in the local backend environment before using the provider again. The report deliberately contains no credential value. Do not paste the replacement key into chat, logs, source, or frontend configuration.

## Follow-up note — 2026-10-27

The focused UI-URL-01 and logout follow-up made no AI implementation changes and performed no live or mocked AI provider invocations. AI evidence and limitations above remain unchanged; live provider status remains **NOT RUN**.

### Loopback UAT continuation — 2026-10-27

- Backend health for the UAT instance identified `aiProvider=mock`; no Gemini call was made.
- Repository configuration in `Backend/.env.example` and `aiProvider.service.ts` selects the provider using `AI_PROVIDER`; the Google provider reads `GEMINI_API_KEY` and `GEMINI_MODEL` (default model is `gemini-3.5-flash`).
- Secure live-test procedure if separately authorized: first rotate any previously exposed development key; place the replacement only in the local `Backend/.env` (never frontend, chat, terminal output, or reports); set `AI_PROVIDER=google-gemini`, `GEMINI_API_KEY=<rotated key>`, and `GEMINI_MODEL=gemini-3.5-flash` or a chosen configured model; restart the backend; submit one short synthetic assistant prompt; record only provider/model, status, and a redacted quality assessment; then restore `AI_PROVIDER=mock`. Do not print or copy the key or response if it could contain sensitive data.
- Current live integration test result: **BLOCKED / NOT RUN**. A rotated key was not established as available for the process, and this task did not authorize a live request. Mock-mode UAT remains distinct from provider verification.

## AUTHZ-02 focused regression update — 2026-10-27

No AI provider, AI route, prompt, or AI test implementation changed in the mock ownership remediation. The focused verification used synthetic mock-server fixtures and made **0 provider invocations** (no live calls and no new mocked AI calls). All AI feature verification, semantic-quality limitations, credential-rotation action, and live-provider status remain as recorded above. AI browser workflows are not newly verified by these backend authorization tests.

## Loopback UAT continuation — 2026-10-27

- Browser UAT ran with backend health reporting `aiProvider=mock`; no AI assistant/generation/diagnosis UI action was exercised during this phase.
- **Live AI provider invocations: 0.** No credential was read, printed, or sent. Live Gemini remains BLOCKED pending rotation of the previously exposed development key, secure local backend configuration, and explicit authorization for the single live request.
- AUTHZ-02 route ownership and the mock-server Request Builder execution are not evidence of AI functionality. Existing AI verification classifications and limitations above remain unchanged.


### SSE protocol verification — 2026-10-27

- Trace: `Frontend/src/hooks/useSSEChat.ts` implements a fetch-based SSE parser, but source search found no page importing/calling it. `Backend/src/index.ts` mounts `/api/stream` behind `requireAuth`; `POST /api/stream/chat` is rate-limited and implemented by `Backend/src/controllers/stream.controller.ts`.
- Provider/model: none. Controller emits a fixed eight-token array and does not invoke `AiProvider`, Gemini, or a model. Process was configured with `AI_PROVIDER=mock`; provider invocations were 0 (live 0, mocked provider 0).
- Executed protocol case: authenticated synthetic POST returned 200 `text/event-stream`; 10 events (1 `step`, 8 `token`, 1 `done`), first token at 86 ms and final at 653 ms. Progressive transport PASS; event structure PASS for observed sample. No UI workflow was exercised.
- Semantic quality: not an AI quality evaluation. Hardcoded sample says contract validation and all assertions completed regardless of prompt; relevance to supplied prompt is not guaranteed.
- Failure handling: implementation rejects non-string/empty prompt with 400, rate-limits calls, ends on client disconnect, and emits `error` on thrown controller error. No provider timeout/credential/network/malformed-provider handling exists here because there is no provider call.
- Limitation/defect: hook is unused by app pages; AI streaming workflow is not implemented end-to-end. At that historical point, AI-SSE-01 was open in the Bug Register. No code changed. Live Gemini calls remain 0 / NOT RUN.


### Final acceptance rerun update — 2026-10-27

- Live provider availability was not confirmed or used. The prior report states a development key had been exposed in diagnostics; no evidence of subsequent rotation was provided. It is NOT TESTED; live calls 0. Do not reuse the exposed key.
- Historical AI-SSE-01 recheck (before removal): the backend stream controller emitted hardcoded sample tokens; no stream method exists in `AiProvider` (Gemini integration uses `generateContent`); no page consumes `useSSEChat`. The hook sends JSON via raw `fetch` without the Bearer header that `authAxios` adds elsewhere, while `/api/stream` is behind `requireAuth`. The UI integration would therefore require authenticated transport as well as provider streaming. No live or mocked provider invocation occurred for this SSE check.
- Protocol was verified separately as simulated transport: 200 `text/event-stream`, 1 step, 8 tokens, 1 done. This is not AI structural/schema or semantic validation and is not counted as a successful AI provider invocation.
- AI streaming feature scope is unclear from implementation: a backend simulation and unused hook exist, but the assistant page does not link them. At that point, AI-SSE-01 remained open pending an explicit product decision; no provider dependency or architecture change introduced.


SSE retest with a different synthetic prompt again yielded the identical fixed text (`APIForge contract validation completed. All assertions verified successfully.`), delivered across eight token events from 82 ms to 652 ms. Transport is progressive; prompt relevance is demonstrably absent. Provider invocations remain 0. Classify HTTP simulation as PASS, claimed AI answer behavior as FAIL, and integrated user-facing feature as NOT IMPLEMENTED/BLOCKED.


### AI streaming product-scope assessment — 2026-10-27

The repository's root and frontend READMEs describe AI assistance without specifying streaming, and `AIAssistantPage` uses the ordinary assistant chat service rather than `useSSEChat`. Real provider streaming is therefore outside the currently documented product scope. The stream route and hook are implementation artifacts, not a verified user-facing AI capability. At that historical review, the route's fixed sample output was a simulation; provider invocations: **0**; live test: **not applicable to current scope / not run**. If product scope is expanded, implement provider streaming, authenticated client transport, UI integration, and mocked failure/regression coverage before claiming the feature. At the time of that earlier evaluation, AI-SSE-01 remained open; it was subsequently resolved by removing the simulation, as recorded below. No code changed and no tests were rerun in this scope review.


## AI streaming disposition — 2026-10-27

The canned `/api/stream/chat` simulation and unused frontend `useSSEChat` hook have been removed. They are not a supported AI feature in the documented product scope. No provider calls or live streaming tests apply. The existing AI Assistant workflow remains on the ordinary assistant chat service; its page tests passed 2/2. Agent task-event SSE is operational workflow transport, not AI-generated response streaming; Request Builder SSE is a generic client for user-configured endpoints. Focused removal regression: 1/1 passed. See the main report for full suite blockers.


## AI-SSE removal and regression status — 2026-10-27

AI-SSE-01 remains closed: `/api/stream` is not registered, its simulated controller and unused `useSSEChat` hook are absent, and the focused cleanup regression passed 1/1. The regular AI Assistant still uses its standard chat path; the full frontend suite passes 104 tests with 2 backend-dependent journeys skipped. No real streaming was introduced or claimed. AI provider live integration remains unverified as stated in this report.


### Current suite status — 2026-10-27

AI Assistant tests are included in the current passing frontend suite (**104 passed, 2 backend-dependent tests skipped**). Removal regression passed 1/1. The simulated stream removal did not alter the regular assistant service or the other SSE workflows. Live provider calls remain untested; no streaming AI feature is claimed.
