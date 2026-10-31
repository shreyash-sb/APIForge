# APIForge Test Cases

Detailed test design mapped to the implemented repository. Final regression results are dated 2026-10-27. “PASS” means assertions actually ran and passed; “BLOCKED” means environment prevented execution before assertions; “NOT RUN” means not executed. Earlier interim entries are superseded where they conflict with the final update below.

## Automated and source-backed cases

| ID | Feature | Preconditions / data | Steps | Expected | Actual / status | Type |
|---|---|---|---|---|---|---|
| AUTH-01 | Signup/password rules | In-memory auth service; valid unique test email | Run auth tests for valid, weak, duplicate registrations | Valid user created; weak/duplicate rejected; sensitive fields absent | Covered by backend auth suite; PASS | Automated |
| AUTH-02 | Login/lockout/logout | Test user fixture | Valid login, five bad passwords, logout, token verification | Login succeeds; lockout and revocation work | Existing tests PASS | Automated |
| AUTH-03 | Production signing secret | `NODE_ENV=production`, missing and supplied secret values passed as test inputs | Call `resolveJwtSecret` | Missing secret throws; configured secret returned; dev fallback remains available | Regression test PASS | Automated |
| AUTH-04 | Signup role assignment | Public signup payload with synthetic user and `role: admin` | Register through `AuthService.signUp` | Public signup cannot grant privileged role | Before fix, signup returned `admin`; after fix, `engineer`; PASS | Automated regression |
| AUTH-05 | Login activity privacy | Two synthetic accounts with login activity | Request activity with no token, invalid token, then first user's valid token | Missing/invalid token gets 401 with no activity data; valid token sees only own records | Before fix anonymous request returned 200/global entries; after fix all 3 states PASS | Controller regression |
| REQ-01 | Request URL and protocol validation | Valid/invalid URL and unsupported scheme | Exercise request executor | Only HTTP(S) accepted; malformed requests return structured errors | Request executor suite PASS | Automated |
| REQ-02 | Query/auth/header/body composition | Deterministic request fixture | Include enabled/disabled params, auth, JSON and invalid JSON | Expected URL/headers/body and safe errors | Request executor suite PASS | Automated |
| REQ-03 | Timeout/HTTP response parsing | Mock fetch outcomes | Exercise timeout, JSON, text, and transport error cases | Bounded timeout and correct structured result | Backend tests PASS | Automated |
| REQ-04 | Request controller payload boundary | Undefined, null, array, missing fields, wrong types, blank method | Invoke controller with malformed body shapes | Return 400 for client payload errors, no internal property-access exception | Before fix undefined body returned 500; after fix boundary matrix PASS | Automated regression |
| VAL-01 | Status/header/body/schema checks | Schema/response fixtures | Validate valid and invalid responses, nested refs, bounds, enums | Findings accurately reflect constraints without early exit | Validation suite PASS | Automated |
| GEN-01 | Positive/negative/boundary generation | OpenAPI fixture | Generate test cases and inspect coverage of constraints | Deterministic cases satisfy declared generator contract | Backend/frontend suites PASS | Automated |
| OPENAPI-01 | Parse/import/export | Valid and malformed OpenAPI fixtures | Parse/import then export a specification | Valid spec maps correctly; malformed input returns actionable failure | Parser/export/page tests PASS | Automated |
| MOCK-01 | Mock route CRUD/state | Local route fixture | Create, update, toggle, search/filter and clear logs | State changes are correct and immutable | Service/frontend-state tests PASS | Automated |
| MOCK-02 | HTTP mock invocation | Actual mock API router over loopback | Create a synthetic mock route and invoke `/serve/qa-loopback` | Configured status 202 and response body | PASS in opt-in HTTP integration | Automated integration |
| WF-01 | Workflow validation/dependency order | Workflow fixture with dependencies and cycles | Validate and execute steps | Invalid cycles rejected; valid order honored | Workflow engine/API tests PASS | Automated |
| WF-02 | Extraction/interpolation/teardown | Login-like response fixture and secret variables | Extract values, use later, run cleanup | Values resolve; secrets sanitized; teardown result retained | Workflow regression suite PASS | Automated |
| WF-03 | Full HTTP workflow smoke | Ephemeral local mock API | Execute a multi-request scenario against local server | Requests chain and results are sanitized | PASS: controlled multi-step HTTP chain executed in final backend suite | Automated integration |
| REPORT-01 | Summary and export | Execution result fixture | Generate report summary and CLI formats | Counts and formats match executions | PASS: report tests and CLI HTTP smoke fixture executed | Automated |
| AI-01 | Mock diagnosis | Sanitized failed/pass evidence | Diagnose through `MockAiProvider` | Findings deterministic, validation remains source of truth | Diagnosis suite PASS | Automated |
| AI-02 | Live provider output quality | Dedicated development key and live provider | Test representative cases and schema/secret behavior | Accurate, structured and safe output | NOT RUN; no live call | Manual/integration |
| AI-03 | Provider failure classification | Stub fetch response HTTP 401 | Call `GoogleAiProvider.diagnose` and record retries/fallback summary | Do not retry permanent 401; fallback identifies HTTP 401 | Before fix, two calls and wrong 503/high-demand message; after fix regression PASS | Automated regression |
| DB-01 | Mongo persistence and schema constraints | Isolated `apiforge_qa_test_finalregression` on loopback; offline schema checks | Validate required fields/indexes; insert/read/hydrate user and activity; login/password update/delete | Schema constraints hold and changes persist across service operations | PASS: schema and persistence integration tests | Automated integration |
| STORE-01 | Persistence sanitization/resilience | Stub localStorage | Persist secret-bearing request/workflow and corrupt storage | Secrets excluded; corrupted/unavailable storage does not crash | Frontend/backend resilience tests PASS | Automated |
| UI-01 | Main page component behavior | jsdom and mocked services | Run frontend suite | Expected rendering/forms/state | 96 passed, 2 skipped | Automated component |
| E2E-01 | CLI runner fixture | Local ephemeral server fixture | Run CLI against controlled endpoint and verify reporter outputs | CLI executes and exports expected report | PASS: CLI fixture and report outputs executed in permissioned final run | Automated integration |
| PERF-01 | Load and latency | Isolated runnable backend and controlled endpoint | Concurrent runs at documented rates | Record latency percentiles, error rate, resource use | NOT RUN | Manual/performance |

