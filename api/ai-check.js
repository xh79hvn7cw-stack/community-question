// Vercel serverless function — proxies AI calls so the API key stays server-side
export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Basic origin check — only allow requests from our own domain
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

  // Build the right system prompt and user message based on mode
  let system, userContent, maxTokens;

  if (mode === "classify") {
    system = `You are helping a UK civic accountability platform. Given a question directed at the Prime Minister, return ONLY valid JSON: {"tag":"<one of: welfare,NHS,accountability,pensioners,immigration,justice,environment,housing,education,economy,general>","quality":"<pass or fail>"}. A question passes if it is a genuine coherent question relevant to a politician or government policy, not abusive or inappropriate.`;
    userContent = `Question: "${text}"`;
    maxTokens = 200;
  } else if (mode === "similar") {
    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: "Missing questions array" });
    }
    const questionList = JSON.stringify(
      questions.map((q) => ({ id: q.id, text: q.text }))
    );
    system = `You are helping a UK civic accountability platform called Community Question.

Your job: identify which existing questions ask the SAME underlying thing as the new question — meaning a single honest answer from the Prime Minister would satisfy both askers.

Two questions are the SAME only if:
- They demand the same specific information, decision, or commitment
- An honest answer to one would fully answer the other
- They share not just a topic, but the actual ask

Two questions are DIFFERENT (even if related) if:
- They are about the same broad topic but ask about different aspects, groups, mechanisms, or outcomes
- One asks "why" and the other asks "how" / "when" / "who" / "whether"
- They focus on different people, places, time periods, or policy areas
- A politician could answer one fully without addressing the other

Be strict. False matches dilute the platform's credibility. When in doubt, treat questions as DIFFERENT and return an empty similar array.

Return ONLY valid JSON in this exact shape:
{"similar":[{"id":<number>,"reason":"<one sentence explaining why the SAME answer satisfies both>"}],"isDistinct":<boolean>,"canonicalSuggestion":"<string or null>"}

Existing questions: ${questionList}`;
    userContent = `New question: "${text}"`;
    maxTokens = 800;
  } else {
    return res.status(400).json({ error: "Invalid mode" });
  }

  // Call Anthropic
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", response.status, errorText);
      return res.status(response.status).json({ error: "Upstream API error" });
    }

    const data = await response.json();
    const raw = data.content?.find((b) => b.type === "text")?.text || "{}";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Serverless function error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}