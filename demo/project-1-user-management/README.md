# Demo Project 1: User Management API (OAS 3.1 & Swagger 2.0)

## Overview
**Project 1: User Management API** is the primary academic reference project designed for complete end-to-end evaluation of APIForge's 9 core features. It centers around university student/faculty records and features the canonical record **`Aarav Patil` (User ID: 101)**.

---

## Directory Contents

| File | Format | Purpose |
| :--- | :--- | :--- |
| `user-management-api.json` | OpenAPI 3.1 (JSON) | Primary specification with 5 CRUD operations and schema definitions |
| `user-management-api.yaml` | OpenAPI 3.1 (YAML) | YAML equivalent for testing YAML multi-format parser |
| `swagger2-user-api.json` | Swagger 2.0 (JSON) | Backward-compatibility test spec verifying Swagger 2.0 upgrades |
| `user-management-workflow.json` | APIForge Workflow Scenario | 4-step chained workflow (Create -> Fetch -> Update -> Teardown Delete) |
| `payload-create-user.json` | JSON Request Body | POST payload creating Aarav Patil (`role: student`, `active: true`) |
| `payload-update-user.json` | JSON Request Body | PUT payload updating profile status and email |

---

## Logical Endpoints & Schema Contracts

| Method | Endpoint Path | Mock Server Route | Success Status | Description |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/users` | `GET http://localhost:3001/api/mock/serve/api/users` | `200 OK` | Retrieves directory of all users |
| **GET** | `/api/users/{id}` | `GET http://localhost:3001/api/mock/serve/api/users/:id` | `200 OK` | Retrieves user profile by ID (`101` -> Aarav Patil) |
| **POST** | `/api/users` | `POST http://localhost:3001/api/mock/serve/api/users` | `201 Created` | Creates a new user record |
| **PUT** | `/api/users/{id}` | `PUT http://localhost:3001/api/mock/serve/api/users/:id` | `200 OK` | Updates existing user profile |
| **DELETE** | `/api/users/{id}` | `DELETE http://localhost:3001/api/mock/serve/api/users/:id` | `200 OK` | Deletes user (cleanup step) |

### Core Schema (`User`)
```json
{
  "type": "object",
  "required": ["id", "name", "email", "role", "active"],
  "properties": {
    "id": { "type": "integer", "example": 101 },
    "name": { "type": "string", "example": "Aarav Patil" },
    "email": { "type": "string", "format": "email", "example": "aarav@example.com" },
    "role": { "type": "string", "enum": ["admin", "student", "faculty"], "example": "student" },
    "active": { "type": "boolean", "example": true }
  }
}
```

---

## 4-Step Orchestrated Workflow (`user-management-workflow.json`)

1. **Step 1: Create User (POST)**  
   - URL: `http://localhost:3001/api/mock/serve/api/users`
   - Body: `payload-create-user.json`
   - Extractor: Extracts `$.id` into `{{userId}}` (defaults to `101`) and `$.name` into `{{userName}}`.
2. **Step 2: Retrieve User (GET)**  
   - URL: `http://localhost:3001/api/mock/serve/api/users/{{userId}}`
   - Depends On: Step 1.
3. **Step 3: Update Profile (PUT)**  
   - URL: `http://localhost:3001/api/mock/serve/api/users/{{userId}}`
   - Body: `payload-update-user.json`
   - Depends On: Step 2.
4. **Step 4: Teardown Cleanup (DELETE)**  
   - URL: `http://localhost:3001/api/mock/serve/api/users/{{userId}}`
   - Tag: `isTeardown: true` (Runs guaranteed cleanup upon scenario termination).

---

## How to Test in APIForge

- **OpenAPI Studio (`/openapi`):** Click **Load User Management Spec**.
- **Response Validation (`/response-validation`):** Click **Load User Management Demo Suite** or **Validate All Executed Tests**.
- **Workflows (`/workflows`):** Click **User Demo** in the top scenario toolbar and click **Run Workflow**.
- **Collections (`/collections`):** Click **+ User API Demo**.
- **Master Command:** Run `npm run test:faculty` in terminal for instant 9-feature green verification!

