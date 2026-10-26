# APIForge Backend

Backend server for APIForge API development platform.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
npm start
```

## Environment Variables

See `.env.example` for configuration options.

### Outbound request safety

`OUTBOUND_REQUEST_SAFE_MODE=false` is the local-development default, so Request Builder can call local APIs. Set it to `true` for an exposed deployment to reject obvious loopback, private, link-local, and metadata-service IP-literal targets. Public HTTP/HTTPS APIs remain supported. This guard intentionally does not claim DNS-rebinding protection: hostname resolution and connection-time IP enforcement require deployment/network controls.

## API Endpoints

### POST /api/requests/execute

Execute an API request.

**Request Body:**
```json
{
  "method": "GET",
  "url": "https://api.example.com/users",
  "queryParams": [],
  "headers": [],
  "body": null,
  "auth": {
    "type": "none"
  }
}
```

**Response:**
```json
{
  "success": true,
  "status": 200,
  "statusText": "OK",
  "responseTime": 184,
  "headers": {},
  "body": {},
  "size": 1234
}
```