## Security test design requiring local execution

| ID | Scenario | Safe setup | Expected / status |
|---|---|---|---|
| SEC-01 | Cross-user resource access | Two isolated local accounts and owned resources | User B cannot read/delete user A data; NOT RUN over HTTP |
| SEC-02 | Production secret configuration | Start isolated process with production mode and no secret, then with test secret | Missing key prevents startup; configured key signs/verifies; helper regression PASS, full deployment path NOT RUN |
| SEC-03 | Outbound safe mode private addresses | Controlled DNS/IP fixtures, safe mode enabled, and loopback-only controlled integration | Private/reserved and mixed DNS targets blocked; allowed target uses pinned address; timeout/body bounds enforced; automated tests PASS |
| SEC-04 | DNS/redirect SSRF policy | Controlled test DNS hostname resolving only to a private test IP; controlled redirect endpoint | Updated final run: mixed/private DNS results blocked, resolved target pinned, redirects disabled in safe mode; automated cases PASS. |
| SEC-05 | Secret redaction | Synthetic test-only token, cookie, API key, nested body | No raw value appears in persisted state, reports, errors, or AI evidence; sanitization tests PASS for covered cases |
| SEC-06 | Rate limits | Isolated backend, synthetic requests only | 429 and standard rate headers after configured threshold; NOT RUN end-to-end |
| SEC-07 | Dependency advisories | Run audit in Backend and Frontend package roots | Final `npm audit fix` runs reported 0 vulnerabilities in each subproject. A later audit retry was unavailable because registry DNS failed. |
| SEC-08 | Backend route authorization | Actual API router over loopback; synthetic local endpoint | Attempt protected route anonymously, then with bearer token | Protected routes reject anonymous callers before side effects | Final auth route integration tests pass; initial anonymous execution defect is fixed. `/api/mock/serve` is intentionally public. |

