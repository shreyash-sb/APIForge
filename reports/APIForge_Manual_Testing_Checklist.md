# APIForge Manual Testing Checklist

**Purpose:** Run the remaining application-interface checks with synthetic data and record evidence. Existing MAN-* cases remain NOT RUN unless the entire case was executed. The selected UAT subcases actually executed on 2026-10-27 are recorded separately below; do not treat them as completion of their larger MAN-* scenarios.

**Use a dedicated local test environment and browser profile.** Do not use production data, credentials, tokens, or endpoints. Avoid sharing screenshots or DevTools exports containing secrets. Do not mark PASS from a success toast alone: verify the displayed result and relevant state changes.

## Current test run record

- Tester: ____________________
- Date/time and timezone: ____________________
- OS / browser and version: ____________________
- Git revision: ____________________
- Frontend URL: ____________________
- Backend URL: ____________________
- Test account email (synthetic only): ____________________
- Evidence folder or sanitized screenshot references: ____________________

## Status values

For each test, set exactly one status: **NOT RUN**, **PASS**, **FAIL**, or **BLOCKED**. `BLOCKED` means a required dependency, accessible UI control, or test environment prevented execution; include the reason. Add actual observations, not intended results. Keep credentials and sensitive response data out of evidence.

## Local setup and fixtures

1. From the repository root, start the backend with mock AI, no Mongo connection, and no outbound safe-mode restriction on the local-only fixture:

   ```sh
   PORT=3001 MONGODB_URI= AI_PROVIDER=mock GEMINI_API_KEY= OUTBOUND_REQUEST_SAFE_MODE=false npm run dev --prefix Backend
   ```

   This explicitly leaves MongoDB disabled even if a local `.env` contains a URI. The blank Gemini key and `AI_PROVIDER=mock` ensure this run cannot call Gemini.

2. In a second terminal, start the frontend:

   ```sh
   VITE_API_BASE_URL=http://127.0.0.1:3001 npm run dev --prefix Frontend -- --host 127.0.0.1
   ```

3. Open the URL printed by Vite. Confirm `http://localhost:3001/health` returns JSON showing `status: "ok"`, an in-memory database, and the mock provider. If the dashboard or health check is unavailable, record **BLOCKED** for dependent tests.

4. Create a synthetic account during the signup test. Use an email at `example.test` and a unique strong password. Remember that in-memory accounts disappear when the backend restarts.

5. Create controlled request targets in the **Mock Server** page (only after login):
   - `GET /manual-echo`, status 200, body `{"fixture":"manual-echo","ok":true}`.
   - `POST /manual-create`, status 201, body `{"fixture":"manual-create","created":true}`.
   - `GET /manual-not-found`, status 404, body `{"error":"synthetic not found"}`.
   - Optional `GET /manual-server-error`, status 500, body `{"error":"synthetic server error"}`.
   - Invoke them through `http://localhost:3001/api/mock/serve/manual-echo` (and corresponding path). These stay on the local backend. Do not add a real external endpoint.

6. For OpenAPI-driven tests, prepare this small fixture as a local `.json` file and import it in the OpenAPI page. Its server points only to the local APIForge mock dispatcher:

   ```json
   {
     "openapi": "3.1.0",
     "info": { "title": "Manual QA API", "version": "1.0.0", "description": "Synthetic APIForge UI fixture" },
     "servers": [{ "url": "http://localhost:3001/api/mock/serve" }],
     "paths": {
       "/manual-echo": {
         "get": {
           "operationId": "getManualEcho",
           "summary": "Read synthetic status",
           "parameters": [{ "name": "trace", "in": "query", "required": true, "schema": { "type": "string", "example": "qa-1" } }],
           "responses": { "200": { "description": "OK", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ManualEcho" } } } } }
         }
       },
       "/manual-create": {
         "post": {
           "operationId": "createManualItem",
           "summary": "Create synthetic item",
           "requestBody": { "required": true, "content": { "application/json": { "schema": { "$ref": "#/components/schemas/CreateItem" }, "example": { "name": "sample", "active": true } } } },
           "responses": { "201": { "description": "Created" }, "400": { "description": "Bad request" } }
         }
       }
     },
     "components": {
       "schemas": {
         "ManualEcho": { "type": "object", "required": ["fixture", "ok"], "properties": { "fixture": { "type": "string", "enum": ["manual-echo"] }, "ok": { "type": "boolean", "default": true } } },
         "CreateItem": { "type": "object", "required": ["name"], "properties": { "name": { "type": "string", "minLength": 2, "example": "sample" }, "active": { "type": "boolean", "default": true } } }
       },
       "securitySchemes": { "qaKey": { "type": "apiKey", "in": "header", "name": "X-QA-Key" } }
     }
   }
   ```

   If the UI parser rejects the fixture, record the import error and stop dependent tests; do not silently edit the contract while evaluating generated output.

## Authentication and session

### MAN-AUTH-01 — Signup with valid synthetic account

- **Prerequisites:** Backend and frontend running; signed-out browser; unique synthetic email.
- **Steps:**
  1. Open `/signup`.
  2. Submit with a blank name and inspect inline validation.
  3. Submit with malformed email; inspect the message.
  4. Enter a strong password that satisfies every displayed rule and a mismatching confirmation; submit.
  5. Correct the confirmation and submit.
  6. Inspect the redirect, displayed name, Settings account panel, and network response with token values redacted.
- **Expected result:** Invalid forms stop locally with useful messages. Valid signup creates one account, signs the user in, and routes to Dashboard. Public signup must not grant an elevated role.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-AUTH-02 — Login success, invalid credentials, and lockout feedback

- **Prerequisites:** Account from MAN-AUTH-01; signed out.
- **Steps:**
  1. Open `/login`; submit an unknown synthetic email and incorrect password.
  2. Confirm the UI remains signed out and shows a useful error without exposing stack traces.
  3. Sign in using the valid synthetic account.
  4. Verify Dashboard and account name; refresh login activity in Settings.
  5. If safely using a disposable account, submit wrong passwords only up to the configured lockout threshold and observe the response; stop once locked rather than continuing attempts.
- **Expected result:** Invalid credentials are rejected; valid credentials enter the workspace. Repeated failures produce a controlled lockout/rate-limit message and do not disclose whether an account exists beyond the intended UI behavior.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-AUTH-03 — Logout, browser navigation, and token revocation

- **Prerequisites:** Signed-in synthetic account.
- **Steps:**
  1. Use the app’s account/logout control.
  2. Open `/dashboard` directly and use browser Back/Forward.
  3. Confirm signed-out behavior.
  4. In DevTools, inspect only whether `apiforge-auth-session` is cleared; do not copy the token.
  5. If comfortable using DevTools, send the old token to `GET /api/auth/me` and verify it is rejected after logout; redact the token from any captured evidence.
- **Expected result:** Client auth state is cleared and protected routes return to login. A logged-out token is revoked server-side and `/api/auth/me` rejects it.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-AUTH-04 — Refresh and session restoration

- **Prerequisites:** Signed-in synthetic account; browser DevTools Network tab open with Preserve log enabled.
- **Steps:**
  1. Note the current page and auth state.
  2. Refresh the browser tab.
  3. Observe whether the workspace returns and whether the browser makes a `/api/auth/me` request.
  4. Sign out, then use Back and refresh again.
- **Expected result:** Record both UI restoration and server validation behavior separately. The current frontend persists auth state in Zustand local storage; source review found no automatic `checkSession()` call at startup. If a cached session restores without `/me`, do not treat that as proof the backend token is valid; record it as a session-validation limitation.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-AUTH-05 — Password change and account deletion

- **Prerequisites:** Disposable synthetic account; signed in; second browser tab signed out.
- **Steps:**
  1. Open Settings and submit a wrong current password; verify an error and unchanged account.
  2. Change to a new strong test password.
  3. Sign out; verify the old password fails and the new password succeeds.
  4. In Settings, delete the disposable account using the confirmation flow.
  5. Verify the UI returns to signed-out state; try signing in with the deleted account.
