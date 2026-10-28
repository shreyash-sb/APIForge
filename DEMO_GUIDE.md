# APIForge — Live Demo & Feature Presentation Guide
**Version:** 1.0.0  
**Target Audience:** Academic Evaluator / College Professor  
**Demo Scenario:** Integrated User Management API (`Aarav Patil`)  

---

## 1. Quick Start & Application Architecture

APIForge consists of a Node.js/Express TypeScript backend and a Vite React 19 frontend.

```
┌───────────────────────────────────────┐         ┌───────────────────────────────────────┐
│     APIForge Frontend (React 19)      │         │     APIForge Backend (Express / TS)   │
│  http://localhost:5173                │ ──HTTP─▶│  http://localhost:3001                │
│  - Request Builder & Collections      │         │  - Outbound HTTP Dispatcher           │
│  - Workflow Visualizer & Execution    │         │  - Mock Server Router (/api/mock/...) │
│  - Response Validation & Schemas      │         │  - JSON Schema Validator              │
│  - Reports & Analytics Dashboard      │         │  - Report Aggregation Engine          │
│  - OpenAPI Parser & Documentation     │         │  - Workflow Step Execution Engine     │
└───────────────────────────────────────┘         └───────────────────────────────────────┘
```

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Environment Configuration
The application comes pre-configured with safe local defaults. No manual `.env` creation is required to run the demo.
- **Backend Defaults:**
  - `PORT=3001`
  - `JWT_SECRET=local-dev-jwt-secret-do-not-use-in-production`
  - `GEMINI_API_KEY` *(Optional)*: If omitted, the deterministic fallback AI generator and offline test generators work seamlessly.
- **Frontend Defaults:**
  - `VITE_API_BASE_URL=http://localhost:3001`

### Starting the Servers

Open two terminal tabs in the project root (`APIForge/`):

#### Terminal 1 — Start the Backend Server:
```bash
npm run dev:backend
```
*Expected log:* `Server running on port 3001`

#### Terminal 2 — Start the Frontend Application:
```bash
npm run dev:frontend
```
*Expected log:* `Local: http://localhost:5173/`

Open your browser to: **`http://localhost:5173`**

### Live Faculty Verification Command (Instant Demonstration)
If your professor asks to verify the complete project programmatically:
```bash
npm run test:faculty
```
*This executes a unified master test suite testing all 9 features against Aarav Patil's User Management API and prints green checkmarks for each feature in under 1 second!*

---

## 2. Integrated Demo Scenario: User Management API

All 9 features are demonstrated using a consistent, production-grade User Management scenario centered around **Aarav Patil**:

- **Target Record:**
```json
{
  "id": 101,
  "name": "Aarav Patil",
  "email": "aarav@example.com",
  "role": "student",
  "active": true
}
```

- **Logical Endpoints:**
1. `GET /api/users` — Retrieve all users
2. `GET /api/users/101` — Retrieve user profile by ID
3. `POST /api/users` — Create a new user
4. `PUT /api/users/101` — Update user details
5. `DELETE /api/users/101` — Delete user

---

## 3. Step-by-Step Feature Walkthrough

### Feature 1: Mock Server (Foundation)
*Demonstrates dynamic mock routing, parameterized path matching, and instant server activation.*

1. In the sidebar, click **Mock Server** (`/mock-server`).
2. Notice the **Mock Base URL** banner displaying `http://localhost:3001/api/mock/serve`.
3. Check the route list:
   - `GET /api/users` (Returns array with Aarav Patil)
   - `GET /api/users/:id` (Returns Aarav Patil record)
   - `POST /api/users` (201 Created)
   - `PUT /api/users/:id` (200 OK)
   - `DELETE /api/users/:id` (200 OK)
4. Verify server status shows **Active** (green badge).
5. Click **Copy URL** for `GET /api/users/:id`.

---

