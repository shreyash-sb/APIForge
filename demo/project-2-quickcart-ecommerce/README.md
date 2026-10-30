# Demo Project 2: QuickCart E-Commerce Store API (OAS 3.1)

## Overview
**Project 2: QuickCart E-Commerce Store API** is a complete, production-style e-commerce microservice specification modeling product catalog exploration, real-time inventory management, checkout ordering, order tracking, and order cancellations.

---

## Directory Contents

| File | Format | Purpose |
| :--- | :--- | :--- |
| `ecommerce-store-api.json` | OpenAPI 3.1 (JSON) | Complete specification with products, orders, categories, and inventory contracts |
| `ecommerce-store-api.yaml` | OpenAPI 3.1 (YAML) | YAML representation of the store specification |
| `ecommerce-checkout-workflow.json` | APIForge Workflow Scenario | 4-step e-commerce pipeline (Catalog Search -> Place Order -> Track Order -> Cancel Order) |
| `payload-create-product.json` | JSON Request Body | POST payload adding new product to inventory |
| `payload-create-order.json` | JSON Request Body | POST payload placing an order (`productId: 201`, `customerEmail: customer@example.com`) |

---

## Logical Endpoints & Mock Routing

| Method | Endpoint Path | Mock Server Route | Status | Description |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/products` | `http://localhost:3001/api/mock/serve/api/products` | `200 OK` | Catalog browsing with category & limit query filters |
| **GET** | `/api/products/{id}` | `http://localhost:3001/api/mock/serve/api/products/:id` | `200 OK` | Single product detail (`id: 201` -> UltraBook Pro 15) |
| **POST** | `/api/products` | `http://localhost:3001/api/mock/serve/api/products` | `201 Created` | Create new product record |
| **PUT** | `/api/products/{id}` | `http://localhost:3001/api/mock/serve/api/products/:id` | `200 OK` | Update price and inventory stock |
| **POST** | `/api/orders` | `http://localhost:3001/api/mock/serve/api/orders` | `201 Created` | Checkout order creation |
| **GET** | `/api/orders/{id}` | `http://localhost:3001/api/mock/serve/api/orders/:id` | `200 OK` | Order tracking by reference code (`ORD-9021`) |
| **DELETE** | `/api/orders/{id}` | `http://localhost:3001/api/mock/serve/api/orders/:id` | `200 OK` | Order cancellation cleanup step |

### Core Schemas

#### 1. `Product`
```json
{
  "type": "object",
  "required": ["id", "title", "price", "category", "inStock"],
  "properties": {
    "id": { "type": "integer", "example": 201 },
    "title": { "type": "string", "example": "UltraBook Pro 15" },
    "price": { "type": "number", "minimum": 0, "example": 1299.99 },
    "category": { "type": "string", "enum": ["electronics", "apparel", "books", "home"] },
    "inStock": { "type": "boolean", "example": true },
    "rating": { "type": "number", "minimum": 0, "maximum": 5, "example": 4.8 }
  }
}
```

#### 2. `Order`
```json
{
  "type": "object",
  "required": ["orderId", "customerEmail", "totalAmount", "status"],
  "properties": {
    "orderId": { "type": "string", "example": "ORD-9021" },
    "customerEmail": { "type": "string", "format": "email", "example": "customer@example.com" },
    "totalAmount": { "type": "number", "example": 1299.99 },
    "status": { "type": "string", "enum": ["pending", "confirmed", "shipped", "cancelled"] },
    "createdAt": { "type": "string", "format": "date-time", "example": "2026-10-28T10:00:00Z" }
  }
}
```

---

## 4-Step E-Commerce Workflow (`ecommerce-checkout-workflow.json`)

1. **Step 1: Browse Electronics Catalog (GET)**
   - URL: `http://localhost:3001/api/mock/serve/api/products?category=electronics&limit=10`
   - Extractor: JSONPath `$[0].id` -> `{{featuredProductId}}` (resolves to `201`).
2. **Step 2: Place Customer Order (POST)**
   - URL: `http://localhost:3001/api/mock/serve/api/orders`
   - Body: `payload-create-order.json`
   - Depends On: Step 1.
   - Extractor: Extracts `$.orderId` -> `{{activeOrderId}}` (`ORD-9021`) and `$.status` -> `{{orderStatus}}` (`confirmed`).
3. **Step 3: Track Order Details (GET)**
   - URL: `http://localhost:3001/api/mock/serve/api/orders/{{activeOrderId}}`
   - Depends On: Step 2.
4. **Step 4: Order Cancellation Teardown (DELETE)**
   - URL: `http://localhost:3001/api/mock/serve/api/orders/{{activeOrderId}}`
   - Tag: `isTeardown: true` (Guaranteed cancellation cleanup).

---

## How to Test in APIForge

- **OpenAPI Studio (`/openapi`):** Click **Load QuickCart E-Commerce Spec**.
- **Response Validation (`/response-validation`):** Click **QuickCart Demo** or **Load QuickCart Demo Suite** to synthesize and validate contract assertions.
- **Workflows (`/workflows`):** Click **QuickCart Demo** in the scenario toolbar and click **Run Workflow**.
- **Collections (`/collections`):** Click **+ QuickCart Demo** to load the complete CRUD suite.