- **Expected result:** Password validation is clear; successful change persists; deleted account cannot log in; protected routes are inaccessible after deletion.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

## Requests and response handling

### MAN-REQ-01 — Create and execute a GET request with query and headers

- **Prerequisites:** Signed in; `/manual-echo` mock route exists.
- **Steps:**
  1. Open Request Builder and select GET.
  2. Set URL to `http://localhost:3001/api/mock/serve/manual-echo`.
  3. Add query parameter `trace=qa-1` and header `X-QA-Run=manual-1`.
  4. Send the request.
  5. Inspect request summary and response status, headers, body, duration, and size.
- **Expected result:** The UI shows HTTP 200 and the configured JSON body. The query/header appear in the outbound request details where exposed; no unrelated external host is contacted.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-REQ-02 — JSON request body and method handling

- **Prerequisites:** `/manual-create` mock route exists.
- **Steps:**
  1. Select POST and target `http://localhost:3001/api/mock/serve/manual-create`.
  2. Enter JSON body `{"name":"sample","active":true}` and send.
  3. Repeat using PUT or PATCH if the UI supports it and a matching mock route has been configured.
  4. Inspect method, content type, body, response status and response pane.
- **Expected result:** Valid JSON is sent using the selected method; the configured status/body is displayed. The UI must not silently change the method or body.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-REQ-03 — Authentication/header variants

- **Prerequisites:** Local mock route; synthetic credentials only.
- **Steps:**
  1. Send a request with auth type None.
  2. Repeat with a disposable Bearer token, Basic username/password, API key in header, and API key in query using clearly synthetic values such as `qa-token` and `qa-key`.
  3. Inspect the controlled mock route’s logs or the request detail pane to see where each value was sent.
  4. Verify history, browser storage, reports, and screenshots do not reveal the synthetic credentials in clear text unless the UI explicitly exposes editable input state.
- **Expected result:** Each auth mode uses the configured header/query placement. Secret-like values are masked/redacted from persisted diagnostics and exported reports.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-REQ-04 — Invalid URL, invalid JSON, timeout, and recovery

- **Prerequisites:** Signed in; local mock routes available.
- **Steps:**
  1. Submit an empty or malformed URL.
  2. Enter malformed JSON such as `{bad` in the body and try to send.
  3. Send to a loopback port with no listener (for example `http://127.0.0.1:43199/unavailable`).
  4. If a timeout field is available, set a short value and target a deliberately slow local route; otherwise record timeout UI coverage as unavailable.
  5. Correct the URL/body and send a valid request again.
- **Expected result:** Invalid inputs are rejected before dispatch when possible; network and timeout errors are actionable; the UI remains usable and a subsequent valid request succeeds.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-REQ-05 — Response pane and history

- **Prerequisites:** Complete MAN-REQ-01 and MAN-REQ-04.
- **Steps:**
  1. Inspect a 200 response, a 404 response (`/manual-not-found`), a 500 response if configured, and a network error.
  2. Compare status text, headers, formatted body, timing, and size for each.
  3. Open History; select each request and verify the displayed details correspond to that request.
  4. Re-run one request from history if that action is offered.
- **Expected result:** HTTP error statuses remain visible as responses (distinct from transport errors); response and history details are associated with the correct request and are not stale.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

## OpenAPI, generated tests, payloads, and validation

### MAN-API-01 — OpenAPI import, endpoint mapping, and invalid input recovery

- **Prerequisites:** Fixture from Local setup saved as a file.
- **Steps:**
  1. Open OpenAPI and import the fixture.
  2. Confirm GET `/manual-echo` and POST `/manual-create`, the required `trace` query parameter, request body schema, response codes, and server URL.
  3. Try importing a copy with malformed JSON and a copy with unsupported OpenAPI version; note the errors.
  4. Re-import the valid fixture and confirm the page recovers.
- **Expected result:** Valid contract facts map to the correct methods/paths and schemas. Invalid inputs show useful errors without corrupting the previously active valid spec.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-TEST-01 — Test generation correctness and completeness

- **Prerequisites:** Valid fixture imported.
- **Steps:**
  1. Open Test Generator and select all available categories.
  2. Generate tests for both fixture endpoints.
  3. Inspect each test’s source endpoint, method, URL/path, required query/path parameters, request body, auth template, category, and expected status/assertions.
  4. Check the positive POST body includes required `name`; check generated negative/boundary tests identify the mutation and expected failure status.
  5. Generate again with only POSITIVE selected and compare results.
- **Expected result:** GET tests map to GET `/manual-echo`; POST tests map to POST `/manual-create`; expected statuses follow the spec (200/201); body and required parameter cases are relevant. Category filters and per-endpoint cap are respected. This feature is deterministic schema logic, not an LLM; treat output quality as contract coverage, not creative AI quality.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-TEST-02 — Execute generated tests against local mock routes

- **Prerequisites:** MAN-TEST-01 complete; mock routes configured to match the fixture methods/paths; set expected mock responses.
- **Steps:**
  1. Execute one positive GET case and one positive POST case.
  2. Execute the full suite only after confirming every generated URL points to `localhost:3001`.
  3. Inspect per-test execution status, HTTP response, duration, and error output.
  4. Confirm a 404/500 response is distinguished from connection failure.
- **Expected result:** Only intended local requests execute. Results associate with the correct generated test and preserve actual HTTP status/body. No run should contact `api.example.test` or any live service.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-VAL-01 — Response validation and assertion detail

- **Prerequisites:** Generated and executed tests from MAN-TEST-02.
- **Steps:**
  1. Open Response Validation.
  2. Validate one response matching the expected status/schema.
  3. Validate a fixture response that deliberately violates a required field or status.
  4. Inspect each assertion path, expected value, actual value, pass/fail badge, and aggregate counters.
  5. Select filters for passed, failed, and unvalidated tests; validate all executed cases.
- **Expected result:** Deterministic validation distinguishes contract mismatch from execution failure. Assertion details and summary counts agree with the individual tests. Validation does not claim success for missing execution data.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-AI-01 — JSON payload generation from schema

- **Prerequisites:** Fixture imported; reusable schemas available.
- **Steps:**
  1. Open JSON Payload Generator and choose `CreateItem` (or another schema shown).
  2. Generate JSON; parse the result with a local JSON parser or browser console `JSON.parse`.
  3. Check required property `name`, example/default behavior, type correctness, and omitted optional fields.
  4. Try an unsupported composition schema if present and note the warning.
- **Expected result:** Output is syntactically valid JSON and conforms to the supported subset/type requirements. The page explicitly identifies deterministic generation; it is not an AI provider feature. Placeholder values are not guaranteed realistic.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-AI-02 — Documentation generation from imported API

- **Prerequisites:** Valid fixture imported.
- **Steps:**
  1. Open Documentation.
  2. Check title, description, version, server, endpoint methods/paths, parameters, and response descriptions against the source file.
  3. Search/filter endpoints.
  4. Copy Markdown and download the document; open the downloaded file and compare it with the page.
- **Expected result:** Documentation reflects only specification data and explicit missing-value placeholders. It is deterministic Markdown, not AI-generated explanation. No endpoint requests are sent.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

## AI explanations, assistant, agent, and provider failures

### MAN-AI-03 — Diagnosis/explanation UI availability and mock behavior

- **Prerequisites:** Backend started with `AI_PROVIDER=mock`; synthetic failed execution/validation result available.
- **Steps:**
  1. Inspect Response Validation and the AI Assistant page for a user control that requests a diagnosis for a selected test.
  2. If such a control exists in the current build, request diagnosis for the synthetic 404/status mismatch and verify the explanation points to the failed assertion and preserves deterministic validation status.
  3. If no diagnosis action exists, record **BLOCKED** for UI diagnosis and note that source tracing found the diagnosis service and backend route but no frontend caller from the response-validation workflow. Do not infer UI functionality from backend tests.
  4. Optional backend-only check (not a UI pass): use DevTools Console to POST synthetic matching `testCase`, `executionResult`, and `validationResult` objects to `http://localhost:3001/api/diagnosis/diagnose-single`; inspect `provider: "mock"` and the returned deterministic finding.
