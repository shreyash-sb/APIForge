# 🚀 APIForge Live Demo Master Guide

Welcome to the **APIForge Demonstration Pack**! This folder contains all the sample files, specs, collections, workflows, and payloads needed to give a **100% complete, flawless live demonstration of all 9 core features** of APIForge to your professor or evaluator.

---

## 📁 What's in this `demo/` Folder?

| File Name | Format | Description / Purpose |
| :--- | :--- | :--- |
| **`ecommerce-store-api.json`** | OpenAPI 3.1 (JSON) | Complete E-Commerce Store API (Products, Categories, Orders, Checkout). |
| **`ecommerce-store-api.yaml`** | OpenAPI 3.1 (YAML) | YAML version of the QuickCart E-Commerce specification. |
| **`ecommerce-checkout-workflow.json`** | Workflow (JSON) | 4-step chained checkout scenario with runtime variable extraction. |
| **`user-management-api.json`** | OpenAPI 3.1 (JSON) | University User Management API (Aarav Patil student record). |
| **`user-management-api.yaml`** | OpenAPI 3.1 (YAML) | YAML version of the User Management specification. |
| **`swagger2-user-api.json`** | Swagger 2.0 (JSON) | Legacy Swagger 2.0 specification to prove multi-format compatibility. |
| **`user-management-workflow.json`** | Workflow (JSON) | 4-step CRUD lifecycle workflow (Create $\to$ Get $\to$ Update $\to$ Delete). |
| **`apiforge-postman-collection.json`**| Postman v2.1 | Pre-configured collection of requests for Collections/Workspace testing. |
| **`environments-demo.json`** | Environment Variables | Profiles for Local Mock (`http://localhost:3001/api/mock/serve`), Staging, and Production. |
| **`payload-create-product.json`** | JSON Payload | Ready to paste for `POST /api/products`. |
| **`payload-create-order.json`** | JSON Payload | Ready to paste for `POST /api/orders`. |
| **`payload-create-user.json`** | JSON Payload | Ready to paste for `POST /api/users`. |
| **`payload-update-user.json`** | JSON Payload | Ready to paste for `PUT /api/users/101`. |

---

## ⚡ Pre-Demo Quick Check (2 Minutes)

Before you begin your presentation, start both servers in separate terminals:

1. **Backend Server** (Terminal 1):
   ```bash
   cd Backend
   npm run dev
   ```
   *Runs on `http://localhost:3001` with built-in Mock Engine.*

2. **Frontend UI** (Terminal 2):
   ```bash
   cd Frontend
   npm run dev
   ```
   *Runs on `http://localhost:5173`.*

> **Mock Server Base URL**: All demo routes are pre-configured to run against `http://localhost:3001/api/mock/serve`, meaning **all tests work immediately offline without any external network dependency**.

---

## 🎯 Step-by-Step Walkthrough: Presenting All 9 Features

Follow this exact order during your presentation for maximum impact:

---

### Feature 1: OpenAPI & Swagger Import
**Page to open**: `OpenAPI Import` (Sidebar)

1. Click **"Choose File"** or drag-and-drop:
   - Select `demo/ecommerce-store-api.json` (or `ecommerce-store-api.yaml`).
2. Point out that APIForge immediately parses:
   - Title: **QuickCart E-Commerce Store API**
   - Version: **v2.4.0**
   - Endpoints: `GET /api/products`, `POST /api/products`, `POST /api/orders`, `GET /api/orders/{id}`, etc.
   - Schemas: `Product`, `CreateOrderInput`, `OrderResult`, etc.
3. **Bonus Proof of Versatility**:
   - Click "Clear" and load `demo/swagger2-user-api.json`.
   - Explain to the professor: *"APIForge supports modern OpenAPI 3.1 as well as legacy Swagger 2.0 specs."*
4. Click **"Test in Request Builder"** on any endpoint to show seamless transition!

---

### Feature 2: Interactive API Documentation
**Page to open**: `Documentation` (Sidebar)

1. Select the imported project from the dropdown (or paste/upload `demo/ecommerce-store-api.json`).
2. Show the generated interactive documentation:
   - Request parameter tables.
   - Request body schemas with data types.
   - Response status codes (`200 OK`, `201 Created`, `400 Bad Request`).
   - Auto-generated code snippets in **cURL**, **JavaScript**, and **Python**.
3. Mention: *"Developers don't need external tools like Swagger UI; documentation is generated right inside APIForge."*

---

### Feature 3: Smart JSON Generator
**Page to open**: `JSON Generator` (Sidebar)

1. Select a Schema Template or paste a sample structure.
2. Under "Select Schema Template", choose **User Profile** or **E-Commerce Order**.
3. Click **"Generate Mock Data"**:
   - APIForge synthesizes realistic names, emails, timestamps, and UUIDs that conform strictly to the schema types.
4. Click **"Copy JSON"** to show how easy it is to feed test data into requests.

---

### Feature 4: Live Mock Server
**Page to open**: `Mock Server` (Sidebar)

1. Show the pre-seeded active mock routes:
   - `/api/users` (User Management)
   - `/api/products` (E-Commerce Products)
   - `/api/orders` (E-Commerce Orders)
2. Click the **"Test"** button next to `GET /api/products` or `GET /api/users`:
   - It fires a real HTTP request to `http://localhost:3001/api/mock/serve/api/products`.
   - Returns `200 OK` with genuine product catalog data in `< 10ms`.
3. Open the **"Live Request Logs"** tab:
   - Show the real-time log capturing the method, path, response status, and execution latency.

---

### Feature 5: Request Builder (Full HTTP Methods)
**Page to open**: `Request Builder` (Sidebar)

