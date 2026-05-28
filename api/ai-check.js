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
    systemPrompt = `You are helping "Community Question". Return ONLY valid JSON.`;
    userPrompt = `Question: "${text}"`;
  } else if (mode === "similar") {
    const limitedQuestions = questions.slice(0, 8);
    const questionList = JSON.stringify(
      limitedQuestions.map((q) => ({ 
        id: q.id, 
        text: q.text, 
        votes: q.votes || 0 
      }))
    );

    systemPrompt = `You are an expert at detecting duplicate public questions for a UK civic platform.

Task: Determine which existing questions are **essentially the same** as the new one.

Core Rule: Would one clear, honest answer from the Prime Minister reasonably address both questions?

Be quite strict.

- Same topic but different specific angle = NOT the same
- Very similar intent + meaning = same
- Prioritise high-vote questions

Return ONLY valid JSON:

{
  "similar": [
    {"id": number, "reason": "very short reason"}
  ],
  "isDistinct": boolean,
  "canonicalSuggestion": "clean main version of the question or null"
}`;

    userPrompt = `New question: "${text}"

Existing questions:
${questionList}

Only return questions that are truly very similar.`;
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
        max_tokens: 1000,
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