- **Expected result:** Any displayed explanation corresponds to supplied evidence and cannot change the validation pass/fail status. If the UI has no caller/button, retain the blocked result as a feature-wiring gap. Mock output is not live AI.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-AI-04 — Assistant in mock mode

- **Prerequisites:** Backend with `AI_PROVIDER=mock`; signed in; no external key required.
- **Steps:**
  1. Open AI Assistant and use the chat/advisory input, not the agent-goal planner.
  2. Ask a synthetic question such as “What does HTTP 404 mean?”
  3. Ask again with a selected synthetic execution context.
  4. Try blank and oversized input if the UI permits.
  5. Observe the provider label/text and verify the response does not claim to have executed a request or changed workspace state.
- **Expected result:** Mock/demo response is clearly labeled as such and reflects received question/context; invalid input has a useful message. This verifies fallback UX only, not LLM quality.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-AI-05 — Live Gemini assistant response (external, key required)

- **Prerequisites:** **External provider test.** Rotate the Gemini key exposed during QA, install the replacement only in the backend environment, set `AI_PROVIDER=google-gemini` and `GEMINI_MODEL` to a currently supported model. Never place a key in frontend configuration, browser storage, screenshots, or chat. Confirm the provider account allows this small request and has acceptable cost/quota.
- **Steps:**
  1. Restart the backend with the replacement development key configured server-side.
  2. In the app chat, ask one short synthetic question with no private context.
  3. Verify answer relevance, factual accuracy, uncertainty handling, response latency, and provider identity if shown.
  4. Inspect browser Network requests and browser storage: the key must not appear there.
  5. Inspect sanitized backend logs for accidental key disclosure.
- **Expected result:** A genuine non-mock answer is returned, relevant to the prompt, with no credential exposed to the browser or logs. Record model identifier and time; never record the key.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN — BLOCKED until replacement key is configured and approved for development use.

### MAN-AI-06 — Live Gemini diagnosis (external, key required)

- **Prerequisites:** Same rotated development-key setup as MAN-AI-05. A UI diagnosis action must exist; otherwise UI test remains blocked. Use only synthetic fixture evidence.
- **Steps:**
  1. Create a known mismatch (expected 200, actual 404) against the local mock.
  2. Invoke diagnosis from the application UI if available.
  3. Compare explanation with the exact failed status assertion and response evidence.
  4. Verify provider output does not override the deterministic validation status and does not include synthetic secrets.
  5. Record provider/model, structured-output validity, relevance, missing details, hallucinations, and latency.
- **Expected result:** Diagnosis accurately references the supplied failure, returns valid required finding fields, preserves validation result, and is clearly advisory. A backend endpoint call alone does not count as a completed application UI test.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN — BLOCKED until replacement key and user-facing diagnosis action are available.

### MAN-AI-07 — Invalid credentials, provider outage, and recovery

- **Prerequisites:** Prefer `AI_PROVIDER=mock` for baseline. For external 401 only, use a disposable/revoked development credential in backend configuration after MAN-AI-05 setup; never alter or reuse the exposed credential. For outage test, block outbound provider access at the test machine/network layer, not by targeting unrelated external hosts.
- **Steps:**
  1. With mock mode, confirm assistant and diagnosis visibly identify fallback/mock behavior.
  2. If approved, run once with a deliberately invalid disposable key and observe the UI/API error or fallback behavior.
  3. Restore the valid rotated key and make one successful short request.
  4. Temporarily simulate provider unavailability using a controlled local network block; observe timeout/retry/fallback and then restore connectivity.
  5. Do not repeatedly send requests to induce rate limiting.
- **Expected result:** Failure is distinguishable from a genuine Gemini answer; fallback is labeled where shown, recovery works, and no credentials/provider error bodies leak. Stub tests cover 401, 429, timeout, network, and malformed response paths; live UI simulation covers only what can safely be induced.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN — external credential/network portions require rotated development credentials and controlled network access.

### MAN-AI-08 — Rate limit and malformed provider output boundary

- **Prerequisites:** No safe way to force provider 429 or malformed model JSON is exposed through the current UI. Automated stub regressions have already exercised these cases.
- **Steps:**
  1. Do not generate repeated paid requests to provoke a rate limit.
  2. If a provider sandbox/test proxy is available, configure that controlled service outside the production key path to return HTTP 429, malformed outer JSON, and schema-invalid structured output.
  3. Invoke diagnosis once per case from the app and record fallback/recovery behavior.
  4. If no such controlled provider proxy exists, record this manual UI test as **BLOCKED**; use the automated stub results as separate evidence.
- **Expected result:** 429 retry is bounded, then fallback is clear; malformed/invalid diagnosis output does not crash and does not become a false pass. No cost-incurring quota exhaustion test.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN — BLOCKED unless a controlled provider test proxy is available.

### MAN-AI-09 — Agent planning, approval, and claims

- **Prerequisites:** Backend mock mode; local spec imported; local targets only.
- **Steps:**
  1. In AI Assistant’s agent-goal field, request a regression test plan for the imported fixture.
  2. Inspect planned tools, endpoint references, order, and approval requirements before execution.
  3. Execute a read-only plan and inspect artifacts.
  4. Try a plan requiring a network-affecting action; reject approval and verify the action does not run. Try cancellation on a separate synthetic plan.
  5. Try goals containing ambiguous keywords (for example “why create this test?”) and note whether fixed rule routing chooses an appropriate plan.
- **Expected result:** Tool policy is honored; rejected/cancelled work stops. Describe planner output as rule-based, not Gemini-generated. Do not approve arbitrary external target requests. Any displayed “AI synthesis” claim should match the actual deterministic operation.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-AI-10 — Streaming endpoint / streaming UI

- **Prerequisites:** Signed in; Network tab open.
- **Steps:**
  1. Inspect the AI Assistant UI for a streaming control and verify whether it is wired to `useSSEChat`.
  2. If available, submit a synthetic prompt, observe event/chunk rendering, interrupt the stream, and retry.
  3. If no UI action uses the SSE hook, record **BLOCKED** for streaming UI. Do not treat the backend’s fixed sample-token output as generated AI.
- **Expected result:** Record whether progressive output is actually connected. Source review found the backend stream emits fixed demo tokens and no provider call; it should not be represented as live AI.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

## Mock server and workflows

### MAN-MOCK-01 — Mock route configuration, invocation, update, and deletion

- **Prerequisites:** Signed in.
- **Steps:**
  1. Open Mock Server and add `GET /manual-echo`, status 200, JSON body `{"fixture":"manual-echo","ok":true}`.
  2. Invoke `http://localhost:3001/api/mock/serve/manual-echo` from Request Builder.
  3. Update status/body and invoke again.
  4. Disable the route, invoke once, and observe disabled behavior.
  5. Inspect logs, delete the route, and invoke once more.
- **Expected result:** Route list reflects create/update/disable/delete. Invocations use configured method/path/status/body and log corresponding requests; deleted/disabled behavior is clear and no credentials are exposed.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-WF-01 — Workflow validation and local request chaining

- **Prerequisites:** Mock endpoints configured; imported local-only fixture; no external URLs.
- **Steps:**
  1. Create a two-step workflow: first call a local GET route; second call a local route that uses a value extracted from the first response if the UI supports extraction.
  2. Validate the workflow before execution.
  3. Execute and inspect step order, interpolated request, validation, and summary.
  4. Create an invalid dependency or missing required variable and validate again.
  5. If teardown is supported in the UI, create a local cleanup route and verify it runs after both success and a controlled failure.
- **Expected result:** Invalid scenarios are rejected before requests; valid steps execute in dependency order; values interpolate correctly; failure/teardown semantics are visible and no remote target is contacted.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN — complete multi-step HTTP UI flow was not covered in the prior automated pass.

## Reports, analytics, persistence, and recovery

### MAN-REP-01 — Report aggregation and downloads

