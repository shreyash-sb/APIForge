
const http = require("node:http");

const PORT = 4001;
const TOKEN = "demo-secret-token-123";

const users = {
  "101": { id: 101, name: "Test User", role: "developer" },
};

const server = http.createServer((req, res) => {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200);
      return res.end(JSON.stringify({ status: "ok", service: "APIForge Demo API" }));
    }

    if (req.method === "POST" && url.pathname === "/login") {
      let input;

      try {
        input = JSON.parse(body || "{}");
      } catch {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: "Invalid JSON" }));
      }

      if (input.username !== "demo" || input.password !== "demo-pass-123") {
        res.writeHead(401);
        return res.end(JSON.stringify({ error: "Invalid credentials" }));
      }

      res.writeHead(200, { "Set-Cookie": `demo_session=${TOKEN}; HttpOnly` });
      return res.end(JSON.stringify({
        token: TOKEN,
        userId: 101,
        message: "Login successful"
      }));
    }

    if (req.method === "GET" && url.pathname === "/users/101") {
      if (req.headers.authorization !== `Bearer ${TOKEN}`) {
        res.writeHead(401);
        return res.end(JSON.stringify({ error: "Unauthorized" }));
      }

      res.writeHead(200);
      return res.end(JSON.stringify(users["101"]));
    }

    if (req.method === "DELETE" && url.pathname === "/temporary-resource") {
      if (req.headers.authorization !== `Bearer ${TOKEN}`) {
        res.writeHead(401);
        return res.end(JSON.stringify({ error: "Unauthorized" }));
      }

      res.writeHead(200);
      return res.end(JSON.stringify({
        deleted: true,
        message: "Temporary resource cleaned up"
      }));
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Route not found" }));
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Demo API running at http://127.0.0.1:${PORT}`);
  console.log("Use only the fake credentials included in the test instructions.");
});