Demonstrate creating and executing different HTTP methods:

#### Demo A: `GET` Request
- **Method**: `GET`
- **URL**: `http://localhost:3001/api/mock/serve/api/products`
- Click **"Send Request"**.
- Result: Status `200 OK`, response body displays list of electronic items.

#### Demo B: `POST` Request
- **Method**: `POST`
- **URL**: `http://localhost:3001/api/mock/serve/api/orders`
- **Headers**: `Content-Type: application/json`
- **Body**: Open `demo/payload-create-order.json` and paste its content:
  ```json
  {
    "productId": "prod-101",
    "quantity": 2,
    "shippingAddress": "42 Tech Boulevard, Pune, MH",
    "paymentMethod": "UPI"
  }
  ```
- Click **"Send Request"**.
- Result: Status `201 Created`, returns `orderId: "ord-88392"`, `status: "confirmed"`.

#### Demo C: `PUT` / `DELETE` Requests
- Point out support for `PUT`, `PATCH`, and `DELETE` with URL parameter substitution.

---

### Feature 5B: API Collections & Suites
**Page to open**: `Collections` (Sidebar)

1. **1-Click Demo Suite Creation**:
   - Click **"+ QuickCart Demo"**: Instantly creates the **QuickCart E-Commerce Store** collection with 5 complete endpoints covering `GET` products, `GET` product by ID, `POST` order with UPI payload, `PUT` stock update, and `DELETE` cancel order!
   - Or click **"+ User API Demo"** to create the University User Management suite.
2. **Import External Collections**:
   - Click **"Import File"** $\to$ Select `demo/apiforge-postman-collection.json`.
   - APIForge parses the Postman 2.1 JSON and automatically populates all request methods, URLs, headers, and payloads!
3. **Cross-Feature Interoperability**:
   - Next to any request in the collection, click:
     - **"Request"**: Loads that exact request directly into the Request Builder.
     - **"Validate"**: Loads that request into Response Validation.
     - **"Mock"**: Jumps to the Mock Server.
   - At the top of the collection, click **"Run in Workflows"** to convert the entire collection into a chained execution workflow, or **"Export OAS 3.1"** to export as a full OpenAPI spec!

---

### Feature 6: Multi-Step Workflows (Chained Execution)
**Page to open**: `Workflows` (Sidebar)

1. Click the **"Import JSON"** button in the header toolbar.
2. Select `demo/ecommerce-checkout-workflow.json` (or `demo/user-management-workflow.json`).
3. Walk the professor through the steps:
   - **Step 1**: `GET /api/products` $\to$ Checks inventory.
   - **Step 2**: `POST /api/orders` $\to$ Creates an order.
   - **Step 3 (Variable Extraction)**: Extracts `$.orderId` into `{{orderId}}` and passes it to `GET /api/orders/{{orderId}}`.
   - **Step 4**: Cancel / Teardown cleanup.
4. Click **"Run Workflow"**:
   - Watch all 4 steps execute sequentially with real-time green checkmarks.
   - Show the extracted context variables table.

---

### Feature 7: AI Test Suite Generator
**Page to open**: `AI Test Generator` (Sidebar)

1. Select the specification: `demo/ecommerce-store-api.json` or `demo/user-management-api.json`.
2. Select target endpoint: `POST /api/orders` or `POST /api/users`.
3. Click **"Generate Test Cases"**:
   - APIForge automatically synthesizes:
     - **Happy Path**: Valid order creation with status `201`.
     - **Negative Testing**: Missing required fields with status `400`.
     - **Boundary Testing**: Maximum quantity limits and invalid payment methods.
4. Click **"Export Test Suite"** or **"Send to Validation"**.

---

### Feature 8: Automated Response Validation
**Page to open**: `Response Validation` (Sidebar)

1. Show the test cases loaded from the imported API.
2. Click **"Execute & Validate"**:
   - APIForge sends real requests to the target URL.
   - Validates **Status Code** (matches `200` or `201`).
   - Validates **Response Time** (under SLA threshold, e.g., `< 500ms`).
   - Validates **JSON Schema & Headers** against the contract.
3. Show the green passing badges and detailed assertions report.

---

### Feature 9: Reports & Analytics
**Page to open**: `Reports & Analytics` (Sidebar)

1. Show the interactive dashboard:
   - **Overall Pass Rate**: Displays 100% or current health percentage.
   - **Average Response Latency**: Response time breakdown chart.
   - **Status Code Distribution**: Pie/bar chart of `2xx`, `4xx`, `5xx` responses.
2. Click **"Export Report"** (PDF / JSON) to show ready-to-share compliance and QA summaries.

---

## 🏆 Summary of Features Ready to Demo

| # | Feature Name | Tested & Verified | Ready File in `demo/` |
|---|:---|:---:|:---|
| 1 | **OpenAPI Import** | ✅ | `ecommerce-store-api.json`, `swagger2-user-api.json` |
| 2 | **API Documentation** | ✅ | Auto-rendered from imported spec |
| 3 | **JSON Generator** | ✅ | Templates for User, Order, Product |
| 4 | **Mock Server** | ✅ | Pre-seeded with Products, Orders, Users |
| 5 | **Request Builder** | ✅ | `payload-create-order.json`, `payload-create-user.json` |
| 6 | **Workflows** | ✅ | `ecommerce-checkout-workflow.json`, `user-management-workflow.json` |
| 7 | **AI Test Generator** | ✅ | Analyzes imported OpenAPI schemas |
| 8 | **Response Validation** | ✅ | Real-time schema and status assertion |
| 9 | **Reports & Analytics** | ✅ | Comprehensive charts & audit reports |

Good luck with your presentation! 🎉