- **Prerequisites:** Imported fixture, generated/executed tests, and at least one pass plus one controlled failure.
- **Steps:**
  1. Open Reports and generate a current-run report.
  2. Compare total tests, execution pass/fail counts, validation assertion counts, endpoint summaries, and failures against Test Generator and Response Validation.
  3. Download JSON, endpoint CSV, and failure CSV if shown.
  4. Open each download and verify headers, row counts, quoting, and redaction.
- **Expected result:** Aggregates reconcile to the individual results; empty/missing categories are not falsely counted as pass; exports open and contain no secrets.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-REP-02 — Dashboard metrics and health status

- **Prerequisites:** Several synthetic requests and test results; backend running.
- **Steps:**
  1. Open Dashboard and compare request/test/failure metrics to the known run.
  2. Refresh API Health and note status, latency, database mode, and provider label.
  3. Stop the backend in its terminal, refresh health, and note the unavailable/error state.
  4. Restart backend in mock mode and refresh again.
- **Expected result:** Metrics reflect the current browser workspace data. Health state distinguishes reachable and unavailable backend; UI recovers after restart.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-DATA-01 — Browser workspace persistence and reset

- **Prerequisites:** Synthetic account; imported fixture; a collection, environment, request history, generated tests, and report data.
- **Steps:**
  1. Save a request/collection and environment with a synthetic secret marker such as `qa-secret-not-real`.
  2. Refresh the page and reopen each section.
  3. Inspect only storage key names and verify sensitive values are not unintentionally persisted in clear text; do not export storage contents.
  4. Use Settings workspace reset and confirm its prompt.
  5. Verify specification, tests, history and temporary results clear as described; confirm account state separately.
- **Expected result:** Browser workspace items persist across refresh according to app behavior; reset removes workspace data without unexpectedly deleting the account. Secrets are masked/redacted where promised.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-DATA-02 — Persistence across backend restart and storage modes

- **Prerequisites:** Use only isolated local/in-memory setup from this checklist. Do not connect a production or personal MongoDB.
- **Steps:**
  1. Create a synthetic user and workspace data; record which data is browser-local versus backend-held.
  2. Restart the backend while leaving the browser open.
  3. Re-check account login, login activity, mock routes, assistant conversation, and workspace state.
  4. Note the health indicator’s database mode and any re-login/recovery needed.
- **Expected result:** Document expected losses for in-memory backend stores and expected browser-local persistence. App should surface backend-unavailable/re-authentication errors clearly; do not equate localStorage session restoration with server-side account persistence.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-ERR-01 — UI errors, empty states, and recovery

- **Prerequisites:** Signed in, then backend terminal available to stop/restart.
- **Steps:**
  1. Visit Test Generator, Reports, and Documentation before importing a spec; inspect empty states and links to next action.
  2. Stop the backend and attempt one request, one report, and one assistant message.
  3. Restart backend in mock mode and repeat valid actions.
  4. Re-import the fixture if needed and verify stale errors clear after a successful retry.
- **Expected result:** Empty states explain prerequisites; network errors are actionable and do not crash the page; retry recovers without duplicate/stale results.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

## Navigation, responsive layout, accessibility, and security

### MAN-UI-01 — Navigation and protected routes

- **Prerequisites:** Signed-in and signed-out browser states.
- **Steps:**
  1. Signed out, visit `/dashboard`, `/request-builder`, and `/ai-assistant` directly.
  2. Sign in and navigate every sidebar entry: Dashboard, Collections, Workflows, Request Builder, History, Environments, OpenAPI, Mock Server, Response Validation, Reports, AI Assistant, Test Generator, Documentation, JSON Generator, Settings.
  3. Use browser Back/Forward and reload each representative route.
  4. Sign out and revisit a protected route.
- **Expected result:** Signed-out protected paths redirect to login; signed-in navigation reaches the expected page; no dead links, blank pages, route loops, or uncaught console errors.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-UI-02 — Responsive layout and keyboard operation

- **Prerequisites:** Supported desktop browser; DevTools responsive mode.
- **Steps:**
  1. Inspect Dashboard, Request Builder, OpenAPI, Mock Server, Test Generator, Reports, and AI Assistant at desktop width.
  2. Repeat at tablet width and a 375px mobile viewport.
  3. Check horizontal overflow, clipped dialogs/tables, readable text, scroll behavior, and sticky panels.
  4. Use keyboard Tab/Shift+Tab, Enter/Space, Escape, and visible focus on login, request send, modal confirmation, filters, and downloads.
- **Expected result:** Core controls remain visible/usable, no critical horizontal overflow or hidden dialogs, focus order is logical and focus indicators are visible.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-SEC-01 — Safe local-target discipline and sensitive data checks

- **Prerequisites:** Synthetic account and values only; browser DevTools Network/Console.
- **Steps:**
  1. Confirm fixture requests point only to `localhost`/`127.0.0.1`.
  2. Use synthetic auth markers in request headers/body and selected assistant context.
  3. Inspect UI history, assistant context, report exports, browser console, and backend terminal logs for unredacted markers.
  4. Confirm test requests do not reach external hosts and no real API key is entered into the UI.
- **Expected result:** Only controlled local endpoints are contacted; secret-like values are redacted from outputs intended for persistence/reporting. Stop immediately if any real secret or external target appears.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-SEC-02 — Backend authentication boundaries and account isolation

- **Prerequisites:** Two synthetic accounts (A and B), local backend on port 3001, browser DevTools Network tab; use only the local APIForge instance.
- **Steps:**
  1. Sign out and call a protected request execution route from DevTools or the local API client without an Authorization header. Record only status and sanitized response.
  2. Repeat with a malformed/expired bearer token.
  3. Sign in as account A and execute a GET request against the local mock route; verify it succeeds.
  4. Create an agent task as A. Sign out, sign in as B, and attempt to open/read A's task through the UI or its displayed API call.
  5. Confirm signup and login remain usable while signed out. Confirm mock `/api/mock/serve/...` dispatch remains callable publicly by design; do not use its management endpoints while signed out.
- **Expected result:** Protected APIs reject missing/invalid credentials with 401; valid account A can execute; B cannot view A's agent task; signup/login and public mock dispatch retain their intended access behavior. No private task data appears in B's response.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

### MAN-SEC-03 — Outbound request safety configuration

- **Prerequisites:** Local test deployment with `OUTBOUND_REQUEST_SAFE_MODE=true`, synthetic account, browser Network tab, and a local-only controlled fixture. Do not probe real internal networks or cloud metadata.
- **Steps:**
  1. Execute a request to the controlled public/test fixture allowed by the deployment policy and confirm the response is rendered.
  2. Try a URL using an unsupported scheme such as `file:` and one malformed URL; record the displayed error.
  3. In a disposable local test deployment only, use the known controlled loopback fixture while safe mode is enabled; verify it is blocked before an HTTP response is received.
  4. Repeat with safe mode disabled only against the same local fixture and confirm the configured test behavior.
  5. Inspect the error/result for redaction; never paste bearer tokens or raw credentials into the evidence field.
- **Expected result:** Unsupported protocols and malformed URLs are rejected; safe mode blocks local/private/reserved IPs and does not follow redirects; normal timeout and response limits remain bounded. Do not test an arbitrary external or internal host.
- **Actual result / evidence:** ______________________________________________
- **Status:** NOT RUN

## Manual coverage gaps and explicit external dependencies