## Earlier regression execution — 2026-10-27 (superseded by the latest rerun below)

| Area | Actual result | Status |
|---|---|---|
| Backend suite | 336 passed, 0 failed, 0 skipped; mock AI, actual route integration, pinned local HTTP fixture and isolated Mongo persistence enabled | PASS |
| Frontend suite | 28 files; 100 passed, 0 failed, 0 skipped with controlled backend at 127.0.0.1:3031 | PASS |
| Cross-feature E2E | OpenAPI import → test generation → execution → validation → diagnosis → report/persistence; workflow and mock-server path all executed | PASS |
| Auth/route authorization | Protected route groups reject missing/invalid tokens; authenticated integration requests pass; public signup/login and mock `/serve` stay public intentionally | PASS (automated) |
| Outbound request safety | DNS resolution/private ranges/mixed DNS/pinning/redirect blocking/time limits exercised with fixtures | PASS (automated safe-mode cases) |
| AI provider behavior | Mocked provider success/HTTP failure/network timeout/malformed output paths; zero live invocations | PASS (mock only) |
| Build/type checking | Backend TypeScript, Frontend TypeScript and Vite production build | PASS |
| Lint | ESLint 10, 0 errors; 39 Backend and 10 Frontend warnings | PASS WITH WARNINGS |
| Dependency advisories | Both project `npm audit fix` runs reported zero vulnerabilities; a later audit retry failed because registry DNS was unavailable | PASS AT UPDATE; fresh audit lookup unavailable |
| Live AI and manual interface | No live Gemini request; no human browser/responsive/SSE test performed | NOT RUN |

Initial baseline: Backend 291 discovered (288 passed, 3 loopback setup failures before assertions); Frontend 98 discovered (96 passed, 2 skipped). Final automated run: **436 passed, 0 failed, 0 skipped**. Checklist statuses remain NOT RUN.

## Selected browser UAT — 2026-10-27

The test-by-test prerequisites, exact actions, observed results, evidence notes and status values are recorded in `APIForge_Manual_Testing_Checklist.md` under “Selected browser UAT actually executed”. Seven observed UI subcases passed (synthetic signup, controlled GET, mock route creation, controlled POST JSON, history/dashboard recent activity, explicitly labeled AI mock response, report empty state); one configuration check failed because the Mock Server page hardcodes port 3001 when APIForge was running on 3032; logout is BLOCKED because the browser confirmation could not be reliably completed. This failed test is registered as `UI-URL-01`; no traffic was sent to the unrelated process on port 3001. All other manual MAN-* scenario cases remain NOT RUN.

## Focused URL/logout follow-up — 2026-10-27

| Test ID | Area | Test performed | Result | Evidence / limitation |
|---|---|---|---|---|
| URL-REG-01 | Mock serve URL | Construct URL from configured `http://127.0.0.1:3032` origin | PASS | `http://127.0.0.1:3032/api/mock/serve`; unit test |
| URL-REG-02 | Default URL | Construct URL from default API base | PASS | `http://localhost:3001/api/mock/serve`; default config unit test |
| URL-REG-03 | URL edge case | Origin ends with multiple slashes | PASS | Route appended with a single separator; unit test |
| URL-REG-04 | OpenAPI export | Export mock routes without explicit serverUrl | PASS | Exporter fallback uses shared configured mock base; default URL asserted |
| AUTH-LOGOUT-REG-01 | Client logout | Invoke auth-store logout with synthetic token and mocked auth service | PASS | Service receives token; in-memory and persisted user/token/auth fields clear |
| AUTH-LOGOUT-REG-02 | Server revocation | Existing auth-service logout verification test | PASS | Revoked token no longer verifies; among 11 auth/controller tests |
| UAT-URL-RETEST-01 | Browser URL | Open the Mock Server page with backend at 3032 | NOT RUN | Automated builder coverage is not a browser result; see manual checklist |
| UAT-LOGOUT-01 | Browser logout | Complete confirm dialog and inspect same/other tab | BLOCKED / NOT RUN | Browser confirmation was not reliably completed; automated state tests do not substitute |

