# APIForge Headless CLI Runner (Phase 11)

APIForge provides a lightweight, deterministic command-line test runner designed for continuous integration environments, automated testing workflows, and local developer execution without requiring the React UI.

---

## 1. Prerequisites & Installation

* **Node.js**: v18.0.0 or higher (v20+ recommended).
* **Package Manager**: npm.

To use the CLI from the `Backend` directory:
```bash
cd Backend
npm install
npm run build
```

The runner can be invoked in two ways:
1. **Via `tsx` during local development**:
   ```bash
   npx tsx src/cli/index.ts <command> <file.json> [options]
   # or
   npm run cli -- <command> <file.json> [options]
   ```
2. **Via built production bundle**:
   ```bash
   node dist/cli/index.js <command> <file.json> [options]
   ```

---

## 2. CLI Commands & Options

### Syntax
```bash
apiforge <command> <target.json> [options]
```

### Commands
* `run-workflow <scenario.json>`: Executes an APIForge multi-step workflow scenario, resolving dependencies, performing runtime variable extractions, executing teardowns, and validating response expectations.
* `run-suite <suite.json>`: Executes a deterministic test suite containing API test cases and validates contract assertions.
* `--help`, `-h`: Displays usage instructions and available options.
* `--version`, `-v`: Displays current CLI version.

### Options
* `-e, --env <path>`: Path to an environment profile JSON file containing runtime variables and secrets (used with `run-workflow`).
* `-r, --reporter <type>`: Report format. Supported types:
  * `console` *(default)*: Formatted terminal summary with status badges and failure breakdown.
  * `junit`: Standard JUnit XML output for CI dashboard aggregation.
  * `html`: Standalone, self-contained HTML report file with responsive styling.
* `-o, --output <path>`: Output destination file path for generated JUnit XML or HTML reports. Automatically creates parent directories if they do not exist.

---

## 3. Supported Input JSON Formats

### 3.1 Workflow Scenario (`scenario.json`)
A standard APIForge workflow scenario structure:
```json
{
  "id": "wf_user_lifecycle",
  "name": "User Authentication & Profile Flow",
  "steps": [
    {
      "id": "step_auth",
      "name": "Login",
      "enabled": true,
      "request": {
        "method": "POST",
        "url": "http://127.0.0.1:3001/api/v1/auth/login",
        "headers": [{ "key": "Content-Type", "value": "application/json", "enabled": true }],
        "body": "{\"username\": \"dev\", \"apiKey\": \"{{apiKey}}\"}",
        "auth": { "type": "none" }
      },
      "extractors": [
        { "targetVariable": "token", "source": "BODY_JSONPATH", "path": "$.token", "isSecret": true },
        { "targetVariable": "userId", "source": "BODY_JSONPATH", "path": "$.userId", "isSecret": false }
      ]
    },
    {
      "id": "step_profile",
      "name": "Fetch Profile",
      "enabled": true,
      "dependsOn": ["step_auth"],
      "request": {
        "method": "GET",
        "url": "http://127.0.0.1:3001/api/v1/users/{{userId}}",
        "headers": [{ "key": "Authorization", "value": "Bearer {{token}}", "enabled": true }],
        "auth": { "type": "none" }
      },
      "expected": { "statusCodes": ["200"] }
    },
    {
      "id": "step_cleanup",
      "name": "Session Logout",
      "isTeardown": true,
      "enabled": true,
      "request": {
        "method": "POST",
        "url": "http://127.0.0.1:3001/api/v1/auth/logout",
        "headers": [{ "key": "Authorization", "value": "Bearer {{token}}", "enabled": true }],
        "auth": { "type": "none" }
      }
    }
  ]
}
```

### 3.2 Environment Profile (`env.json`)
```json
{
  "id": "env_qa",
  "name": "QA Environment",
  "variables": [
    { "name": "baseUrl", "value": "http://127.0.0.1:3001", "enabled": true },
    { "name": "apiKey", "value": "super-secret-key-12345", "isSecret": true, "enabled": true }
  ]
}
```

### 3.3 Test Suite (`suite.json`)
Supports both a `TestSuite` wrapper or a direct array of `TestCase`:
```json
{
  "specificationTitle": "Store API Suite",
  "tests": [
    {
      "id": "tc_orders_positive",
      "name": "Create Order - Positive Verification",
      "type": "POSITIVE",
      "priority": "HIGH",
      "enabled": true,
      "endpoint": { "method": "POST", "path": "/api/v1/orders" },
      "request": {
        "method": "POST",
        "url": "http://127.0.0.1:3001/api/v1/orders",
        "queryParams": [],
        "headers": [{ "key": "Content-Type", "value": "application/json", "enabled": true }],
        "body": "{\"item\": \"laptop\"}",
        "auth": { "type": "none" }
      },
      "pathParams": {},
      "expected": { "statusCodes": ["201"] },
      "metadata": { "sourceEndpointId": "ep_orders", "rule": "positive-status" }
    }
  ]
}
```

---

## 4. Process Exit Codes

| Exit Code | Meaning | Description |
| :--- | :--- | :--- |
| `0` | **Success** | All test assertions and workflow steps completed successfully. |
| `1` | **Assertion Failure** | One or more steps encountered a contract validation failure, unexpected status code, or network failure. (Note: Expected 4xx/5xx responses matching test expectations exit `0`). |
| `2` | **Runner / Config Error** | Invalid CLI arguments, missing input files, malformed JSON syntax, or fatal filesystem errors. |

---

## 5. Secret Redaction Policy

* Sensitive environment variables (flagged with `isSecret: true`) and extracted tokens (flagged with `isSecret: true`) are **strictly redacted** across all output channels:
  * Terminal console output displays `[REDACTED]`.
  * Generated JUnit XML files contain `[REDACTED]`.
  * Standalone HTML reports contain `[REDACTED]`.
* Header keys such as `Authorization`, `Cookie`, `X-Api-Key`, and passwords are automatically scrubbed from assertion failure details and request representations.

---

## 6. Example CI/CD Integration (GitHub Actions)

Example step configuration for a GitHub Actions workflow:

```yaml
name: APIForge Automated API Tests

on: [push, pull_request]

jobs:
  api-tests:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: Backend/package-lock.json

      - name: Install backend dependencies & build
        run: |
          cd Backend
          npm ci
          npm run build

      - name: Execute APIForge Workflow Scenario
        run: |
          cd Backend
          node dist/cli/index.js run-workflow ./fixtures/e2e-workflow.json \
            --env ./fixtures/env-ci.json \
            --reporter junit \
            --output ./reports/junit-results.xml

      - name: Publish Test Results
        uses: EnricoMi/publish-unit-test-result-action@v2
        if: always()
        with:
          files: Backend/reports/junit-results.xml
```
