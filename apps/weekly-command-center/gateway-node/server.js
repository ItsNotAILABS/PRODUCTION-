/**
 * Node envelope: the single front door for the whole stack. Fronts the
 * Python core-api (which itself talks to the Julia/Haskell services) and
 * serves the actual web/local UI as static files — this is the "use node,
 * use local and web" layer the platform is built around.
 */
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.GATEWAY_PORT || 3000;
const CORE_API_URL = process.env.CORE_API_URL || "http://localhost:8000";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Reverse-proxy everything under /api/* to core-api, stripping the prefix.
app.all("/api/*", async (req, res) => {
  const target = `${CORE_API_URL}${req.originalUrl.replace(/^\/api/, "")}`;
  try {
    const init = {
      method: req.method,
      headers: { "Content-Type": "application/json" },
    };
    if (!["GET", "HEAD"].includes(req.method)) {
      init.body = JSON.stringify(req.body);
    }
    const upstream = await fetch(target, init);
    const contentType = upstream.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } else {
      const text = await upstream.text();
      res.status(upstream.status).send(text);
    }
  } catch (err) {
    res.status(502).json({
      error: "core-api unreachable",
      detail: err.message,
      target,
    });
  }
});

app.get("/healthz", (_req, res) => res.json({ status: "ok", service: "gateway-node" }));

app.listen(PORT, () => {
  console.log(`gateway-node listening on http://localhost:${PORT}`);
  console.log(`proxying /api/* -> ${CORE_API_URL}`);
});
