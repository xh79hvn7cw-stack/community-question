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

  let systemPrompt, userPrompt, maxTokens = 1300;

  if (mode === "classify") {
    systemPrompt = `You are helping "Community Question" - a UK platform that aggregates public questions to the Prime Minister.

Return ONLY valid JSON:

{
  "tag": "one of: welfare, nhs, accountability, pensioners, immigration, justice, environment, housing, education, economy, transport, defence, politics, general",
  "quality": "pass" or "fail",
  "reason": "short reason only if failed"
}

Be reasonable. Pass coherent political, policy, and societal questions. Controversial or ideological questions are allowed.`;

    userPrompt = `Question: "${text}"`;

  } else if (mode === "similar") {
    const limitedQuestions = questions.slice(0, 10); // Reduced to top 10
    const questionList = JSON.stringify(
      limitedQuestions.map((q) => ({ 
        id: q.id, 
        text: q.text, 
        votes: q.votes || 0 
      }))
    );

    systemPrompt = `You are helping "Community Question" - a UK platform aggregating questions to the Prime Minister.

Task: Find questions that ask the **same core thing**. 

A single good answer from the PM should reasonably satisfy all merged questions.

Guidelines:
- Prioritise questions with higher votes
- Same topic + similar intent = merge (even if wording differs)
- Different specific demands = do not merge
- Be practical, not overly pedantic

Return ONLY valid JSON:

{
  "similar": [
    {"id": number, "reason": "one short sentence"}
  ],
  "isDistinct": boolean,
  "canonicalSuggestion": "short clean main question (null if not needed)"
}`;

    userPrompt = `New question: "${text}"

Existing questions (with vote count):
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

    if (!response.ok) throw new Error("API error");

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(aiResponse);

    return res.status(200).json(parsed);

  } catch (error) {
    console.error("AI error:", error);
    return res.status(502).json({ error: "AI service error" });
  }
}