Commands: latest focused frontend tests 6 passed; frontend TypeScript + production build passed; backend auth/controller tests 11 passed with `node --import tsx --test`. A full frontend rerun without its required backend produced 101 passed, 1 failed, 2 skipped; the lone failure was an integration signup attempt to the default `http://localhost:3001` API base returning `Network Error`. Without server logs it is unknown whether an unrelated listener received it. Earlier full-suite results with the controlled backend remain separately recorded and are not overwritten.

## Loopback UAT continuation — 2026-10-27

| Test ID | Steps performed | Expected result | Actual result | Status | Evidence / bug |
|---|---|---|---|---|---|
| UAT-AUTH-SIGNUP-02 | Filled synthetic signup fields in fresh `localhost:5175` tab and attempted submit | Account created and dashboard shown | Remained on signup page without visible error or confirmed response; API test accounts were created via direct loopback HTTP instead | BLOCKED | Browser form state; no credentials recorded |
| UAT-URL-02 | Opened `http://127.0.0.1:5175/mock-server` with frontend configured to `http://127.0.0.1:3032`; read displayed base | Display `http://127.0.0.1:3032/api/mock/serve` | Exact configured URL shown in browser accessibility state | PASS for URL display | Browser state observed. Page management fetch separately returned 401 due stale persisted session; route UI workflow not verified. UI-URL-01 |
| UAT-MOCK-API-02 | Authenticated synthetic user created `POST /uat-followup/items` through controlled backend API; sent POST to its serve URL | Return configured status and fixture JSON | Route create 201; serve response 201, `{"created":true,"id":"synthetic-item-01"}` | PASS (API, not UI) | Controlled HTTP calls to loopback `127.0.0.1:3032`; no token printed |
| UAT-AUTH-REV-02 | Synthetic HTTP signup, logout, then protected request using same revoked bearer | Signup succeeds, logout succeeds, protected route denies revoked token | 201, 200, then 401 | PASS (API) | Token remained in memory and was not printed |
| UAT-AUTH-XUSER-02 | User A created a marker mock route; User B requested authenticated route list | User B cannot see User A's route | Pre-fix UAT: B's list returned 200 and included `/uat-owner-a/private-marker`; post-fix actual-route results are recorded in AUTHZ-02-01 through AUTHZ-02-07 | Historical FAIL; superseded by post-fix HTTP tests | Browser UAT remains pending |
| UAT-AUTH-LOGOUT-02 | Use previously persisted synthetic account; activate Sign Out, accept confirm, inspect both same-origin tabs, navigate protected path and reload | First tab logs out; second tab stops using restored session | Confirm appeared and was accepted; immediate browser state call timed out; eventually both tabs showed `/login` and stayed there after reload. Second tab initially showed stale authenticated dashboard before protected navigation settled at login. The browser token came from a previous backend process and was already stale against this fresh in-memory server; fresh UI login was not completed. | PARTIAL; fresh-session UAT BLOCKED | Browser AX states and URLs; separate direct API revocation test passed; same browser bearer was not extracted or printed |
| UAT-RESP-LOGIN-01 | Attempt 390×844 and 768×1024 responsive viewport checks on login screen | Browser uses requested device dimensions and content remains usable | Viewport override did not apply; runtime remained 658×822 | BLOCKED | No mobile/tablet pass claimed |
| UAT-OPENAPI-02 | Import known fixture through browser | Fixture imports and maps endpoints correctly | Not run; browser remained unauthenticated after backend restart and UI controls could not be completed reliably | NOT RUN | Continue with fresh signed-in browser session |
| UAT-TESTGEN-02 | Generate tests from imported fixture and inspect endpoints/method/assertions | Generated tests match spec | Not run | NOT RUN | Depends on UAT-OPENAPI-02 |
| UAT-REPORT-02 | Generate and export report from real run | Report contains actual run summary and downloads | Not run | NOT RUN | Earlier empty state only was observed |
| UAT-SSE-02 | Exercise assistant streaming UI and observe streamed tokens | UI streams response from intended source | Not run | NOT RUN | Source review found sample output; no live UI interaction |
| UAT-AI-LIVE-02 | Send one real provider request | Provider response succeeds using rotated development credential | Not run; AI_PROVIDER remained mock | BLOCKED | No live request authorized/performed; see AI report |

