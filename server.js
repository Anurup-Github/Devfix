// DevFix server: serves the page and exposes /api/explain (AI fallback).
// The API key stays here on the server and is never sent to the browser.
import express from "express";
import path from "node:path";

const app = express();
app.use(express.json({ limit: "20kb" }));

// Serve ONLY index.html (not the whole folder, so server.js and .env stay private)
app.get("/", (req, res) => res.sendFile(path.resolve("index.html")));

const SYSTEM = `You explain coding errors to developers. Reply with ONLY valid JSON, no markdown, in this shape:
{"title":"short title","what":"what happened, 1-2 sentences","why":["cause 1","cause 2","cause 3"],"fix":["step 1","step 2","step 3"],"bad":"short code that causes it","good":"short fixed code"}`;

app.post("/api/explain", async (req, res) => {
  const { error, language } = req.body || {};
  if (!error || typeof error !== "string") return res.status(400).json({ error: "No error text" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "API key not set" });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5-5",
        max_tokens: 800,
        system: SYSTEM,
        messages: [{ role: "user", content: `Language: ${language || "unknown"}\nError:\n${error.slice(0, 4000)}` }],
      }),
    });
    const data = await r.json();
    const text = data.content?.[0]?.text ?? "";
    res.json(JSON.parse(text.replace(/```json|```/g, "").trim()));
  } catch (e) {
    console.error("AI error:", e.message);
    res.status(502).json({ error: "AI unavailable" });
  }
});

app.listen(3000, () => console.log("DevFix running at http://localhost:3000"));
