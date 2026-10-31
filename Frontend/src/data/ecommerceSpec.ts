export const ECOMMERCE_SPEC_JSON = `{
  "openapi": "3.1.0",
  "info": {
    "title": "QuickCart E-Commerce API",
    "version": "1.0.0",
    "description": "Demonstration E-Commerce Store API for products, orders, cart checkout, and customer reviews."
  },
  "servers": [
    {
      "url": "http://localhost:3001/api/mock/serve",
      "description": "Local APIForge Mock Server"
    }
  ],
  "paths": {
    "/api/products": {
      "get": {
        "operationId": "getProducts",
        "summary": "List all products",
        "description": "Returns a catalog of available products with optional category filter.",
        "parameters": [
          {
            "name": "category",
            "in": "query",
            "required": false,
            "description": "Filter products by category",
            "schema": {
              "type": "string",
              "enum": ["electronics", "apparel", "books", "home"]
            },
            "example": "electronics"
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "description": "Maximum number of items to return",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 50,
              "default": 10
            },
            "example": 10
          }
        ],
        "responses": {
          "200": {
            "description": "Products catalog retrieved successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Product"
                  }
                },
                "example": [
                  {
                    "id": 201,
                    "title": "UltraBook Pro 15",
                    "price": 1299.99,
                    "category": "electronics",
                    "inStock": true,
                    "rating": 4.8
                  },
                  {
                    "id": 202,
                    "title": "Noise Cancelling Headphones",
                    "price": 199.5,
                    "category": "electronics",
                    "inStock": true,
                    "rating": 4.6
                  }
                ]
              }
            }
          }
        }
      },
      "post": {
        "operationId": "createProduct",
        "summary": "Create a new product",
        "description": "Adds a new product to the store inventory.",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateProductInput"
              },
              "example": {
                "title": "Wireless Gaming Mouse",
                "price": 59.99,
                "category": "electronics",
                "inStock": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Product created successfully",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Product"
                },
                "example": {
                  "id": 203,
                  "title": "Wireless Gaming Mouse",
                  "price": 59.99,
                  "category": "electronics",
                  "inStock": true,
                  "rating": 5.0
                }
              }
            }
          },
          "400": {
            "description": "Invalid product input"
          }
        }
      }
    },
    "/api/products/{id}": {
      "get": {
        "operationId": "getProductById",
        "summary": "Retrieve product by ID",
        "description": "Returns full details for a single product.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "Unique product ID",
            "schema": {
              "type": "integer"
            },
            "example": 201
          }
        ],
        "responses": {
          "200": {
            "description": "Product details retrieved",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Product"
                },
                "example": {
                  "id": 201,
                  "title": "UltraBook Pro 15",
                  "price": 1299.99,
                  "category": "electronics",
                  "inStock": true,
                  "rating": 4.8
                }
              }
            }
          },
          "404": {
            "description": "Product not found"
          }
        }
      }
    },
    "/api/orders": {
      "post": {
        "operationId": "createOrder",
        "summary": "Create a checkout order",
        "description": "Creates an order with items and customer details.",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateOrderInput"
              },
              "example": {
                "customerEmail": "customer@example.com",
                "items": [
                  {
                    "productId": 201,
                    "quantity": 1
                  }
                ],
                "shippingAddress": "123 Technology Park, Mumbai"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Order created successfully",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Order"
                },
                "example": {
                  "orderId": "ORD-9021",
                  "customerEmail": "customer@example.com",
                  "totalAmount": 1299.99,
                  "status": "confirmed",
                  "createdAt": "2026-10-28T10:00:00Z"
                }
              }
            }
          },
          "400": {
            "description": "Invalid order payload"
          }
        }
      }
    },
    "/api/orders/{id}": {
      "get": {
        "operationId": "getOrderById",
        "summary": "Retrieve order by ID",
        "description": "Retrieves order status and tracking details.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "Order reference code or ID",
            "schema": {
              "type": "string"
            },
            "example": "ORD-9021"
          }
        ],
        "responses": {
          "200": {
            "description": "Order status retrieved",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Order"
                },
                "example": {
                  "orderId": "ORD-9021",
                  "customerEmail": "customer@example.com",
                  "totalAmount": 1299.99,
                  "status": "confirmed",
                  "createdAt": "2026-10-28T10:00:00Z"
                }
              }
            }
          },
          "404": {
            "description": "Order not found"
          }
        }
      },
      "delete": {
        "operationId": "cancelOrder",
        "summary": "Cancel an order",
        "description": "Cancels an existing order by ID.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "Order reference code",
            "schema": {
              "type": "string"
            },
            "example": "ORD-9021"
          }
        ],
        "responses": {
          "200": {
            "description": "Order cancelled successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" }
                  }
                },
                "example": {
                  "success": true,
                  "message": "Order ORD-9021 cancelled successfully"
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "Product": {
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
      },
      "CreateProductInput": {
        "type": "object",
        "required": ["title", "price", "category"],
        "properties": {
          "title": { "type": "string", "minLength": 2, "example": "Wireless Gaming Mouse" },
          "price": { "type": "number", "minimum": 0.01, "example": 59.99 },
          "category": { "type": "string", "enum": ["electronics", "apparel", "books", "home"] },
          "inStock": { "type": "boolean", "default": true }
        }
      },
      "CreateOrderInput": {
        "type": "object",
        "required": ["customerEmail", "items"],
        "properties": {
          "customerEmail": { "type": "string", "format": "email", "example": "customer@example.com" },
          "items": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": ["productId", "quantity"],
              "properties": {
                "productId": { "type": "integer", "example": 201 },
                "quantity": { "type": "integer", "minimum": 1, "example": 1 }
              }
            }
          },
          "shippingAddress": { "type": "string", "example": "123 Technology Park, Mumbai" }
        }
      },
      "Order": {
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
    }
  }
}`;