Test environment evidence: health returned `status=ok`, `database=in-memory`, `aiProvider=mock`; `lsof` confirmed frontend and backend bound to `127.0.0.1` on 5175 and 3032. The unrelated listener on port 3001 was not contacted during browser or API UAT. Reports distinguish the browser URL pass from direct API mock-route evidence.

## AUTHZ-02 owner-isolation regressions — 2026-10-27

| ID | Feature | Preconditions / steps | Expected | Actual / status | Type |
|---|---|---|---|---|---|
| AUTHZ-02-REPRO | Cross-user route listing | Before code changes, synthetic A creates a route; synthetic B calls actual authenticated `GET /api/mock/routes` | B list excludes A route | Create 201; B list 200 included A route (`bSeesA=true`); defect reproduced | Actual HTTP, pre-fix |
| AUTHZ-02-01 | Owner assignment | A posts a route with spoofed `ownerUserId` in body | Stored owner equals verified token user | Response owner equals signup user's backend ID; spoof value ignored; PASS | Actual HTTP |
| AUTHZ-02-02 | Private list/detail | A owns a route; B lists and requests its ID | Route absent from B list; detail denied without existence disclosure | B list omits route; B detail 404; A detail 200; PASS | Actual HTTP |
| AUTHZ-02-03 | Private update/delete | B guesses A route ID for PUT and DELETE | Both denied, no route mutation/removal | Both 404; A's route still dispatches; A can update/delete; PASS | Actual HTTP |
| AUTHZ-02-04 | Second-user own CRUD | B creates route, lists, updates, deletes it | B's own route is manageable | Create/list/update/delete succeeded; PASS | Actual HTTP |
| AUTHZ-02-05 | Anonymous and ownerless policy | Anonymous management; authenticated get/update/delete legacy seed by ID | Anonymous gets 401; ownerless seed is inaccessible; public serving remains | 401 management; legacy operations return 404; unauthenticated seed serving returns 200; PASS | Actual HTTP |
| AUTHZ-02-06 | Log privacy | A invokes its route; B reads/clears logs | B sees no A logs and cannot clear them | B total 0; B clear leaves A log available to A; PASS | Actual HTTP |
| AUTHZ-02-07 | OpenAPI overwrite scope | A and B own routes; A generates spec with overwrite | Only A routes replaced | B route remains after A overwrite; PASS | Unit |

Focused command `node --import tsx --test test/mockServer.test.ts test/mockServerHttpIntegration.test.ts test/auth.test.ts test/authController.test.ts`: **43 passed, 0 failed, 0 skipped**. Backend build passed. Lint exited 0 with 39 warnings and no errors. Browser acceptance remains NOT RUN.

## Loopback browser UAT continuation — 2026-10-27