- **Requires a real external AI provider and a rotated development key:** MAN-AI-05 (assistant) and MAN-AI-06 (diagnosis). The prior Gemini key was exposed during QA; rotate before any live provider use. No live provider request has been made or passed.
- **Requires two synthetic users and a browser/API client:** MAN-SEC-02 verifies backend route authentication and account-level agent task isolation.
- **Requires a local test deployment with safe mode enabled:** MAN-SEC-03 checks unsupported protocol handling and private target blocking using only a controlled local fixture.
- **Requires provider credentials and controlled outbound network:** credential/outage portion of MAN-AI-07. Do not provoke rate limits by repeated paid calls.
- **Provider 429/malformed-output UI injection:** MAN-AI-08 is blocked unless a controlled provider proxy/sandbox can return those responses. Automated fetch stubs cover this separately.
- **Diagnosis UI gap:** current source tracing found a backend diagnosis route/service but no frontend caller from the response-validation UI. MAN-AI-03/06 must remain BLOCKED if the current build has no diagnosis control; backend API success is not proof of a usable UI feature.
- **Streaming UI gap:** current stream controller emits fixed sample tokens, not provider-generated content; source review found no assistant page wired to the SSE hook. MAN-AI-10 records this limitation.
- **Workflow HTTP chain:** logic has automated coverage, but full multi-step UI chaining remains manual and unverified.
- **Mongo persistence:** this checklist starts with Mongo disabled. Testing cloud persistence requires a separately isolated disposable Mongo database and an explicitly controlled URI; do not point this manual run at personal/production data.
- **Automated status is not manual status:** previous automated suites/builds passed as recorded in the QA reports. None of those results make any manual ID above a PASS.

## Completion summary

- Selected browser UAT subcases attempted: 9 (7 PASS, 1 FAIL, 1 BLOCKED).
- Full MAN-* scenarios completed: 0. All remaining MAN-* scenarios are NOT RUN or have an explicit blocker above.
- Highest-severity issues found and bug-register IDs: ____________________
- Follow-up owner/date: ____________________

Update only the test rows actually performed. For each failure/block, retain sanitized evidence and record browser/OS, timestamp, and steps that reproduced it. Do not copy API keys, bearer tokens, passwords, or full localStorage contents into this file.


## Final regression status (2026-10-27)

All unexecuted full MAN-* scenarios remain **NOT RUN**; selected UAT subcase results are recorded below. Automated backend/frontend regression results are recorded in `APIForge_Testing_Report.md`. Automated HTTP and database integrations do not count as manual UI verification. Live Gemini checks require rotating the development key first. Final automated run: Backend 336/336, Frontend 100/100 with integration backend active, builds passed, lint 0 errors (39 Backend and 10 Frontend warnings), and both subproject dependency updates reported 0 vulnerabilities. These results do not convert any checklist item into PASS.

## Selected browser UAT actually executed (2026-10-27, Asia/Kolkata)

**Environment:** APIForge only, loopback bound. Backend `127.0.0.1:3032`, frontend `127.0.0.1:5175`; backend run with `AI_PROVIDER=mock`, `MONGODB_URI=` and `OUTBOUND_REQUEST_SAFE_MODE=false`. Port 3001 and Vite ports 5173/5174 were occupied by unrelated processes and were not contacted or stopped. Synthetic in-memory account only. The live Gemini provider was not configured or called. CUA accessibility states and screenshots were observed in the task transcript; no screenshot files containing account/session data were exported.

| Test ID | Feature | Prerequisites | Exact steps performed | Expected result | Actual result | Status | Evidence to capture / defect |
|---|---|---|---|---|---|---|---|
| UAT-AUTH-01 | Signup | Local loopback app; unique synthetic email | Open `/signup`; enter synthetic name/email and a strong matching password; submit | Account is created, ordinary role assigned, user lands in dashboard | Dashboard displayed “Welcome back, APIForge UAT Synthetic”; navigation showed role Engineer | PASS | Signup form/result AX state and dashboard screenshot in task transcript |
| UAT-REQ-GET-01 | GET request / response | Signed-in synthetic user; local mock server | In Request Builder enter `http://127.0.0.1:3032/api/mock/serve/api/v1/users`; leave GET selected; Send | Controlled mock returns 200 and response body/status/timing are shown | `200 OK`, `36 ms`, `191 B`; two synthetic user records displayed | PASS | Request Builder screenshot and AX response state in task transcript |
| UAT-MOCK-01 | Mock route creation | Signed in; local mock management API | Create `POST /uat/items`, status 201, latency 5 ms, JSON body `{"created":true,"id":"uat-1"}`; save | Success notice and configured route appear in list | UI reported route created; list displayed `POST /uat/items 201 5 ms` | PASS | Mock-route list/toast AX state in task transcript |
| UAT-REQ-POST-01 | POST body / response | UAT-MOCK-01 route exists | In Request Builder select POST; target `http://127.0.0.1:3032/api/mock/serve/uat/items`; enter `{"name":"Synthetic","active":true}`; Send | Configured 201 response and JSON body display | `201 Created`, `29 ms`, `29 B`; body was `{"created":true,"id":"uat-1"}` | PASS | Request Builder screenshot and AX response state in task transcript |
| UAT-HIST-01 | History and dashboard recent activity | UAT-REQ-GET-01 and UAT-REQ-POST-01 complete | Open History, then Dashboard | Both requests appear with correct methods, endpoints, status and durations | History showed two manual requests: GET 200/36 ms and POST 201/29 ms; Dashboard recent requests showed the same entries | PASS | History/dashboard AX states in task transcript |
| UAT-AI-MOCK-01 | Assistant mock response | Backend `AI_PROVIDER=mock`; no external key needed | In API Assistant ask “What does HTTP 404 mean? Give one concise troubleshooting step.”; Send | Response is clearly labeled mock/demo and not represented as live LLM output | UI returned a `Mock/demo response` and `Provider: Mock/demo (not a live LLM)` label | PASS | Assistant response/provider label AX state in task transcript |
| UAT-REP-EMPTY-01 | Reports empty state | Signed-in account; no OpenAPI spec imported | Open Reports & Analytics | Empty state explains prerequisite and offers navigation to import | UI displayed “Import an OpenAPI specification” and said reports aggregate the current run | PASS | Reports page AX state in task transcript; report generation itself NOT RUN |
| UAT-CFG-URL-01 | Mock server URL configuration | App started with `VITE_API_BASE_URL=http://127.0.0.1:3032`; port 3001 occupied by unrelated process | Open Mock Server and inspect displayed Live Base URL | URL should use configured backend host/port | Page displayed `http://localhost:3001/api/mock/serve`, despite running APIForge on 3032. Source hardcodes this base in `MockServerPage.tsx`. The Test action was not used to avoid sending traffic to the unrelated port 3001 process. | FAIL | UI AX state plus source reference; defect `UI-URL-01` |
| UAT-AUTH-LOGOUT-01 | Logout/session | Synthetic account signed in | Activate Sign Out and attempt to complete confirmation; inspect a fresh tab on the same origin | Logout clears persisted auth and protected dashboard redirects to login | A confirmation dialog appeared once, but browser automation could not reliably complete it; a fresh same-origin tab still showed the synthetic account. It is unclear whether logout was confirmed, so this is not evidence of a product failure or success. | BLOCKED | Manually repeat MAN-AUTH-03 in a normal browser and record login redirect plus token/session revocation |

The entries above are selected UAT subcases, not completed MAN-* scenario cases. All other MAN-* cases remain NOT RUN. In particular, OpenAPI fixture import/test generation, validation, report export, CRUD methods beyond GET/POST, request headers/query values, responsive breakpoints, agent ownership, live Gemini, and SSE were not manually verified.

## AUTHZ-02 post-fix browser acceptance — 2026-10-27

These checks require a fresh browser session after the backend change. The actual-route regression tests passed, but **no browser test below has been performed**. Keep each result BLOCKED until an operator records observed evidence.

