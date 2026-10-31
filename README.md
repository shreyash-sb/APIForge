# APIForge

**An API testing and validation platform with a grounded AI assistant.**

Import an OpenAPI or Swagger specification, generate test suites from it, run them against your API, and validate every response against the contract. When something fails, APIForge explains why — with an optional AI assistant that answers from your actual test results, using your own Gemini key.

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4-000000.svg)](https://expressjs.com/)

---

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [AI features](#ai-features)
- [Command-line runner](#command-line-runner)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Security](#security)
- [Contributing](#contributing)

---

## Features

**Specification-driven testing**
- **OpenAPI import** — OpenAPI 3.0, 3.1 and Swagger 2.0 in JSON or YAML, with an endpoint explorer and export back to OpenAPI 3.1.
- **Test generation** — deterministic positive, negative, boundary, security, schema and parameter tests derived from the spec.
- **Execution** — run the whole suite or a single test against your API, with per-request timeouts.
- **Response validation** — status codes, headers, content types and full JSON-schema checks, with each failed assertion showing expected vs. actual.
- **Reports & analytics** — pass rates, endpoint health, failure breakdowns, and JSON/CSV export.

**Day-to-day API work**
- **Request Builder** — any method, query parameters, headers, Bearer/Basic/API-key auth, raw bodies (JSON, XML, form, text), pre-request scripts and `pm.test`-style assertions, cURL import, and code export (cURL, JavaScript, Python, Go, Java).
- **Collections** — save and run groups of requests, export them as OpenAPI or JSON, and import Postman v2.1 collections.
- **Environments** — named profiles with `{{variables}}` and secret values that are never written to browser storage.
- **Workflows** — multi-step scenarios that chain requests and pass values between steps (JSONPath, headers, status codes).
- **Mock server** — create routes by hand or generate them from a spec, with configurable status, body and latency.
- **History** — an audit trail of every request and test run.

**AI (optional)**
- **AI Assistant** — ask questions such as *"Why did GET /users fail?"* and get answers grounded in your spec, tests and results, with the evidence cited.
- **Failure diagnosis** — one click in Reports diagnoses every failed test, with root cause, severity and a suggested fix.

AI output is always advisory. Pass/fail is decided by deterministic validation, never by the AI.

---

## How it works

```
 OpenAPI spec ──► Test Generator ──► Execute ──► Validate ──► Reports
                                                   │            │
                                                   └── AI Assistant & Diagnosis (advisory)
```

1. **Import** a specification on the OpenAPI Import page.
2. **Generate** tests in the Test Generator and **run** them against your API.
3. **Validate** the responses against the contract in Response Validation.
4. **Review** results in Reports & Analytics, and use **Diagnose failures** or the **AI Assistant** to understand what went wrong.

---

## Tech stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 3, Zustand, React Router 7, Recharts, Axios, Lucide icons |
| Backend | Node.js 20+, Express 4, TypeScript, Mongoose 9, `express-rate-limit`, `@scalar/openapi-parser` |
| AI | Google Gemini REST API (user-supplied key), with a deterministic mock provider |
| Testing | Vitest + Testing Library (frontend), Node.js test runner via `tsx` (backend) |
| Database | MongoDB (optional — runs in memory without it) |

---

## Getting started

### Prerequisites

- **Node.js 20 or newer** and npm
- **MongoDB** (optional, recommended) — for example via Homebrew on macOS:
  ```bash
  brew tap mongodb/brew && brew install mongodb-community
  brew services start mongodb-community
  ```

### Install

```bash
git clone https://github.com/shreyash-sb/APIForge.git
cd APIForge

npm install
npm install --prefix Backend
npm install --prefix Frontend
```

### Configure

Create `Backend/.env` (it is git-ignored — never commit it):

```bash
# Generate a secret with: openssl rand -base64 48
JWT_SECRET=replace-with-a-long-random-secret
MONGODB_URI=mongodb://127.0.0.1:27017/apiforge
```

See [Configuration](#configuration) for every available option.

### Run

```bash
npm run dev
```

| Service | URL |
|---|---|
| Web app | http://localhost:5173 |
| Backend API | http://localhost:3001 |
| Health check | http://localhost:3001/health |

Open the web app, create an account, and import a specification to begin.

### Production build

```bash
npm run build                 # builds Backend (tsc) and Frontend (Vite)
npm start --prefix Backend    # serves the compiled backend
```

The frontend build in `Frontend/dist` can be served by any static host. Point it at the backend with `VITE_API_BASE_URL`.

---

## Configuration

All backend settings live in `Backend/.env`.

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | random per start | **Required in production** (at least 32 bytes). Without it, every restart signs all users out. |
| `MONGODB_URI` | — | MongoDB connection string. Without it, accounts and collections are kept in memory and lost on restart. |
| `PORT` | `3001` | Backend port. |
| `NODE_ENV` | `development` | Set to `production` in deployments (also enables outbound request safety). |
| `FRONTEND_URL` | localhost ports | Comma-separated list of allowed CORS origins. |
| `REQUEST_TIMEOUT` | `30000` | Default timeout for outbound API requests, in milliseconds. |
| `OUTBOUND_REQUEST_SAFE_MODE` | `false` | Blocks requests to private, loopback and metadata addresses. Always enable for shared deployments. |
| `TRUST_PROXY` | — | Set (for example `1`) only when running behind a reverse proxy, so client IPs are read correctly. |
| `AUTH_LOGIN_RATE_LIMIT` | `30` | Sign-in requests allowed per IP every 15 minutes. |
| `AUTH_SIGNUP_RATE_LIMIT` | `20` | Account creations allowed per IP every hour. |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Gemini model used for user AI requests. |

Frontend: `VITE_API_BASE_URL` (default `http://localhost:3001`) sets the backend address.

---

## AI features

APIForge's AI features use **each user's own Gemini API key**; the application never relies on a shared key.

1. Create a key at [Google AI Studio](https://aistudio.google.com/).
2. In APIForge, open **Settings → AI Provider**, paste the key and choose **Save & test key**.
3. Use the **AI Assistant** page, or **Reports → Diagnose failures**.

**How keys are handled**
- Validated on the backend and sent to Google only in a request header — never in a URL.
- Kept in server memory for the current sign-in session only: never stored in the database or browser, never returned by the API, never logged.
- Cleared on sign-out and account deletion; re-enter it after signing in again.
- Google usage, quota and billing belong to your own Google account.

**What is sent to Gemini** — only the records relevant to the question or failure (endpoint details, expected vs. actual values, a trimmed response excerpt), with credentials, tokens and secrets removed first.

**Without a key** — the assistant and diagnosis still work in clearly labelled *mock/demo* mode using deterministic summaries. If Gemini is unavailable, responses are labelled as a fallback — mock output is never presented as Gemini.

More detail: [Backend/README.md](Backend/README.md#ai-features-user-supplied-gemini-keys).

---

## Command-line runner

Run suites and workflows headlessly — useful in CI pipelines:

```bash
npm run cli -- run-suite ./suite.json --reporter junit --output ./reports/junit.xml
npm run cli -- run-workflow ./scenario.json --env ./env.json --reporter html --output ./reports/summary.html
```

| Option | Description |
|---|---|
| `-e, --env <path>` | Environment profile JSON (for `run-workflow`) |
| `-r, --reporter <type>` | `console` (default), `junit` or `html` |
| `-o, --output <path>` | Where to write the JUnit XML or HTML report |

Exit codes: `0` all passed · `1` failures · `2` configuration or runner error.

---

## Testing

```bash
npm run test:all        # backend and frontend
npm run test:backend    # backend services, controllers and HTTP routes
npm run test:frontend   # frontend components, stores and integration flows
npm run lint            # ESLint for both packages
```

Tests never call the real Gemini API; AI behaviour is exercised with mocked responses.

---

## Project structure

```
APIForge/
├── Backend/
│   ├── src/
│   │   ├── cli/            # headless runner (run-suite, run-workflow)
│   │   ├── controllers/    # HTTP request handlers
│   │   ├── middleware/     # authentication, rate limiting, error handling
│   │   ├── models/         # MongoDB schemas
│   │   ├── routes/         # Express routes
│   │   ├── services/       # parsing, generation, execution, validation, AI
│   │   ├── types/
│   │   └── utils/          # secret redaction, resilient fetch
│   └── test/
├── Frontend/
│   └── src/
│       ├── components/     # shared UI, layout, reports, settings
│       ├── lib/            # context building, code generators, parsers
│       ├── pages/          # one folder per screen
│       ├── services/       # API clients
│       ├── store/          # Zustand stores (app and auth)
│       └── types/
└── package.json            # workspace scripts
```

---

## Security

- **Accounts** — PBKDF2 password hashing, signed session tokens, revocation on sign-out.
- **Sign-in protection** — identical responses for unknown emails and wrong passwords, per-(email, IP) lockout after repeated failures, account-wide limits, and per-IP rate limits.
- **Data isolation** — collections, mock routes and AI keys are scoped to their owner on the server; browser-stored workspace data is cleared on sign-out and when a different user signs in.
- **Secret handling** — credentials are redacted from logs, reports, AI prompts and stored history; environment secrets are never written to browser storage.
- **Outbound requests** — enable `OUTBOUND_REQUEST_SAFE_MODE` (or `NODE_ENV=production`) to block requests to internal networks.

For deployments, set `JWT_SECRET`, `MONGODB_URI`, `NODE_ENV=production`, and `TRUST_PROXY` if you run behind a reverse proxy.

---

## Contributing

1. Create a branch from `main`.
2. Make your change with tests.
3. Run `npm run lint` and `npm run test:all`.
4. Open a pull request describing the change.