| ID | Area / steps | Expected | Actual / status | Evidence |
|---|---|---|---|---|
| UAT-ENV-LOOPBACK-03 | Start backend on 3033 and Vite on 5176; inspect listeners, health, and configured URL | Both bind only to loopback; backend health and mock provider mode are known; URL uses configured origin | Backend `127.0.0.1:3033`, frontend `127.0.0.1:5176`; health `ok`, in-memory, `mock`; displayed URL `http://127.0.0.1:3033/api/mock/serve`; PASS | `lsof`, `/health`, browser page |
| UAT-UI-SIGNUP-03 | Create a new synthetic account through signup UI | Dashboard shows the newly created user | Signup completed; dashboard showed the synthetic name; PASS | Browser AX state; credentials omitted |
| UAT-MOCK-CREATE-03 | Create synthetic GET route from Mock Server UI | Route appears with configured method/path/status | UI success message; route card shows GET path and status 200; PASS | Browser AX state |
| UAT-MOCK-EXEC-03 | Click route Test; Send in Request Builder | Request uses configured backend URL; expected status and body appear | Request URL used 127.0.0.1:3033; response `200 OK`, exact configured JSON; PASS | Browser response panel and dashboard history |
| UAT-MOCK-LOG-03 | Reopen Mock Server, inspect Traffic Logs | One matching GET with correct path/route/status | One GET log matched route, status 200; PASS | Browser AX table state |
| UAT-AUTH-LOGOUT-03 | Sign out from fresh UI session; inspect first tab, refresh; operate second tab then refresh | First and second tabs end unauthenticated; stale UI distinguished from backend denial | Confirm action caused browser-tool interruption; next observation first tab was `/login`, still `/login` after refresh. Second tab initially remained stale, protected mock load showed 401, then reload led to `/login`. Confirm dialog acceptance itself uncertain; PARTIAL | Browser URLs, protected page's 401 message and reload state |
| AUTHZ-02-HTTP-03 | Run actual mock/auth routes with two synthetic users | All route ownership, OpenAPI/log scope, anonymous rejection and public serving assertions pass | Combined focused set **45 passed, 0 failed, 0 skipped** | Command recorded in Testing Report |
| UAT-OPENAPI-IMPORT-03 | Import known OpenAPI fixture through file upload UI | Fixture parses and expected endpoints appear | NOT RUN; selected browser interface could not set a file chooser | Manual follow-up required |
| UAT-RESP-03 | Inspect desktop/tablet/mobile breakpoints | Layout remains usable without overflow | NOT RUN; viewport override unavailable through selected browser interface | Manual follow-up required |
| UAT-SSE-03 | Trigger assistant streaming UI | UI receives intended event stream | NOT RUN | Manual follow-up required |
| UAT-REPORT-EXPORT-03 | Generate/export from imported spec and completed tests | Report and CSV/JSON exports reflect actual results | NOT RUN; no active spec/generated tests in fresh app state | Depends on OpenAPI import and test generation |
| UAT-AI-LIVE-03 | One genuine Gemini call | Live provider returns useful response with controlled credential handling | BLOCKED / NOT RUN; provider remains mock; live invocations 0 | Requires rotated development key and explicit authorization |

Loopback startup commands, actual listener addresses, health, and test command are recorded in the latest Testing Report section. Port 3001's unrelated listener was not contacted.

## Final UAT continuation — 2026-10-27

| ID | Area / steps | Expected | Actual / status | Evidence |
|---|---|---|---|---|
| UAT-UI-SIGNUP-04 | Signup through UI against fresh in-memory loopback backend | Account created and dashboard shown | Signup succeeded; `/dashboard` showed synthetic account; PASS | Browser AX state; no credentials recorded |
| UAT-AUTH-LOGOUT-04 | Click Sign Out, accept confirmation, refresh and try protected route with prior session | Confirmed logout and rejected old session | Sign Out opened JS confirmation and automation was interrupted. Next observation showed `/login`; exact dialog outcome and same-session protected request were not established; BLOCKED/PARTIAL | Browser URL/state; do not infer acceptance from redirect alone |
| UAT-SSE-HTTP-04 | Authenticated POST `/api/stream/chat`, capture event frames/timing | Valid stream progressively delivered and terminates | HTTP 200 `text/event-stream`; 1 step, 8 token, 1 done; first token 86 ms, last 653 ms; PASS for transport only | Controlled loopback fetch; credentials/token omitted |
| UAT-SSE-SEM-04 | Compare output/provider and UI wiring | Intended AI stream rendered in the app | Fixed sample tokens, no provider call; no page consumes `useSSEChat`; AI/UI feature NOT VERIFIED | Source trace plus protocol capture |
| UAT-AUTH-XUSER-BROWSER-04 | Two independent browser contexts, create as A and inspect/manage as B | B cannot see/manage A; B can manage own route | Not run in separate browser contexts; BLOCKED. Actual-route HTTP suite passed 45/45 as separate evidence | Focused command in Testing Report |
| UAT-OPENAPI-IMPORT-04 | Upload known fixture and inspect endpoints/generated tests | Correct mapping and matching test cases | Not run; BLOCKED by unavailable file chooser operation | Manual checklist follow-up |
| UAT-REPORT-EXPORT-04 | Generate report, export JSON/CSV and inspect downloads | Exports reflect completed run | Not run; BLOCKED on imported spec and generated execution | Manual checklist follow-up |
| UAT-RESP-04 | Inspect desktop/tablet/mobile at verified dimensions | Usable layout without unintended overflow | Not run; BLOCKED because selected UI surface has no viewport override | Manual checklist follow-up |