| Test ID | Prerequisites | Steps | Expected result | Actual result | Status |
|---|---|---|---|---|---|
| MAN-AUTHZ-02-A | Start APIForge with isolated local state; create two synthetic accounts A and B in separate browser sessions | As A, create a mock route with a unique path and non-sensitive marker. Sign out, sign in as B, open Mock Server route list. | B's list does not show A's route name, path, ID, or configuration. | Not run in browser; actual backend HTTP regression demonstrates list exclusion. | BLOCKED |
| MAN-AUTHZ-02-B | Route created by A; B signed in | In B's browser, request A's route by its ID through available UI or DevTools network console; try changing and deleting it. Then return to A and check the route remains. | B receives the same not-found outcome for read/update/delete; A's route remains unchanged. | Not run in browser; HTTP regression returned 404 for B and verified A can manage its route. | BLOCKED |
| MAN-AUTHZ-02-C | Route created by A, test endpoint is intentionally public | Call the configured `/api/mock/serve/<path>` URL without a bearer token. | Public mock response remains available by design; use only synthetic non-sensitive response data. | Not run in browser; HTTP regression confirmed anonymous dispatch status 200 for a seed route and 201 for owned fixture. | BLOCKED |
| MAN-AUTHZ-02-D | Two synthetic accounts; each has invoked one owned mock route | Open Traffic Inspector as A and B; inspect entries; clear B logs; return to A. | Each account sees and clears only logs for routes it owns. | Not run in browser; actual HTTP regression verified B saw zero A logs and could not clear A's entry. | BLOCKED |

The public serving policy is intentionally distinct from management privacy: response bodies remain public at known paths. Do not configure credentials or private data in mock responses. Backend tests do not establish browser UI acceptance.

## Loopback browser UAT continuation — 2026-10-27

**Environment:** Backend bound to `127.0.0.1:3033`, frontend to `127.0.0.1:5176`; health reported in-memory storage and `aiProvider=mock`. The displayed Mock Server URL was `http://127.0.0.1:3033/api/mock/serve`. An unrelated listener occupied port 3001 and was not contacted. Exact startup commands are in `APIForge_Testing_Report.md`.

| Test ID | Prerequisites | Steps | Expected result | Actual result | Status |
|---|---|---|---|---|---|
| UAT-UI-SIGNUP-03 | Backend and frontend loopback servers; fresh browser session | Open `/signup`, create synthetic account, submit | Dashboard opens as new user | Created synthetic account through UI; dashboard welcomed the account; credential omitted from report | PASS |
| UAT-MOCK-URL-03 | Signed in; configured Vite API base | Open Mock Server page; inspect Base URL | URL equals configured backend origin plus `/api/mock/serve` | UI displayed `http://127.0.0.1:3033/api/mock/serve` | PASS |
| UAT-MOCK-CREATE-03 | Signed in; Mock Server page | New Mock Route; set GET, `/uat-ui/mock-route-20261027`, status 200, body `{"origin":"mock-server-ui","verified":true}`; save | Route appears with matching method/path/status/body | Creation success message; route card showed GET path and status 200 | PASS |
| UAT-MOCK-TEST-03 | Route from UAT-MOCK-CREATE-03 | Click route Test; in Request Builder verify URL and click Send | Request goes to configured backend; response status/body match | URL used 127.0.0.1:3033; browser showed `200 OK` and exact fixture JSON | PASS |
| UAT-MOCK-LOG-03 | Request from UAT-MOCK-TEST-03 | Return to Mock Server, open Traffic Logs | Matching GET route, path and 200 status appear | One matching log displayed with correct path/route/status | PASS |
| UAT-AUTH-LOGOUT-03 | Fresh account in two same-origin tabs | In first tab choose Sign Out; complete confirmation if available; inspect first tab, refresh; use protected page in second tab, then refresh | Both tabs require sign-in after logout; stale UI is distinguished from server authorization | Sign Out click triggered a browser-tool interruption at JavaScript confirm. The next UI observation showed first tab at `/login`; refresh stayed at `/login`. Second tab initially retained stale Dashboard, then protected Mock Server load displayed HTTP 401 with stale route state; refresh led to `/login`. No live confirm dialog remained to explicitly accept or dismiss, so confirmation outcome is uncertain. | PARTIAL |
| MAN-AUTHZ-02-A | Two synthetic users, separate browser sessions | As A create private route; sign in as B; inspect route list | B cannot see A route | Browser retest not run. Post-fix actual HTTP tests pass list exclusion. | BLOCKED |
| MAN-AUTHZ-02-B | A route ID; B signed in | Try detail/update/delete in B; verify route remains for A | B receives not-found for all; A still manages route | Browser retest not run. Actual HTTP tests pass all three denial cases and A own CRUD. | BLOCKED |
| MAN-AUTHZ-02-D | A and B each have owned route requests | Compare Traffic Inspector logs; clear B logs; recheck A | Logs and clearing are owner-scoped | Browser retest not run. Actual HTTP integration passes logs isolation. | BLOCKED |
| UAT-OPENAPI-IMPORT-03 | Signed in; synthetic OpenAPI JSON/YAML fixture | Open OpenAPI Import; choose fixture; import; check summary/endpoints | Valid fixture imports with expected endpoints and operation metadata | Not run; file chooser operation unavailable in selected browser interface. | BLOCKED |
| UAT-TESTGEN-03 | Successfully imported fixture | Open Test Generator; generate tests; inspect method/path/body/assertions | Generated tests match fixture operations and schemas | Not run; depends on OpenAPI import. | NOT RUN |
| UAT-REPORT-EXPORT-03 | Imported spec and completed generated-test run | Open Reports; generate current-run report; download JSON and CSVs; inspect contents | Report summaries and downloads match actual run | Not run; no active specification/generated test run existed in this browser session. | NOT RUN |
| UAT-RESP-03 | Signed in; desktop, 768×1024, 390×844 viewport control | Inspect navigation, forms, tables and overflow at each size | Controls remain readable and usable without horizontal clipping | Not run; selected browser did not expose viewport override. | BLOCKED |
| UAT-SSE-03 | Signed in; assistant streaming page | Send safe synthetic prompt; inspect incremental events and final state | UI streams intended backend output and handles end-of-stream/errors | Not run; no SSE UI execution performed. | NOT RUN |
| UAT-AI-LIVE-03 | Rotated Gemini development key securely set in backend environment; explicit live-test authorization | Set provider to Gemini; restart backend; send one synthetic request; record provider/model/outcome without exposing key | Real provider returns a relevant response and failure behavior is distinguishable | Not run; backend reported `aiProvider=mock`; live provider invocations: 0. | BLOCKED |

Post-fix HTTP recheck: `APIFORGE_RUN_HTTP_INTEGRATION=1 node --import tsx --test test/mockServer.test.ts test/mockServerHttpIntegration.test.ts test/apiRoutes.integration.test.ts test/auth.test.ts test/authController.test.ts` — 45 passed, 0 failed, 0 skipped. These results do not mark the blocked browser cases as passed.

### Follow-up after UI-URL-01 fix — 2026-10-27

The original `UAT-CFG-URL-01` FAIL above is retained as historical browser evidence. The code fix is covered by automated tests for configured backend origin (`127.0.0.1:3032`), default origin (`localhost:3001`), and trailing slash normalization (3/3 pass). **Manual browser retest: NOT RUN**; do not mark the UAT case passed until the page is opened with `VITE_API_BASE_URL=http://127.0.0.1:3032` and the displayed URL is observed as `http://127.0.0.1:3032/api/mock/serve`. Do not click Test unless that target is the controlled APIForge backend.

Logout automated evidence: frontend auth-store regression test passes and confirms the mocked backend logout call is made with the session token and persisted Zustand auth state is cleared. Existing backend auth tests include successful token revocation (11 auth/controller tests pass in this follow-up). These do **not** complete the browser confirmation-flow test. `UAT-AUTH-LOGOUT-01` remains BLOCKED pending manual completion of the confirmation dialog and verification of redirect/session behavior. Prior other manual test statuses are unchanged.

Cross-tab behavior from source inspection: Zustand persists to localStorage but has no explicit browser `storage` event listener; an already-open second tab may keep stale in-memory authenticated UI until reload or an API failure, while protected backend calls using the revoked token are rejected. This is source-based inference only. Add this observation to manual UAT: after confirmed logout in Tab A, use Tab B without refreshing, attempt a protected operation, then reload and confirm it returns to login. Do not mark it passed until observed.

## Controlled browser UAT continuation — 2026-10-27

