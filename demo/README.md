# 🚀 APIForge Demo Suite: 2 Separate Demonstration Projects

Welcome to the **APIForge Demonstration Pack**! This folder is organized into **two completely separate, production-ready demo projects** designed for academic evaluation, live demonstrations, and feature comparisons against legacy tools like Postman:

1. **`project-1-user-management/`**: Integrated University User Management API (OAS 3.1 & Swagger 2.0) featuring `Aarav Patil` (User ID: 101).
2. **`project-2-quickcart-ecommerce/`**: QuickCart E-Commerce Store API (OAS 3.1) featuring Catalog Browsing, Real-time Orders, and Checkout Tracking.

Both projects are backed by APIForge's built-in **Ephemeral Mock Server Engine (`http://localhost:3001/api/mock/serve`)**, requiring zero external cloud dependencies or third-party APIs.

---

## 📁 Repository Structure & Project Separation

```
demo/
├── project-1-user-management/          # 📦 PROJECT 1: USER MANAGEMENT API
│   ├── README.md                       # Comprehensive Project 1 documentation
│   ├── user-management-api.json        # OpenAPI 3.1 Specification (JSON)
│   ├── user-management-api.yaml        # OpenAPI 3.1 Specification (YAML)
│   ├── swagger2-user-api.json          # Legacy Swagger 2.0 backward compatibility spec
│   ├── user-management-workflow.json   # 4-step chained CRUD workflow scenario
│   ├── payload-create-user.json        # Sample POST request payload (Aarav Patil)
│   ├── payload-update-user.json        # Sample PUT request payload
│   ├── postman-collection-users.json   # Exported Postman collection for Project 1
│   └── environments-demo.json          # Local mock & cloud environment configuration
│
├── project-2-quickcart-ecommerce/      # 📦 PROJECT 2: QUICKCART E-COMMERCE API
│   ├── README.md                       # Comprehensive Project 2 documentation
│   ├── ecommerce-store-api.json        # OpenAPI 3.1 Specification (JSON)
│   ├── ecommerce-store-api.yaml        # OpenAPI 3.1 Specification (YAML)
│   ├── ecommerce-checkout-workflow.json# 4-step automated order & checkout workflow
│   ├── payload-create-product.json     # Sample POST product payload
│   ├── payload-create-order.json       # Sample POST order payload
│   ├── postman-collection-ecommerce.json # Exported Postman collection for Project 2
│   └── environments-demo.json          # Local mock & cloud environment configuration
│
└── README.md                           # Master demo and comparison guide
```

---

## 🎯 Quick Comparison of the 2 Demo Projects

| Feature / Dimension | Project 1: User Management API | Project 2: QuickCart E-Commerce Store |
| :--- | :--- | :--- |
| **Directory** | `demo/project-1-user-management/` | `demo/project-2-quickcart-ecommerce/` |
| **Domain** | University Student / Faculty Identity | Retail & E-Commerce Order Fulfillment |
| **Canonical Entity** | User (`id: 101`, `name: "Aarav Patil"`) | Product (`id: 201`, `title: "UltraBook Pro 15"`) & Order (`ORD-9021`) |
| **OpenAPI Version** | OpenAPI 3.1 & Swagger 2.0 | OpenAPI 3.1 |
| **Mock Base URL** | `http://localhost:3001/api/mock/serve/api/users` | `http://localhost:3001/api/mock/serve/api/products` & `.../api/orders` |
| **Operations** | `GET /`, `GET /{id}`, `POST /`, `PUT /{id}`, `DELETE /{id}` | `GET /products`, `GET /products/{id}`, `POST /products`, `POST /orders`, `GET /orders/{id}`, `DELETE /orders/{id}` |
| **Workflow Scenario** | User Lifecycle (Create $\to$ Get $\to$ Update $\to$ Teardown Delete) | Order Checkout (Search Catalog $\to$ Place Order $\to$ Track Status $\to$ Cancel Teardown) |
| **UI 1-Click Loaders** | Available across OpenAPI, Workflows, Response Validation & Collections | Available across OpenAPI, Workflows, Response Validation & Collections |

---

## ⚡ Step-by-Step Testing Guide

### 1. Start Both Servers (2 Terminals)
```bash
# Terminal 1 — Backend (Port 3001):
npm run dev:backend

# Terminal 2 — Frontend (Port 5173):
npm run dev:frontend
```
Open **`http://localhost:5173`** in your browser.

---

### 2. Testing Project 1: User Management API
1. **OpenAPI Studio (`/openapi`):** Click **Load User Management Spec**. Inspect the 5 operations and JSON Schema contracts.
2. **Workflows (`/workflows`):** Click **User Demo** in the top bar. Inspect the 4 sequential steps with runtime variable extraction (`{{userId}}` from `$.id`), then click **Run Workflow**. Watch all 4 steps turn green with actual execution metrics.
3. **Response Validation (`/response-validation`):** Click **User Demo** or **Load User Management Demo Suite**. In under a second, tests are executed and validated against OpenAPI schemas with green status code, header, and contract assertions.
4. **Collections (`/collections`):** Click **+ User API Demo** to load the pre-configured request collection.

---

### 3. Testing Project 2: QuickCart E-Commerce Store
1. **OpenAPI Studio (`/openapi`):** Click **Load QuickCart E-Commerce Spec**. Inspect `Product`, `CreateOrderInput`, and `Order` schemas.
2. **Workflows (`/workflows`):** Click **QuickCart Demo** in the top bar. Inspect the 4-step e-commerce pipeline (Catalog Search $\to$ Place Order $\to$ Track Status $\to$ Teardown Cancel), then click **Run Workflow**.
3. **Response Validation (`/response-validation`):** Click **QuickCart Demo** or **Load QuickCart Demo Suite** to synthesize and validate contract assertions across product and order endpoints.
4. **Collections (`/collections`):** Click **+ QuickCart Demo** to load complete catalog and order requests.

---

### 4. Live Faculty Master Command
```bash
npm run test:faculty
```
*Executes all 9 features against Aarav Patil's User Management API and prints green checkmarks for all 9 modules in under 1 second!*
