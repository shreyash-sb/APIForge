# APIForge 🚀
### Autonomous AI-Powered API Engineering Platform

[![Backend Tests](https://img.shields.io/badge/Backend%20Tests-311%20Passed-emerald.svg)](file:///d:/5-coding/5-SEM%205%20-MINI%20Project/APIForge/Backend)
[![Frontend Tests](https://img.shields.io/badge/Frontend%20Tests-85%20Passed-blue.svg)](file:///d:/5-coding/5-SEM%205%20-MINI%20Project/APIForge/Frontend)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933.svg)](https://nodejs.org/)

---

## 📌 What is APIForge?

**APIForge** is an agentic platform designed to streamline the entire REST API lifecycle. Instead of just chatting, its built-in **AI Agent plans and executes real operations** — inspecting endpoints, generating tests, validating schemas, spinning up mock servers, and diagnosing failures — with built-in **Human Approval** safeguards for sensitive network tasks.

---

## ✨ Core Features

* 🤖 **Autonomous AI Agent**: Executes multi-step API operations using 10 real backend tools with Human-in-the-Loop approval gating.
* ⚡ **Interactive Request Builder**: Test any REST endpoint with custom headers, query params, auth, and live response inspection.
* 📄 **OpenAPI 3.1 & Test Generator**: Import Swagger/OpenAPI specs to auto-generate positive, negative, and edge-case test suites.
* 🔄 **Multi-Step Workflows**: Chain dependent API requests with automatic variable extraction and cleanup teardowns.
* 🛠️ **Dynamic Mock Server**: Create instant mock routes with custom status codes, JSON responses, and simulated latency.
* 📊 **Telemetry & Health**: Real-time pass/fail rates, latency charts, failure diagnosis, and live backend health checks.

---

## 💻 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, TailwindCSS, Zustand, Lucide Icons |
| **Backend** | Node.js, Express, TypeScript, Axios, Ajv (Schema Validator) |
| **Testing** | Vitest (Frontend: 85 tests), Jest + Supertest (Backend: 311 tests) |
| **AI & Storage** | Google Gemini (gemini-2.5-flash), MongoDB Atlas (optional) |

---

## 🚀 Quick Start (Run Locally)

### 1. Install Dependencies
```bash
npm install
npm install --prefix Backend
npm install --prefix Frontend
```

### 2. Start Full Application
```bash
npm run dev
```
* **Frontend Web App**: [http://localhost:5173](http://localhost:5173)
* **Backend API Server**: [http://localhost:3001](http://localhost:3001) (Health: `/health`)

---

## 🧪 Running Tests

APIForge includes complete test coverage that runs without external services:

```bash
# Run all tests (Backend + Frontend)
npm run test:all

# Run individual suites
npm run test:backend    # 311 unit & integration tests
npm run test:frontend   # 85 Vitest component tests
```

---

## 🔑 Environment Configuration

APIForge works out-of-the-box in local mock mode. To connect real cloud services, configure `Backend/.env`:

```ini
# Server Port
PORT=3001

# Google Gemini AI Key (Get free key from https://aistudio.google.com/)
AI_PROVIDER=google-gemini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# MongoDB Atlas (Optional - in-memory storage used if omitted)
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/apiforge

# JWT Secret for Auth
JWT_SECRET=your_random_secret_key_here
```

---

## 📂 Project Structure

```
APIForge/
├── Backend/                 # Express + TypeScript Server & Agent Engine
│   ├── src/
│   │   ├── controllers/     # API route handlers
│   │   ├── services/        # Agent orchestrator, mock server, test generator
│   │   └── index.ts         # Server entrypoint
│   └── test/                # 311 automated tests
│
├── Frontend/                # React 19 + Vite Single Page Application
│   ├── src/
│   │   ├── components/      # Common UI, dashboard widgets, layout
│   │   ├── pages/           # Dashboard, Request Builder, OpenAPI, Workflows, AI
│   │   └── store/           # Zustand application state
│   └── dist/                # Production build
│
├── package.json             # Root monorepo scripts
└── README.md                # Project documentation
```