**Environment evidence:** Backend ran with `PORT=3032 MONGODB_URI= AI_PROVIDER=mock OUTBOUND_REQUEST_SAFE_MODE=false` and a temporary launch-only Node shim that bound the listener to `127.0.0.1` (repo code not changed for binding). Health returned `status=ok`, `database=in-memory`, `aiProvider=mock`. Frontend ran with `VITE_API_BASE_URL=http://127.0.0.1:3032` on `127.0.0.1:5175`. `lsof` confirmed both loopback binds. Port 3001 had an unrelated listener; no request was sent there during this phase.

Startup caveat: the first launch-only shim did not normalize string-valued `PORT`, and `lsof` briefly showed the backend on `*:3032`. It was stopped as soon as detected, before any test request. The corrected shim was then used and `lsof` confirmed `127.0.0.1:3032` before any UAT request. There was no packet monitor to independently rule out incoming traffic during the brief initial bind.

| Test ID | Prerequisites | Steps performed | Expected result | Actual result | Status | Evidence / bug |
|---|---|---|---|---|---|---|
| UAT-AUTH-SIGNUP-02 | Fresh `localhost:5175` origin and controlled backend | Entered synthetic name/email/strong matching password in signup form and attempted submit | Account created and dashboard shown | Form remained at `/signup` without visible validation or success; browser action did not produce a confirmed server response. Synthetic accounts used in the direct API checks were created via loopback HTTP, not through this UI. | BLOCKED | Browser form AX state before/after; no credentials recorded |
| UAT-URL-02 | Controlled backend 3032, Vite 5175 with configured API URL | Open `/mock-server`; inspect displayed Base URL | `http://127.0.0.1:3032/api/mock/serve` | Browser displayed exactly that URL. Route-management fetch returned 401 because the browser's persisted user token belonged to a prior in-memory backend instance. No Test action was clicked. | PASS for displayed URL; workflow BLOCKED | Browser accessibility state; UI-URL-01 fixed and browser URL verified |
| UAT-MOCK-API-02 | Backend health OK; synthetic account created by API for management auth | Create POST route `/uat-followup/items` with status 201/body `{"created":true,"id":"synthetic-item-01"}`; POST to `/api/mock/serve/uat-followup/items` | Route creation succeeds; served status/body match configuration | Create returned 201; request returned 201 and exact configured JSON | PASS (direct API only) | Controlled loopback HTTP output. This was not a browser-created route or Request Builder execution |
| UAT-AUTH-REV-02 | In-memory backend; synthetic account | Signup; POST logout with token; POST protected `/api/requests/execute` with same token | 201 signup, successful logout, then 401 protected request | Observed 201, 200, 401; token not printed | PASS (direct API) | Controlled local HTTP output |
| UAT-AUTH-XUSER-02 | Two synthetic accounts | User A creates route `/uat-owner-a/private-marker`; user B requests route list | User B cannot read A-owned route | Pre-fix UAT: B's authenticated list returned 200 and contained A's route. The post-fix actual HTTP regression passes; browser retest is still pending. | Historical FAIL; API fix verified, browser retest BLOCKED | AUTHZ-02 |
| UAT-AUTH-LOGOUT-02 | Previously persisted synthetic account in Tab A; second tab same-origin | Click Sign Out; accept JS confirmation; inspect both tabs, navigate protected path, reload | Tab A returns to login; Tab B does not restore a valid session | Sign Out produced confirm dialog; confirmation accepted. Immediate UI read timed out. Later both tabs were at `/login`; reload retained `/login`. Tab B initially showed stale account/dashboard, then protected navigation settled at `/login`. That browser token came from a prior backend process and was already stale against the fresh in-memory server; fresh UI login was not completed. | PARTIAL; fresh-session browser logout BLOCKED | Browser tab URLs and AX states. A separate synthetic HTTP token revocation test returned 401. Tab B stale interval observed; exact synchronization timing remains uncertain |
| UAT-RESP-LOGIN-02 | Browser login page; viewport override | Set 390×844 and 768×1024; inspect login UI | Browser uses requested widths and no content overflow | Browser remained 658×822 despite overrides; reset to default | BLOCKED | No mobile/tablet outcome claimed |
| UAT-OPENAPI-02 | Fresh signed-in UI session and known fixture | Import OpenAPI fixture and inspect mapped endpoints | Spec imports and expected endpoints appear | Not completed; stale session/API UI and browser interaction blocker | NOT RUN | Do not infer from source or prior automation |
| UAT-TESTGEN-02 | Imported known API spec | Generate tests; verify paths, methods, bodies, assertions | Generated cases match fixture | Not run | NOT RUN | Await UAT-OPENAPI-02 |
| UAT-REPORT-02 | Actual completed test run | Generate and export run report | Report/download reflects the run | Not run | NOT RUN | Prior report empty-state observation is not a report-generation result |
| UAT-SSE-02 | Assistant UI and stream endpoint | Trigger UI streaming and inspect events/content | UI receives streamed response | Not run | NOT RUN | No SSE UI pass claimed |
| UAT-AI-LIVE-02 | Rotated development key securely configured and explicit live-test authorization | Set provider to Gemini, make one minimal request, verify provider/model/result without logging key | Real provider returns a useful response; failures are distinguishable | Not run; AI_PROVIDER stayed `mock` | BLOCKED | External key and explicit authorization prerequisite; no provider request made |

### Follow-up to earlier entries

The prior `UAT-CFG-URL-01` FAIL is historical. `UAT-URL-02` is the browser retest of the displayed URL and passes; full UI route management and Request Builder invocation remain blocked by the stale browser session. Prior browser logout BLOCKED entry is historical; `UAT-AUTH-LOGOUT-02` records eventual client redirect/persistence but is PARTIAL because the browser token belonged to a prior backend and a fresh valid session was not established. Cross-tab stale UI was observed. Direct API results do not count as UI completion.


## Final UAT continuation — 2026-10-27

| Test ID | Prerequisites | Steps | Expected result | Actual result | Status |
|---|---|---|---|---|---|
| UAT-UI-SIGNUP-04 | Loopback backend 3033 (`MONGODB_URI=` and `AI_PROVIDER=mock`), frontend 5176 | Submit signup with fresh synthetic details | Dashboard shows new account | Signup completed; dashboard displayed synthetic name. Credentials omitted. | PASS |
| UAT-AUTH-LOGOUT-04 | Freshly signed-in UI account | Open navigation; click Sign Out; accept confirmation; verify `/login`; refresh and use protected route with prior session | Confirmed logout, signed-out UI, old session rejected | Sign Out produced a JS confirmation interruption. Next observation was `/login`; no supported confirm control was exposed and no same-session protected request was observed. | BLOCKED |
| UAT-AUTH-XUSER-BROWSER-04 | Two independent browser contexts and fresh backend | As A create unique private route; sign into B in another context; inspect list and try read/update/delete; create/manage B route; call public serving | B cannot see/manage A, can manage own route, public serving stays intentionally public | Not run in independent browser contexts. Actual-route HTTP regression suite has 45 passing checks, but browser case remains open. | BLOCKED |
| UAT-OPENAPI-IMPORT-04 | Synthetic OpenAPI 3.0/3.1 fixture and signed-in UI | Choose fixture file in OpenAPI Import; confirm title/server/endpoints; generate tests; compare methods, paths, parameters, bodies and assertions with fixture | Correct import and matching generated tests | Not run; current computer-use tab surface had no file chooser setter. | BLOCKED |
| UAT-REPORT-EXPORT-04 | Imported spec and completed test execution | Open Reports & Analytics; generate current-run report; export JSON and endpoint/failure CSV; inspect downloads and compare counts/statuses | Report and exports match the completed run | Not run because this UI session had no imported spec or generated execution. | BLOCKED |
| UAT-RESP-04 | Browser viewport override | Set 1440×900, 768×1024, then 390×844; at each inspect nav, dialogs, tables, request builder and horizontal overflow; record actual dimensions | Navigation and feature panels work without clipping or unintended overflow | Not run; selected tab interface exposed no viewport control. | BLOCKED |
| UAT-SSE-HTTP-04 | Controlled backend with synthetic authenticated user | POST synthetic prompt to `/api/stream/chat`; capture SSE events/timing | Step/token/done frames arrive progressively | HTTP 200; 1 `step`, 8 `token`, 1 `done`; first token 86 ms, last 653 ms. Transport only. | PASS (HTTP transport only) |
| UAT-SSE-UI-04 | Assistant page wired to `useSSEChat` | Submit prompt and observe incremental content, completion and cancellation/errors | UI renders progressive content and terminal state | No page consumes the hook; endpoint output is fixed sample text, not AI. | BLOCKED / implementation gap |
| UAT-AI-LIVE-04 | Rotated development Gemini key configured only in backend environment; explicit authorization | Configure Gemini, make one minimal synthetic request, assess redacted result, restore mock | One real provider invocation verified | Not run; live calls 0 and provider remained mock. | BLOCKED |