## Final acceptance rerun — 2026-10-27

| ID | Preconditions / execution | Expected | Actual | Status |
|---|---|---|---|---|
| ACC-AUTH-HTTP-01 | Fresh synthetic user on ephemeral loopback Express auth+`requireAuth` routes; call protected route, logout, retry same token | 200 before logout; logout succeeds; 401 after | Signup 201; protected 200; logout 200; protected 401. Token not printed. | PASS (backend HTTP; browser dialog not covered) |
| ACC-AUTHZ-HTTP-02 | Run focused mock/auth actual-route integration suite | User B cannot list/read/update/delete A routes; own-route CRUD and public serving preserved | 45 passed, 0 failed, 0 skipped | PASS (HTTP tests; browser contexts blocked) |
| ACC-OPENAPI-API-01 | POST valid synthetic OpenAPI JSON to authenticated `POST /api/openapi/import` | Parsed normalized title, endpoint, method, params/schema | 200; title `Synthetic Widget API`; exactly GET `/widgets/{widgetId}` | PASS (documented API, not browser upload) |
| ACC-TESTGEN-API-01 | Generate positive suite from imported normalized spec | Correct endpoint/method and example path parameter substituted | One test; GET `/widgets/{widgetId}`; request URL ended `/widgets/widget-42`; expected 200 assertion present | PASS (API) |
| ACC-TESTEXEC-API-01 | Execute generated test against local controlled endpoint | Request reaches fixture and response is displayed | `PASSED_EXECUTION`, HTTP 200, expected synthetic JSON | PASS (API) |
| ACC-REPORT-API-01 | Generate report using actual test result | Counts/status/endpoint match execution | Report total 1, passed 1, endpoint GET `/widgets/{widgetId}` | PASS (API aggregation) |
| ACC-OPENAPI-GEN-REPORT-UNIT-01 | Parser/generator/report test files | Valid, invalid, boundary behaviors pass | 24 passed, 0 failed, 0 skipped | PASS |
| ACC-REPORT-EXPORT-UNIT-01 | Frontend report service test with Blob/object URL capture | JSON opens/parses; CSV rows/headings and filenames correct | JSON parsed and ID/endpoint matched; endpoints/failure CSV headings and row verified | PASS (unit-level; not browser download) |
| ACC-FE-FOCUSED-01 | Four OpenAPI/test-generator/report component/service files | Workflows and error UI render correctly | 4 files, 21 tests passed | PASS (OpenAPI service mocked in component tests) |
| ACC-FE-BUILD-01 | Frontend TypeScript + production build | Typecheck and build succeed | PASS; Vite transformed 2,397 modules | PASS |
| ACC-BROWSER-XUSER-01 | Two independent browser contexts | B cannot observe/manage A, can manage own route | Separate Chrome provider unavailable; no two-context UI test performed | BLOCKED |
| ACC-LOGOUT-UI-01 | Fresh UI session, accept browser confirmation and reuse token | Confirmed UI logout and token rejection | UI signup succeeded; confirm dialog interrupted automation. Separate backend HTTP test proves 401 after logout but not browser confirmation. | BLOCKED (UI), backend PASS |
| ACC-OPENAPI-UI-01 | Upload valid fixture through file chooser | Endpoint explorer shows parsed spec | Not run. Documented JSON API path tested separately. | BLOCKED |
| ACC-REPORT-DOWNLOAD-01 | Complete UI run, download files, open downloaded files | Browser files match run | No browser download operation; unit Blob content verified only. | BLOCKED |
| ACC-RESPONSIVE-01 | Verified viewport dimensions at desktop/tablet/mobile | No inaccessible controls/overflow | Viewport control unavailable; no responsive result claimed. | BLOCKED |
| ACC-AI-LIVE-01 | Rotated dev key and approved live invocation | One real provider result and failure assessment | Not attempted; key rotation not established, live calls 0. | NOT TESTED |


