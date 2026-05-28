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

  let systemPrompt, userPrompt, maxTokens = 1200;

  if (mode === "classify") {
    systemPrompt = `You are helping "Community Question" - a UK platform that aggregates public questions to the Prime Minister.

Task: Determine if this is a valid question for the Prime Minister / UK Government.

Return ONLY valid JSON:

{
  "tag": "one of: welfare, nhs, accountability, pensioners, immigration, justice, environment, housing, education, economy, transport, defence, politics, general",
  "quality": "pass" or "fail",
  "reason": "short reason only if failed"
}

Rules:
- Pass any coherent political, policy, or societal question directed at the government/PM
- Political, ideological, and controversial questions are ALLOWED (e.g. far right, immigration, free speech, wokeness, etc.)
- Questions asking for definitions or clarifications are valid
- Only FAIL if it's spam, clear abuse, personal attack, nonsense, or completely off-topic (not related to UK governance/politics)`;

    userPrompt = `Question: "${text}"`;

  } else if (mode === "similar") {
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "Missing questions array" });
    }

    const limitedQuestions = questions.slice(0, 12);
    const questionList = JSON.stringify(
      limitedQuestions.map((q) => ({ id: q.id, text: q.text }))
    );

    systemPrompt = `You are helping "Community Question" - a UK platform that aggregates public questions to the Prime Minister.

Task: Find which existing questions are asking the **same core thing**.

A single honest answer from the Prime Minister should reasonably address all merged questions.

Be reasonable but not too loose.

Return ONLY valid JSON:

{
  "similar": [
    {"id": number, "reason": "one short sentence explaining the similarity"}
  ],
  "isDistinct": boolean,
  "canonicalSuggestion": "short improved main question if needed, otherwise null"
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
        max_tokens: maxTokens,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Grok API error:", errorText);
      return res.status(502).json({ error: "AI service temporarily unavailable" });
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;

    let parsed;
    try {
      parsed = JSON.parse(aiResponse);
    } catch (e) {
      console.error("JSON parse error from Grok");
      return res.status(502).json({ error: "Invalid AI response format" });
    }

    return res.status(200).json(parsed);

  } catch (error) {
    console.error("AI handler error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}