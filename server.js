// DevFix server: serves the page and exposes /api/explain (AI fallback).
// The API key stays here on the server and is never sent to the browser.
import express from "express";
import path from "node:path";

const app = express();
app.use(express.json({ limit: "20kb" }));

// Serve ONLY index.html
app.get("/", (req, res) => res.sendFile(path.resolve("index.html")));

const SYSTEM_INSTRUCTION = `You explain coding errors to developers. Provide clear, concise explanations and direct fix steps.`;

app.post("/api/explain", async (req, res) => {
  const { error, language } = req.body || {};
  if (!error || typeof error !== "string") return res.status(400).json({ error: "No error text" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "API key not set" });

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: `Language: ${language || "unknown"}\nError:\n${error.slice(0, 4000)}` }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              what: { type: "STRING" },
              why: { type: "ARRAY", items: { type: "STRING" } },
              fix: { type: "ARRAY", items: { type: "STRING" } },
              bad: { type: "STRING" },
              good: { type: "STRING" }
            },
            required: ["title", "what", "why", "fix", "bad", "good"]
          },
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!r.ok) {
      const errBody = await r.text();
      throw new Error(`Gemini API returned status ${r.status}: ${errBody}`);
    }

    const data = await r.json();
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    
    // Clean any accidental markdown wrap
    rawText = rawText.trim();
    if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    const parsed = JSON.parse(rawText);
    res.json(parsed);
  } catch (e) {
    console.error("AI error:", e.message);
    res.status(502).json({ error: "AI unavailable" });
  }
});

app.listen(3000, () => console.log("DevFix running at http://localhost:3000"));