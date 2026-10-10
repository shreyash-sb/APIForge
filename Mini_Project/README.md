# APIForge - Phase 2 Complete

## Overview

APIForge is an API development and intelligent API testing platform. Phase 2 implements the complete Request Builder with backend execution engine.

## Project Structure

```
Mini_Project/
├── Frontend/              # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── pages/        # Page components
│   │   ├── services/     # API services
│   │   ├── types/        # TypeScript types
│   │   └── ...
│   ├── package.json
│   └── vite.config.ts
│
└── Backend/              # Node.js + Express + TypeScript
    ├── src/
    │   ├── controllers/  # Request controllers
    │   ├── routes/       # API routes
    │   ├── services/     # Business logic
    │   ├── types/        # TypeScript types
    │   ├── middleware/   # Express middleware
    │   └── index.ts      # Server entry point
    ├── package.json
    └── tsconfig.json
```

## Features Implemented

### Request Builder UI
- ✅ HTTP method selector (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- ✅ URL input with validation
- ✅ Query parameters (add, edit, remove, enable/disable)
- ✅ Custom headers (add, edit, remove, enable/disable)
- ✅ Authentication support:
  - No Auth
  - Bearer Token
  - API Key (header or query parameter)
  - Basic Auth
- ✅ JSON body editor with validation
- ✅ Send button with loading state

### Response Viewer
- ✅ HTTP status display with color coding
- ✅ Response time in milliseconds
- ✅ Response size
- ✅ Response body (formatted JSON)
- ✅ Response headers viewer
- ✅ Tabbed interface (Body/Headers)

### Backend API
- ✅ POST `/api/requests/execute` endpoint
- ✅ Request execution service
- ✅ Full HTTP method support
- ✅ Query parameter handling
- ✅ Custom headers support
- ✅ Authentication injection (Bearer, API Key, Basic)
- ✅ 30-second timeout
- ✅ Comprehensive error handling
- ✅ CORS enabled for development

### Error Handling
- ✅ Invalid URL validation
- ✅ JSON body validation
- ✅ Network errors (DNS, connection refused, timeout)
- ✅ HTTP error responses (4xx, 5xx)
- ✅ SSL/TLS errors
- ✅ Timeout errors
- ✅ User-friendly error messages

## Setup Instructions

### Prerequisites
- Node.js (v18 or higher)
- npm

### Backend Setup

1. Navigate to backend directory:
```bash
cd Backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

4. Start the development server:
```bash
npm run dev
```

Backend will run on `http://localhost:3001`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd Frontend
```

2. Install dependencies (if not already installed):
```bash
npm install
```

3. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

4. Start the development server:
```bash
npm run dev
```

Frontend will run on `http://localhost:5173`

### Running Both Servers

Open two terminal windows:

**Terminal 1 (Backend):**
```bash
cd Backend
npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd Frontend
npm run dev
```

## Usage

1. Open your browser to `http://localhost:5173`
2. Navigate to "Request Builder" from the sidebar
3. Configure your API request:
   - Select HTTP method
   - Enter URL
   - Add query parameters (optional)
   - Add headers (optional)
   - Configure authentication (optional)
   - Add request body for POST/PUT/PATCH (optional)
4. Click "Send"
5. View the response

## Test Results

All 10 required tests passed:

✅ **TEST 1**: GET request - Single user fetch (200 OK)
✅ **TEST 2**: GET request - Collection fetch (200 OK, 10 items)
✅ **TEST 3**: POST request - JSON body (201 Created)
✅ **TEST 4**: 404 handling - Invalid endpoint (404 Not Found)
✅ **TEST 5**: Malformed JSON - Validation error before sending
✅ **TEST 6**: Invalid URL - Validation error
✅ **TEST 7**: Timeout - Proper timeout error
✅ **TEST 8**: Custom headers - Headers sent correctly
✅ **TEST 9**: Bearer authentication - Authorization header added
✅ **TEST 10**: Query parameters - Properly encoded

Additional tests passed:
✅ PUT request (200 OK)
✅ PATCH request (200 OK)
✅ DELETE request (200 OK)
✅ Basic authentication
✅ API Key authentication

## API Documentation

### POST /api/requests/execute

Execute an API request through the backend proxy.

**Request Body:**
```json
{
  "method": "GET",
  "url": "https://api.example.com/users",
  "queryParams": [
    {"key": "page", "value": "1", "enabled": true}
  ],
  "headers": [
    {"key": "Content-Type", "value": "application/json", "enabled": true}
  ],
  "body": null,
  "auth": {
    "type": "bearer",
    "token": "your-token-here"
  }
}
```

**Success Response:**
```json
{
  "success": true,
  "status": 200,
  "statusText": "OK",
  "responseTime": 184,
  "headers": {
    "content-type": "application/json"
  },
  "body": {},
  "size": 1234
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "type": "NETWORK_ERROR",
    "message": "Connection refused",
    "details": "..."
  }
}
```

## Security Notes

- Only HTTP and HTTPS protocols are allowed
- URLs are validated server-side
- Authentication credentials are not logged
- Request body size limited to 10MB
- 30-second timeout prevents hanging requests
- CORS configured for development (localhost origins)

## Known Limitations

- History persistence not yet implemented (foundation in place)
- No database integration yet
- No collection management yet
- No OAuth flows yet
- No WebSocket support yet
- No GraphQL support yet

## Next Phase Recommendations

### Phase 3: History & Collections
- Implement request history with local storage or database
- Add collections management
- Add request saving functionality
- Add history search and filtering

### Phase 4: Advanced Features
- OpenAPI import and parsing
- Automated test generation from OpenAPI specs
- Response schema validation
- Mock server implementation

### Phase 5: AI Integration
- AI-powered error diagnosis
- Intelligent test case generation
- Automatic documentation generation
- JSON payload generation

## Dependencies

### Frontend
- React 19
- TypeScript 5
- Vite 7
- Axios (for HTTP requests)
- React Router DOM (for routing)
- Tailwind CSS (for styling)
- Zustand (for state management)
- Lucide React (for icons)

### Backend
- Node.js
- Express 4
- TypeScript 5
- Axios (for HTTP client)
- CORS (for CORS handling)
- tsx (for TypeScript execution)

## Build for Production

### Frontend
```bash
cd Frontend
npm run build
```
Output: `Frontend/dist/`

### Backend
```bash
cd Backend
npm run build
```
Output: `Backend/dist/`

Start production server:
```bash
npm start
```

## Contributing

This is an academic project. Follow the existing code structure and conventions when making changes.

## License

Academic project - WCE 3rd Year 5th Semester Mini Project
