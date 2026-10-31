# APIForge Backend

Backend server for APIForge API development platform.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
npm start
```

## Environment Variables

See `.env.example` for configuration options.

### Outbound request safety

`OUTBOUND_REQUEST_SAFE_MODE=false` is the local-development default, so Request Builder can call local APIs. Set it to `true` for an exposed deployment to reject obvious loopback, private, link-local, and metadata-service IP-literal targets. Public HTTP/HTTPS APIs remain supported. This guard intentionally does not claim DNS-rebinding protection: hostname resolution and connection-time IP enforcement require deployment/network controls.

## AI features: user-supplied Gemini keys

APIForge's AI diagnosis and AI Assistant use **each user's own Gemini API key**. User AI requests never use a shared application key.

### Configuring and removing a key
1. Sign in and open **Settings → AI Provider (Gemini)**.
2. Paste your key and choose **Save & test key**. The backend makes one small request to the Gemini API (`GET /v1beta/models/{model}`, 8 s timeout, no retries) to check the key. Rejected keys are not kept.
3. **Test key** checks the stored key again. **Replace key** swaps it, and **Remove key** clears it immediately.

Google usage, quota and billing belong to **your** Gemini account. AI is optional.

### Storage: session only
APIForge has no encrypted secret store or master-key configuration, so keys are **never persisted**:
- The key is held only in backend process memory (`aiCredentialStore.service.ts`). The entry is keyed by a SHA-256 hash of the login session's bearer token and bound to the owning user ID. A lookup must match both, so one user cannot read, replace, delete or use another user's key.
- The entry expires with the session token. It is deleted on sign-out and on account deletion, and lost on a server restart, so **the key must be re-entered in each new session**.
- The key is never written to MongoDB, localStorage, sessionStorage, cookies, logs, chat history, reports or the frontend store. No endpoint returns it. `/api/ai-settings` returns only safe metadata: configured flag, masked hint (`••••abcd`), model and last validation result.
- A provider object is built for each request from the caller's own entry. There is no process-global "current key". Gemini is called with the `x-goog-api-key` header, so the key never appears in a URL, error message or log line. The error handler does not log request bodies; malformed-JSON errors are answered without logging.

Endpoints, all behind `requireAuth`: `GET /api/ai-settings`, `PUT /api/ai-settings/gemini-key` (4 KB body limit), `POST /api/ai-settings/gemini-key/test`, `DELETE /api/ai-settings/gemini-key`. Rate limits are per user: 20 key saves/tests per 15 minutes, and 30 assistant/diagnosis requests per minute.

### What is sent to Gemini
- **Diagnosis** (Reports → *Diagnose failures*): only failed executions and validation failures with failed assertions. Passing, skipped, unexecuted, not-validatable and already-diagnosed cases are not sent. The evidence contains the test name and type, method and path, expected status/conditions, execution status, HTTP status, duration, a redacted response excerpt (≤ 2,000 chars) and the failed assertions. Request headers, auth and URLs are omitted, and secret-like values are redacted on the backend.
- **Assistant**: a compact structured snapshot holding only the records relevant to the question: spec title/version, matching endpoints (parameters, request/response schema summaries, security scheme names), matching tests with their latest execution, validation and diagnosis, and the Request Builder draft when the question is about it (credentials, sensitive headers and query values, and body secrets removed). It also includes the last ≤ 6 chat turns, kept in memory only. Context is capped at 12,000 characters and marked `contextTruncated` when anything is dropped. All supplied text is treated as untrusted data under a system instruction that requires grounded answers, "I can't determine that from the current session data" when evidence is missing, and no claimed actions. When a question is ambiguous ("why did this test fail?") and no target can be identified, APIForge asks a follow-up without calling Gemini. Generation uses temperature 0.2 and at most 768 output tokens (1,536 when the user asks for detail).

### Mock/demo mode and failure labelling
- With no key configured, diagnosis and assistant use the deterministic mock provider (`provider: "mock"`, `providerStatus: "mock"`). The UI labels this output as mock/demo.
- If Gemini fails (timeout, invalid key, 429 quota/rate limit, 5xx or malformed output), the response has `provider: "mock"`, `providerStatus: "fallback"` and a classified `fallbackReason`. The UI says Gemini could not answer. Fallback output is never labelled as Gemini. Only transient 429/503 and network/timeout errors on diagnosis are retried, and only once. Invalid credentials and other client errors are never retried.
- AI output is **advisory**. Deterministic validation remains the source of truth, and AI never changes execution, validation or report counts. Diagnoses are tied to their test and execution IDs; results from earlier runs or other specs are ignored.

### Environment settings
- `GEMINI_MODEL` (optional, default `gemini-3.5-flash`): the model used for user-key requests.
- `AI_PROVIDER` / `GEMINI_API_KEY`: legacy settings, used only when code calls `createAiProvider()` directly. **No user-facing flow uses them**: diagnosis and the assistant use the requesting user's own session key (or mock/demo mode). Never commit a real key.

## Sign-in security

- **Same response for every failed sign-in.** Wrong password and unknown email both return `401 Invalid email or password.` A dummy password hash runs for unknown emails, so response timing doesn't reveal which accounts exist.
- **Lockout is per (email, client IP).** After 5 failures, that client is blocked for 15 minutes (`429`). This means an attacker can't lock the real owner out from another network. An account-wide limit of 20 failures across all clients stops distributed guessing.
- **Per-IP request limits.** `/api/auth/login` allows 30 requests per 15 minutes and `/api/auth/signup` allows 20 per hour. Override with `AUTH_LOGIN_RATE_LIMIT` and `AUTH_SIGNUP_RATE_LIMIT`.
- **Client IP.** By default this is the socket address. `X-Forwarded-For` is ignored unless `TRUST_PROXY` is set (for example `TRUST_PROXY=1` behind one reverse proxy). Otherwise clients could spoof their IP to dodge limits or forge activity logs.
- **Signed-out tokens.** These are stored as SHA-256 hashes and forgotten once the token would have expired anyway, so the list never grows without bound.
- **Required for real deployments:** set `JWT_SECRET` (at least 32 bytes). Without it, a random secret is generated on every start and all sessions end on restart. Set `MONGODB_URI` to keep accounts and collections across restarts.

The frontend keeps workspace data (specs, tests, results, environments, workflows, history) in browser storage **tied to one account**. It is cleared when that user signs out or deletes their account, and wiped if a different account signs in on the same browser.

## API Endpoints

### POST /api/requests/execute

Execute an API request.

**Request Body:**
```json
{
  "method": "GET",
  "url": "https://api.example.com/users",
  "queryParams": [],
  "headers": [],
  "body": null,
  "auth": {
    "type": "none"
  }
}
```

**Response:**
```json
{
  "success": true,
  "status": 200,
  "statusText": "OK",
  "responseTime": 184,
  "headers": {},
  "body": {},
  "size": 1234
}
```
