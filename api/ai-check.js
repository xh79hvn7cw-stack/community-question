// Vercel serverless function — Grok (xAI) proxy
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const origin = req.headers.origin || "";
  const allowed = [
    "https://communityquestion.uk",
    "https://www.communityquestion.uk",
    "http://localhost:5173",
    "https://community-question.vercel.app"
  ];
  if (!allowed.some((a) => origin.startsWith(a))) {
    return res.status(403).json({ error: "Forbidden origin" });
  }

  const { mode, text, questions } = req.body || {};

  if (!mode || !text) {
    return res.status(400).json({ error: "Missing mode or text" });
  }

  const XAI_API_KEY = process.env.XAI_API_KEY;
  if (!XAI_API_KEY) {
    return res.status(500).json({ error: "AI service not configured" });
  }

  let systemPrompt, userPrompt;

  if (mode === "classify") {
    systemPrompt = `You are helping "Community Question" - a UK platform that aggregates public questions to the Prime Minister.

Return ONLY valid JSON:

{
  "tag": "one of: welfare, nhs, accountability, pensioners, immigration, justice, environment, housing, education, economy, transport, defence, politics, general",
  "quality": "pass" or "fail",
  "reason": "short reason only if failed"
}

Rules:
- Pass coherent questions about UK politics, government policy, or society
- Fail only if it's clear hate speech, personal abuse, spam, or complete gibberish
- Political and controversial questions are allowed`;

    userPrompt = `Question: "${text}"`;

  } else if (mode === "similar") {
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "Missing questions array" });
    }

    const limitedQuestions = questions.slice(0, 10);
    const questionList = JSON.stringify(
      limitedQuestions.map((q) => ({ 
        id: q.id, 
        text: q.text, 
        votes: q.votes || 0 
      }))
    );

    systemPrompt = `You are helping "Community Question".

Task: Find which existing questions are asking the **same underlying thing** as the new one.

Core rule: A single honest answer from the Prime Minister should reasonably address all merged questions.

Be practical:
- Same core request (even if worded differently) = merge
- Different specific demands or angles = do not merge

Return ONLY valid JSON:

{
  "similar": [
    {"id": number, "reason": "one short sentence"}
  ],
  "isDistinct": boolean,
  "canonicalSuggestion": "short clean main question or null"
}`;

    userPrompt = `New question: "${text}"

Existing questions:
${questionList}`;
  }

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-4.3",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.15,
        max_tokens: 1200,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) throw new Error("API error");

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);

    return res.status(200).json(parsed);

  } catch (error) {
    console.error("AI error:", error);
    return res.status(502).json({ error: "AI service error" });
  }
}