**Readiness:** **INCONCLUSIVE DUE TO BLOCKERS.** Keep browser confirmation, separate browser contexts, fixture upload, export inspection, and viewport checks open until an operator completes them. SSE is verified only as simulated backend transport. Mock results do not prove live AI.


## Acceptance rerun evidence — 2026-10-27

| Test ID | Prerequisites | Steps | Expected result | Actual result | Status |
|---|---|---|---|---|---|
| ACC-UI-LOGIN-01 | Controlled loopback backend, synthetic account | Sign up through actual `/signup` UI and inspect landing page | New account enters dashboard | Earlier loopback UAT observed a fresh synthetic UI signup succeed; the current rerun confirmed backend signup over HTTP only. | PASS for signup; not a complete login/logout browser cycle |
| ACC-LOGOUT-UI-01 | Fresh UI session and browser confirm controls | Sign out; explicitly accept confirm; refresh; attempt protected operation using former session | UI redirects and old session is rejected | Confirmation was interrupted by browser control; no explicit acceptance. Direct HTTP backend sequence independently returned signup 201, protected 200, logout 200, protected 401. | BLOCKED UI; backend PASS |
| ACC-XUSER-UI-01 | Two independent browser contexts | User A creates route; User B signs in separately; verify list/detail/update/delete denial; B manages own route; call public serve anonymously | Management isolated, own route allowed, public dispatcher preserved | Separate Chrome browser provider unavailable; browser acceptance not performed. The actual-route suite passed 45 cases, including cross-user denial/own CRUD/public serve. | BLOCKED UI |
| ACC-OPENAPI-API-01 | Valid synthetic OpenAPI JSON and ephemeral authenticated API stack | Submit fixture JSON to documented `/api/openapi/import`; inspect normalized output | Correct title/endpoint/method/parameter | HTTP 200; `Synthetic Widget API`, GET `/widgets/{widgetId}`, `widgetId` example normalized. | PASS (API only; file picker not tested) |
| ACC-TESTGEN-API-01 | Successful imported specification | Generate one positive test; compare method/path/example and status assertion | Generated request matches contract fixture | One GET test for `/widgets/{widgetId}`, URL used `/widgets/widget-42`, expected 200. | PASS (API only) |
| ACC-TESTEXEC-API-01 | Generated test and controlled loopback endpoint | Execute generated batch and inspect result | Request reaches fixture, response status/body correct | `PASSED_EXECUTION`, 200, expected synthetic response body. | PASS (API only) |
| ACC-REPORT-API-01 | Actual generated execution result | POST report generation payload; compare totals and endpoint | Report totals/status/path equal run | 1 total, 1 execution passed, matching GET path. | PASS (API aggregation) |
| ACC-REPORT-EXPORT-UNIT-01 | Frontend test environment | Invoke existing JSON, endpoint CSV and failure CSV exporters; inspect Blob contents and download link attributes | Valid downloadable output with expected values | JSON parsed; expected report ID/endpoint, CSV names/headings/row and object URL revocation verified by unit test. No real browser download was opened. | PASS (unit only) |
| ACC-OPENAPI-UI-01 | Browser with file chooser, signed-in session | Upload valid JSON/YAML fixture via OpenAPI Import, inspect title/schema/endpoints, generate and inspect tests | Correct import and matching cases | Not performed through browser. Backend API lifecycle and component mocks do not satisfy this manual UI check. | BLOCKED |
| ACC-REPORT-DOWNLOAD-01 | Completed UI test run and browser download support | Generate report, download JSON/CSV, open files, compare totals/status/endpoint | Actual browser exports match the run | Not performed in browser; only backend aggregation and unit Blob validation passed. | BLOCKED |
| ACC-RESPONSIVE-01 | Browser viewport control | Set 1440×900, 768×1024, 390×844; inspect navigation, forms/dialogs, Request Builder, tables/results/reports, horizontal overflow and accessible controls | Each layout remains usable at measured viewport | Viewport setter unavailable in current browser provider; not tested. | BLOCKED |
| ACC-AI-LIVE-01 | Rotated Gemini key securely configured in backend and authorization for live call | Configure backend only; make one minimal synthetic prompt; verify provider/model and failure handling; restore mock | Real provider call behaves as configured | Not tested. Earlier development key exposure means rotation is required; no key inspected or transmitted in this run. | NOT TESTED |

Browser cross-user isolation, explicit logout confirmation, actual file chooser, actual download opening, and responsive sizing remain manual acceptance gaps. The browser provider did not offer the separate Chrome context or viewport/file chooser controls needed to execute them.


| Test ID | Prerequisites | Steps | Expected result | Actual result | Status |
|---|---|---|---|---|---|
| ACC-SSE-HTTP-02 | Ephemeral loopback auth+stream routes and synthetic session | Send unrelated synthetic prompt to authenticated `/api/stream/chat`; capture events and concatenate tokens | Content should be driven by intended configured stream provider | 10 SSE frames; 82–652 ms progressive; output remained canned sample irrespective of prompt; no provider called. | FAIL (AI behavior); transport itself works |


### AI streaming scope decision — 2026-10-27

Real AI token streaming is outside the currently documented product scope: the READMEs do not promise it and the AI Assistant page uses the non-streaming chat endpoint. `/api/stream/chat` and `useSSEChat` are presently unintegrated; the server sends fixed sample text, not provider output. At the time of this earlier scope note, MAN-AI-10 was blocked; the streaming simulation was subsequently removed and the case retired below. If an operator directly probes the route, record simulated transport separately and do not treat its sample as AI output. No live provider test is required for this out-of-scope behavior. At the time of that earlier scope note, AI-SSE-01 remained open; it was subsequently resolved by removing the simulation, as recorded below.


## SSE manual checklist disposition — 2026-10-27

The dedicated simulated AI streaming route and unused `useSSEChat` hook have been removed. MAN-AI-10 / UAT-SSE UI checks for that feature are **RETIRED / OUT OF SCOPE**, not passed. No manual test or real AI streaming key is needed for the removed path. This does not retire separate Request Builder SSE connections to user-provided endpoints or agent task event streaming; those workflows retain their own manual verification status as documented elsewhere. AI Assistant remains on ordinary chat and its automated page tests passed 2/2.


## Regression run blockers — 2026-10-27

No automated tests failed in the final full-suite rerun. Backend real HTTP API integration is opt-in; its two loopback cases were run separately and passed 2/2. Mongo persistence was not run because no isolated `APIFORGE_TEST_MONGO_URI` was configured. Frontend cross-feature browser-like API journeys were skipped because no controlled `APIFORGE_INTEGRATION_API_URL` was configured. The previous UI/manual checklist remains NOT RUN/BLOCKED where recorded; passing unit tests do not change those statuses. The removed AI chat simulation has no manual case now; separate Request Builder and agent SSE workflows retain their existing manual status.


### Integration-test follow-up — 2026-10-27

Backend API route HTTP integration and outbound transport cases were executed separately against their own loopback fixtures (2/2 passed). This does not satisfy browser/manual acceptance. Mongo persistence remains blocked pending a disposable test database URI; the frontend cross-feature API journeys remain skipped unless a controlled APIForge URL is explicitly configured.
