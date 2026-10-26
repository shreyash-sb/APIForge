# APIForge 🚀
> **Autonomous AI-Powered API Engineering Platform**

[![Tests](https://img.shields.io/badge/Tests-All%20Passing-emerald.svg)](https://github.com/shreyash-sb/APIForge)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933.svg)](https://nodejs.org/)

APIForge is a modern developer platform that unifies the entire REST API lifecycle — from interactive request building and OpenAPI test generation to multi-step workflow execution and autonomous AI-assisted API diagnostics.

---

### ⚡ Highlights

- 🤖 **Autonomous AI Agent**: Plans and executes API tasks with Human-in-the-Loop approval safeguards.
- 🛠️ **Request Builder & History**: Test endpoints with live response inspection, auth headers, and execution history.
- 📄 **OpenAPI 3.1 & Test Generator**: Import Swagger/OAS to generate positive, negative, and edge-case test suites.
- 🔄 **Chained Workflows**: Run dependent requests with automatic runtime variable extraction.
- 🎭 **Dynamic Mock Server**: Spin up instant mock routes with configurable status codes and response bodies.
- 📊 **Telemetry & Health**: Real-time pass/fail rates, latency charts, and backend health monitoring.

---

### 🚀 Quick Start

```bash
# 1. Install all dependencies
npm install
npm install --prefix Backend && npm install --prefix Frontend

# 2. Start Frontend & Backend
npm run dev
```

- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:3001](http://localhost:3001) (`/health`)

---

### 🧪 Running Tests

```bash
npm run test:all       # Run all Frontend & Backend test suites
npm run test:frontend  # Frontend component & integration tests (Vitest)
npm run test:backend   # Backend service & controller tests (Jest)
```

---

### 💻 Tech Stack

- **Frontend**: React 19, TypeScript, Vite, TailwindCSS, Zustand, Lucide Icons
- **Backend**: Node.js, Express, TypeScript, Axios, Ajv
- **Testing**: Vitest, Jest, Supertest
