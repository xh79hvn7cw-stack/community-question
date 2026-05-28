// Vercel serverless function — proxies Grok (xAI) calls
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Origin check
  const origin = req.headers.origin || "";
  const allowed = [
    "https://communityquestion.uk",
    "https://www.communityquestion.uk",
    "http://localhost:5173",
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
    systemPrompt = `You are helping a UK civic accountability platform called "Community Question".
Return ONLY valid JSON with no extra text.

{
  "tag": "one of: welfare, nhs, accountability, pensioners, immigration, justice, environment, housing, education, economy, transport, defence, general",
  "quality": "pass" or "fail"
}

A question passes only if it is a genuine, coherent question relevant to UK government policy or the Prime Minister. Fail abusive, spam, or off-topic content.`;
    
    userPrompt = `Question: "${text}"`;

  } else if (mode === "similar") {
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "Missing questions array" });
    }

    // Limit to top 12 for cost + performance
    const limitedQuestions = questions.slice(0, 12);
    const questionList = JSON.stringify(
      limitedQuestions.map((q) => ({ id: q.id, text: q.text }))
    );

    systemPrompt = `You are helping "Community Question" - a UK platform that aggregates public questions to the Prime Minister.

Task: Identify which existing questions are asking the **same underlying thing** as the new question.
A single honest answer from the Prime Minister should satisfy all merged questions.

Rules:
- Be strict. Only merge if the core ask is nearly identical.
- Same topic but different specifics = DIFFERENT.
- Different "why/how/who/when" = DIFFERENT.
- When in doubt, do NOT merge.

Return ONLY valid JSON:
{
  "similar": [
    {"id": number, "reason": "one short sentence why they are the same"}
  ],
  "isDistinct": boolean,
  "canonicalSuggestion": "short suggested main question (null if not needed)"
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
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Grok API error:", errorText);
      return res.status(502).json({ error: "AI service error" });
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;

    let parsed;
    try {
      parsed = JSON.parse(aiResponse);
    } catch (e) {
      console.error("Failed to parse JSON from Grok");
      return res.status(502).json({ error: "Invalid AI response" });
    }

    return res.status(200).json(parsed);

  } catch (error) {
    console.error("AI handler error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}