### Feature 2: Request Builder
*Demonstrates multi-method HTTP dispatch, real backend execution, header/query parsing, and saving to Collections.*

1. In the sidebar, click **Request Builder** (`/request-builder`).
2. **Execute GET Request:**
   - Method: Select `GET`.
   - URL: `http://localhost:3001/api/mock/serve/api/users/101`
   - Click **Send**.
   - **Result:** Status `200 OK`, response time in ms, response headers, and JSON body showing Aarav Patil's details.
3. **Execute POST Request:**
   - Method: Select `POST`.
   - URL: `http://localhost:3001/api/mock/serve/api/users`
   - In the **Body** tab, select `JSON` and enter:
     ```json
     {
       "name": "Aarav Patil",
       "email": "aarav@example.com",
       "role": "student",
       "active": true
     }
     ```
   - Click **Send**.
   - **Result:** Status `201 Created` with confirmation payload.
4. **Save to Collection:**
   - Click **Save to Collection** in the top toolbar.
   - Choose or enter collection name `Demo Users`, name the request `Get Aarav Patil`, and click **Save**.
   - Navigate to **Collections** in sidebar to show the saved request with an **Open in Request Builder** button.
5. **Negative Test (Error Handling):**
   - Enter an invalid URL: `http://localhost:3001/api/mock/serve/invalid-endpoint-404`.
   - Click **Send**.
   - **Result:** Real 404 response returned from the backend mock router with an informative error body.

---

### Feature 3: Workflows
*Demonstrates sequential multi-step execution, dynamic variable extraction (`userId`), dependency chaining, and secret redaction.*

1. In the sidebar, click **Workflows** (`/workflows`).
2. Select the preloaded scenario: **User Management Lifecycle Demo** (`wf-user-management-demo`).
3. Point out the configured steps to the professor:
   - **Step 1:** `Create User Record` (`POST /api/users`) -> Extracts `userId` from response body (`$.id`).
   - **Step 2:** `Verify Created User` (`GET /api/users/{{userId}}`) -> Depends on Step 1, interpolates `{{userId}}`.
   - **Step 3:** `Update User Record` (`PUT /api/users/{{userId}}`) -> Depends on Step 2.
   - **Step 4 (Teardown):** `Cleanup User Record` (`DELETE /api/users/{{userId}}`) -> Runs in cleanup phase.
4. Click **Execute Workflow**.
5. **Result:**
   - Visual progress indicators update step-by-step.
   - All steps complete with `PASSED` / `COMPLETED` badges.
   - Execution timeline shows actual start time, duration, and response codes.

---

### Feature 4: OpenAPI Import
*Demonstrates full OpenAPI 3.1 & Swagger 2.0 specification parsing, validation, and endpoint cataloging.*

1. In the sidebar, click **OpenAPI** (`/openapi`).
2. Click the quick button: **Load User Management Spec**.
   *(Alternatively, upload `demo/user-management-api.json` or `demo/user-management-api.yaml`)*.
3. Observe the parsed output:
   - Title: `User Management API`
   - Version: `1.0.0`
   - Endpoints: 5 operations (`GET /api/users`, `GET /api/users/{id}`, `POST /api/users`, `PUT /api/users/{id}`, `DELETE /api/users/{id}`).
   - Schema Catalog: `User`, `CreateUserInput`, `UpdateUserInput`, `ErrorResponse`.
4. Click any endpoint (e.g., `POST /api/users`) to inspect parameters, request body schemas, and response status codes.
5. Click **Load in Request Builder** on `GET /api/users/{id}` to demonstrate seamless cross-feature integration.

---

### Feature 5: Response Validation
*Demonstrates contract validation against status codes, response time thresholds, required fields, and JSON Schema rules.*

