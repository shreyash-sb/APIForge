# APIForge

APIForge is an academic API-development and API-testing application. It provides a React interface and an Express backend for importing OpenAPI documents, generating deterministic tests, executing and validating requests, running workflows, diagnosing failures, reporting results, and hosting local mock routes.

## Implemented capabilities

- Request Builder with HTTP methods, headers, query parameters, JSON bodies, and bearer/API-key/basic authentication.
- OpenAPI 3.0, OpenAPI 3.1, and Swagger 2.0 import and normalization; external references are rejected.
- Deterministic test generation and execution. An HTTP 4xx/5xx response is a completed transport execution; contract validation separately decides whether it passes.
- Contract validation for status, headers, content type, schemas, constraints, composition, and references.
- Advisory AI diagnosis with a deterministic `mock` provider fallback; it never changes validation outcomes.
- Reports, workflow variables/extraction/chaining/teardown, local environments, mock routes, and bounded traffic inspection.
- Headless CLI with console, JUnit XML, and self-contained HTML reports.

## Prerequisites

- Node.js 18 or newer (Node 20+ recommended)
- npm
- Two terminals for the frontend and backend during interactive use

## Install and configure

Install dependencies separately; there is no root workspace script.

```bash
cd Backend
npm install
cp .env.example .env

cd ../Frontend
npm install
cp .env.example .env
```

Never commit either `.env` file. The checked-in `.env.example` files contain placeholders/defaults only.

### Environment settings

Backend (`Backend/.env`):

- `PORT=3001` — backend listen port.
- `REQUEST_TIMEOUT=30000` — outbound request timeout in milliseconds. Invalid values safely fall back to 30 seconds; the maximum is 120 seconds.
- `OUTBOUND_REQUEST_SAFE_MODE=false` — use `true` outside controlled local development. It rejects obvious loopback, private, link-local, and metadata-service IP-literal targets.
- `AI_PROVIDER=mock` — the default requires no paid provider. Set `google-gemini` plus a separately supplied `GEMINI_API_KEY` only when external AI diagnosis is desired.

Frontend (`Frontend/.env`):

```dotenv
VITE_API_BASE_URL=http://localhost:3001
```

Safe mode is an important defense-in-depth control, not a complete SSRF solution: it does not prevent hostname DNS rebinding. Keep the backend and mock-management endpoints on a trusted network until access controls are available.

## Start locally

Terminal 1:

```bash
cd Backend
npm run dev
```

Terminal 2:

```bash
cd Frontend
npm run dev
```

Open `http://localhost:5173`. The backend health endpoint is `http://localhost:3001/health`.

For a compiled backend:

```bash
cd Backend
npm run build
npm start
```

For a frontend production preview:

```bash
cd Frontend
npm run build
npm run preview
```

## Demonstration flow

Use the application with `AI_PROVIDER=mock`; no external credential is needed.

1. Start backend and frontend, then confirm `/health` returns JSON with `status: "ok"`.
2. In **OpenAPI**, import `Backend/test/fixtures/openapi3.json`.
3. In **AI Test Generator**, generate deterministic tests from the imported endpoints.
4. In **Mock Server**, use a seeded route or create a safe local route. Send it through **Request Builder** using `http://localhost:3001/api/mock/serve/...`.
5. Execute a generated test and inspect its distinct execution and validation states.
6. Configure an intentionally wrong expected status or schema to demonstrate a validation failure; run **AI Diagnosis**. With the mock provider, the diagnosis remains deterministic and advisory.
7. Generate a report and inspect the endpoint/failure breakdown. Do not save reports that contain sensitive real data to source control.
8. In **Workflows**, run the seeded login/profile/teardown flow against the Mock Server to demonstrate extraction, substitution, dependency blocking, and teardown.
9. Return to **Mock Server** and inspect the traffic log; sensitive fields are redacted and retained logs are bounded.
10. In a terminal, run the CLI smoke suite below.

This is an API-level demonstration procedure. Browser-based end-to-end automation has not been completed.

## CLI

From `Backend` after building:

```bash
node dist/cli/index.js run-suite test/fixtures/smoke-suite.json --reporter console
node dist/cli/index.js run-suite test/fixtures/smoke-suite.json --reporter junit --output reports/results.junit.xml
node dist/cli/index.js run-suite test/fixtures/smoke-suite.json --reporter html --output reports/results.report.html
```

Start the backend on port 3001 before using the smoke-suite fixture. The CLI supports `run-suite` and `run-workflow`; see [CLI.md](CLI.md) for the formats, flags, and exit codes. Console is the default reporter; JUnit and HTML require `--output`.

## Verification commands

```bash
cd Backend && npm test && npm run lint && npm run build
# Keep the backend running on port 3001 for Frontend integration tests.
cd Frontend && npm test && npm run lint && npm run build
```

The frontend suite includes cross-feature integration tests that call the live backend on port 3001; start the backend first when running the frontend test command.

## Troubleshooting

- **Frontend cannot reach backend:** confirm both ports, `VITE_API_BASE_URL`, and restart Vite after changing its `.env`.
- **Request blocked by policy:** use only deliberate local targets during development, or review `OUTBOUND_REQUEST_SAFE_MODE`; keep it `true` in non-local environments.
- **AI provider unavailable:** leave `AI_PROVIDER=mock` for the complete deterministic fallback.
- **CLI smoke suite fails:** ensure backend is listening on port 3001, or use a suite fixture whose URLs match your selected port.
- **Browser shows old state:** use the workspace reset control; corrupted or unavailable browser storage is handled defensively.

## Limitations and future scope

This is suitable for a responsible academic demonstration, not a production deployment. There is no authentication or authorization for backend/mock-management endpoints, no database, no CI/CD pipeline, no load testing, and no completed browser E2E suite. Do not expose it to untrusted networks. DNS-rebinding protection and connection-time network enforcement remain deployment/network responsibilities.