| ID | Preconditions / execution | Expected | Actual | Status |
|---|---|---|---|---|
| ACC-SSE-HTTP-02 | Fresh synthetic auth on ephemeral loopback app; authenticated `POST /api/stream/chat` with deliberately unrelated prompt | Progressive stream whose content comes from the requested/configured AI source | 200; 1 step, 8 token, 1 done; first token 82 ms, last 652 ms; concatenated output was the same fixed sample as before; provider calls 0 | PASS for simulated transport; FAIL as AI behavior |


### AI streaming scope note — 2026-10-27

No README or assistant-page workflow specifies streaming; the current user-facing assistant uses the non-streaming chat route. Real AI streaming is therefore outside the documented product scope. At that historical point, `/api/stream/chat` was an unused deterministic simulation. Prior `ACC-SSE-HTTP-02` evidence verifies transport only and fails the AI-content expectation; it was not rerun during this scope review. At the time of that scope review AI-SSE-01 remained open; the simulation was subsequently removed and verified below.


## SSE simulation removal verification — 2026-10-27

| Test | Evidence | Result |
|---|---|---|
| `unusedSimulatedStream.test.ts` | Confirms `/api/stream` is not mounted, route/controller and `useSSEChat` files are absent, assistant chat still uses `askAssistant`, and Request Builder/agent SSE remain | PASS, 1/1 |
| AI Assistant page regression | `npm test -- --run src/pages/AI/__tests__/AIAssistantPage.test.tsx` | PASS, 2/2 |
| Backend full suite — initial diagnostic run | `node --import tsx --test test/*.test.ts` in restricted sandbox | 309 passed, 4 failed, 3 skipped; loopback bind EPERM (3) and backend loader could not resolve frontend `@/config` alias (1) |
| Frontend full suite | `npm test` | 103 passed, 1 failed, 2 skipped; existing cross-feature signup test failed with auth API Network Error |
| Builds/lint | Backend `npm run build`; Frontend `npm run build`; both lint scripts | Builds pass; lint 0 errors (39 backend and 10 frontend warnings) |

Prior `/api/stream/chat` HTTP captures are historical evidence of the removed simulation, not current endpoint behavior. AI-SSE-01 is closed after removal and passing focused regression coverage.


## Test-runner diagnosis regression — 2026-10-27

| Case | Result | Evidence |
|---|---|---|
| Backend loopback integration fixtures | PASS | Elevated loopback-only full suite executed CLI, mock-server HTTP and workflow HTTP fixtures without weakening assertions. |
| Backend/frontend config alias | PASS | `node --import tsx --test test/frontendPersistenceAndResilience.test.ts` passed, including MockServerService error typing. |
| Cross-feature frontend test without backend | PASS | Focused Vitest run: 1 passed, 2 backend journeys skipped; no default port probe or unconditional signup. |
| Complete backend suite | PASS WITH SKIPS | Official `npm test`: 336 passed, 0 failed, 3 skipped. The two opt-in HTTP cases then passed separately (2/2); isolated Mongo remains skipped. |
| Complete frontend suite | PASS WITH SKIPS | 104 passed, 0 failed, 2 skipped. |
| Builds and lint | PASS WITH WARNINGS | Backend build; frontend TypeScript+production build (2,397 modules); lint 0 errors (39 backend/10 frontend warnings). |
| AI-SSE cleanup regression | PASS | Dedicated test 1/1; confirms removed simulated route/hook and retained assistant/agent/Request Builder workflows. |

Backend skips: two opt-in API integration tests and Mongo persistence requiring a disposable `APIFORGE_TEST_MONGO_URI`. Frontend skips: two journeys requiring explicit `APIFORGE_INTEGRATION_API_URL`.


### Opt-in HTTP integration follow-up — 2026-10-27

`APIFORGE_RUN_HTTP_INTEGRATION=1 node --import tsx --test test/apiRoutes.integration.test.ts`: **2 passed, 0 failed, 0 skipped**, using controlled ephemeral loopback endpoints. This covers both cases that are skipped in the default backend full-suite run. Mongo persistence remains unexecuted without an isolated disposable test database URI.