1. In the sidebar, click **Response Validation** (`/response-validation`).
2. **Positive Validation Test (Passing):**
   - Expected Status: `200`
   - Actual Status: `200`
   - Max Response Time: `500` ms
   - Actual Response Time: `45` ms
   - Schema / Body: Check `Required Fields` (`id`, `name`, `email`, `role`, `active`).
   - Click **Run Validation**.
   - **Result:** Overall status `PASSED` (green). All 5 assertions pass.
3. **Negative Validation Test (Failing Assertion):**
   - Change Expected Status to `201` or add required field `nonExistentField`.
   - Click **Run Validation**.
   - **Result:** Overall status `FAILED` (red). Clear failure details displaying expected vs actual values.

---

### Feature 6: Reports and Analytics
*Demonstrates real execution metric aggregation without mocked or hardcoded numbers.*

1. In the sidebar, click **Reports & Analytics** (`/reports`).
2. Notice the real metrics computed from your actual test runs:
   - **Total Requests Executed**
   - **Success vs Failed Counts**
   - **Success Rate Percentage**
   - **Average Response Time**
3. Review the **Execution History Log** at the bottom, which lists the exact timestamps, HTTP methods, and status codes of the requests executed during your demo.
4. Filter by status or date range to show dynamic client-side filtering.

---

### Feature 7: AI Test Generator
*Demonstrates automatic test synthesis for positive, negative, boundary, and security test cases from API specifications.*

1. In the sidebar, click **Test Generator** (`/test-generator`).
2. If the specification is not yet active, click **Load User Management Demo Spec**.
3. Select test categories:
   - ☑ Positive (Happy Path)
   - ☑ Negative (Bad Input / 400s)
   - ☑ Boundary (Max lengths, zero values)
   - ☑ Security (Unauthorized, injection protection)
4. Click **Generate Tests**.
5. **Result:** The system synthesizes tests for all endpoints with:
   - Test Name & Description
   - Target HTTP Method & Path
   - Headers, query parameters, and JSON body
   - Expected assertions (Status code, schema compliance)
6. Click **Execute Tests** to run the generated suite and watch real-time pass/fail execution results.

---

### Feature 8: API Documentation
*Demonstrates automated markdown API documentation generation from imported specifications.*

1. In the sidebar, click **Documentation** (`/documentation`).
2. If needed, click **Load User Management Demo Spec**.
3. Browse the generated documentation:
   - Formatted badges for `GET`, `POST`, `PUT`, `DELETE`.
   - Parameter tables showing types, locations, and descriptions.
   - Example request bodies and response schemas.
4. Use the search bar to filter by keyword (e.g. `users`) or method (e.g. `POST`).
5. Click **Download .md** to export a clean markdown documentation file.

---

### Feature 9: JSON Generator
*Demonstrates schema-driven deterministic JSON sample generation, JSON formatting, and payload validation.*

1. In the sidebar, click **JSON Generator** (`/json-generator`).
2. Click **Load User Management Schema**.
3. Select `User` from the **OpenAPI Schema** dropdown.
4. Click **Generate JSON**.
5. **Result:** A valid JSON payload conforming to the `User` schema is generated in the editor:
   ```json
   {
     "id": 101,
     "name": "Aarav Patil",
     "email": "aarav@example.com",
     "role": "student",
     "active": true
   }
   ```
6. Click **Format JSON** to validate indentation and syntax.
7. Click **Copy** or **Download .json** to export the file.

---

## 4. Troubleshooting & FAQ

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **"Could not reach the APIForge backend"** | Backend server is not running | Run `npm run dev:backend` in root. Check port 3001. |
| **Port 3001 already in use** | A dangling node process is occupying the port | Kill the process using port 3001 (`npx kill-port 3001` or Task Manager). |
| **"No specification imported" on AI pages** | Spec has not been parsed in the current browser session | Click the green **Load User Management Demo Spec** button present on the page. |
| **Browser cache holding old UI state** | Previous build cached in localStorage | Open DevTools -> Application -> Local Storage -> Clear, or click **Reset Workspace** in Settings. |
