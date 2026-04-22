import { useState, useEffect, useRef, useCallback } from "react";

// ── Seed data ──────────────────────────────────────────────────────────────
const SEED_QUESTIONS = [
  {
    id: 1,
    text: "Will you commit to scrapping the two-child benefit cap in this parliament — yes or no?",
    votes: 84203, daysUnanswered: 214, timesDeflected: 6, tag: "welfare", status: "unanswered",
    history: [
      { date: "12 Sep 2024", type: "submitted", note: "Question first submitted by community" },
      { date: "9 Oct 2024",  type: "deflected", note: "Raised at PMQs. Deflected to 'fiscal responsibility'" },
      { date: "15 Jan 2025", type: "deflected", note: "Raised again. Deflected to 'ongoing review'" },
      { date: "2 Apr 2025",  type: "deflected", note: "Raised by Lib Dem MP. No direct answer given" },
    ],
  },
  {
    id: 2,
    text: "Why did you accept £16,000 in clothing gifts while cutting winter fuel payments for pensioners?",
    votes: 71440, daysUnanswered: 189, timesDeflected: 4, tag: "accountability", status: "unanswered",
    history: [
      { date: "3 Oct 2024",  type: "submitted", note: "Question submitted following media reports" },
      { date: "23 Oct 2024", type: "deflected", note: "PMQs. Deflected to 'properly declared gifts'" },
      { date: "11 Dec 2024", type: "deflected", note: "Deflected again. No comparison addressed" },
    ],
  },
  {
    id: 3,
    text: "Will the government restore the £300 winter fuel payment for all pensioners?",
    votes: 62100, daysUnanswered: 201, timesDeflected: 8, tag: "pensioners", status: "unanswered",
    history: [
      { date: "22 Sep 2024",  type: "submitted", note: "Submitted following government announcement" },
      { date: "Oct–Dec 2024", type: "deflected", note: "Raised 5 times. Consistently deflected" },
      { date: "Mar 2025",     type: "deflected", note: "Raised 3 more times. No reversal committed" },
    ],
  },
  {
    id: 4,
    text: "What is your concrete plan to bring NHS waiting lists below 18 weeks, and by when exactly?",
    votes: 48230, daysUnanswered: 156, timesDeflected: 3, tag: "NHS", status: "unanswered",
    history: [
      { date: "1 Nov 2024", type: "submitted", note: "Community question submitted" },
      { date: "Jan 2025",   type: "deflected", note: "Raised twice. Deflected to 'record investment'" },
    ],
  },
  {
    id: 5,
    text: "How much has the Rwanda deportation scheme cost in total, including legal fees?",
    votes: 39800, daysUnanswered: 134, timesDeflected: 5, tag: "immigration", status: "unanswered",
    history: [
      { date: "5 Oct 2024", type: "submitted", note: "Question submitted" },
      { date: "Nov 2024",   type: "deflected", note: "Deflected to 'previous government decision'" },
    ],
  },
  {
    id: 6,
    text: "Will you hold a public inquiry into the grooming gangs scandal with full national scope?",
    votes: 31200, daysUnanswered: 98, timesDeflected: 4, tag: "justice", status: "unanswered",
    history: [
      { date: "15 Jan 2025", type: "submitted", note: "Question submitted" },
      { date: "Feb 2025",    type: "deflected", note: "Deflected twice. Local inquiries cited instead" },
    ],
  },
  {
    id: 7,
    text: "When will infected blood inquiry victims receive full compensation payments?",
    votes: 28400, daysUnanswered: 87, timesDeflected: 3, tag: "justice", status: "unanswered",
    history: [
      { date: "1 Feb 2025", type: "submitted", note: "Question submitted" },
      { date: "Mar 2025",   type: "deflected", note: "Deflected to 'Sir Brian Langstaff review'" },
    ],
  },
  {
    id: 8,
    text: "Will you introduce a legally binding target to end sewage dumping in rivers and seas?",
    votes: 22100, daysUnanswered: 76, timesDeflected: 2, tag: "environment", status: "unanswered",
    history: [
      { date: "10 Feb 2025", type: "submitted", note: "Question submitted" },
      { date: "Mar 2025",    type: "deflected", note: "Deflected to 'water company investment plans'" },
    ],
  },
];

const TAGS = ["all", "welfare", "NHS", "accountability", "pensioners", "immigration", "justice", "environment"];

const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
const histIcon  = (t) => t === "submitted" ? "◎" : t === "deflected" ? "✕" : "✓";
const histColor = (t) => t === "submitted" ? "#9CA3AF" : t === "deflected" ? "#EF4444" : "#22C55E";

const SYSTEM_PROMPT = `You are helping a UK civic accountability platform called Community Question.
Find semantically similar questions to the one submitted. Return ONLY valid JSON:
{"similar":[{"id":<number>,"reason":"<one sentence>"}],"isDistinct":<boolean>,"canonicalSuggestion":"<string or null>"}
Existing questions: QUESTIONS_PLACEHOLDER`;

async function checkSimilar(text, questions) {
  const system = SYSTEM_PROMPT.replace("QUESTIONS_PLACEHOLDER", JSON.stringify(questions.map((q) => ({ id: q.id, text: q.text }))));
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5", max_tokens: 800, system,
      messages: [{ role: "user", content: `New question: "${text}"` }],
    }),
  });
  const data = await res.json();
  const raw = data.content?.find((b) => b.type === "text")?.text || "{}";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

const S = {
  app:       { minHeight: "100vh", background: "#0A0A0F", color: "#E8E6E0", fontFamily: "'Syne', sans-serif" },
  nav:       { position: "sticky", top: 0, zIndex: 100, background: "rgba(10,10,15,0.94)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo:      { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: "#F5F0E8", cursor: "pointer", letterSpacing: "-0.5px", userSelect: "none" },
  logoY:     { color: "#E8C547" },
  navBtn:    { background: "#E8C547", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, color: "#0A0A0F", cursor: "pointer", fontFamily: "'Syne', sans-serif" },
  page:      { maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" },
  backBtn:   { background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6B7280", padding: 0, marginBottom: 24, display: "flex", alignItems: "center", gap: 6, fontFamily: "'Syne', sans-serif" },
  heroWrap:  { marginBottom: 40, paddingBottom: 32, borderBottom: "1px solid rgba(255,255,255,0.08)" },
  heroEye:   { fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#6B7280", textTransform: "uppercase", marginBottom: 10 },
  heroTitle: { fontFamily: "'Playfair Display', serif", fontSize: "clamp(26px,5vw,40px)", lineHeight: 1.12, letterSpacing: "-1px", color: "#F5F0E8", marginBottom: 10 },
  heroAccent:{ fontStyle: "italic", color: "#E8C547" },
  heroSub:   { fontSize: 15, color: "#9CA3AF", lineHeight: 1.65, maxWidth: 500, marginBottom: 24 },
  statsRow:  { display: "flex", gap: 28, flexWrap: "wrap" },
  statVal:   (r) => ({ fontSize: 26, fontWeight: 700, color: r ? "#EF4444" : "#F5F0E8", lineHeight: 1 }),
  statLbl:   { fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em" },
  pmCard:    { background: "linear-gradient(135deg,#1a1a2e,#16213e)", border: "1px solid rgba(232,197,71,0.2)", borderRadius: 16, padding: "20px 24px", marginBottom: 32, display: "flex", alignItems: "center", gap: 16 },
  pmAvatar:  { width: 52, height: 52, borderRadius: "50%", background: "rgba(232,197,71,0.15)", border: "2px solid rgba(232,197,71,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#E8C547", flexShrink: 0 },
  pmName:    { fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700, color: "#F5F0E8", marginBottom: 2 },
  pmRole:    { fontSize: 12, color: "#6B7280" },
  pmPct:     { fontSize: 28, fontWeight: 700, color: "#EF4444", lineHeight: 1 },
  pmPctLbl:  { fontSize: 11, color: "#6B7280", textAlign: "right", lineHeight: 1.4 },
  ctrlRow:   { display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" },
  sortBtn:   (a) => ({ background: a ? "#E8C547" : "transparent", border: "1px solid " + (a ? "#E8C547" : "rgba(255,255,255,0.1)"), borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: a ? "#0A0A0F" : "#9CA3AF", cursor: "pointer", fontFamily: "'Syne', sans-serif" }),
  tagBtn:    (a) => ({ background: a ? "rgba(232,197,71,0.15)" : "transparent", border: "1px solid " + (a ? "rgba(232,197,71,0.4)" : "rgba(255,255,255,0.08)"), borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 600, color: a ? "#E8C547" : "#6B7280", cursor: "pointer", fontFamily: "'Syne', sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }),
  divV:      { width: 1, height: 20, background: "rgba(255,255,255,0.1)", margin: "0 4px" },
  qCard:     { background: "#111118", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px", marginBottom: 8, cursor: "pointer", display: "flex", gap: 16, alignItems: "flex-start" },
  voteCol:   { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 48, flexShrink: 0 },
  voteBtn:   (v) => ({ width: 38, height: 32, borderRadius: 8, border: v ? "none" : "1px solid rgba(255,255,255,0.12)", background: v ? "#E8C547" : "transparent", cursor: v ? "default" : "pointer", fontSize: 12, fontWeight: 700, color: v ? "#0A0A0F" : "#6B7280", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif" }),
  voteCount: { fontSize: 16, fontWeight: 700, color: "#F5F0E8" },
  voteLbl:   { fontSize: 9, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" },
  qBody:     { flex: 1, minWidth: 0 },
  qText:     { fontSize: 14, fontWeight: 500, color: "#E8E6E0", lineHeight: 1.55, marginBottom: 10 },
  qMeta:     { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  pill:      (bg, c) => ({ fontSize: 10, background: bg, color: c, borderRadius: 4, padding: "3px 8px", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }),
  detailHero:{ background: "#111118", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 28, marginBottom: 16 },
  detailQ:   { fontFamily: "'Playfair Display', serif", fontSize: "clamp(16px,3vw,21px)", color: "#F5F0E8", lineHeight: 1.45, marginBottom: 24, fontStyle: "italic" },
  statGrid:  { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 },
  statCard:  { background: "#0A0A0F", borderRadius: 10, padding: "14px 16px" },
  scV:       (r) => ({ fontSize: 26, fontWeight: 700, color: r ? "#EF4444" : "#F5F0E8", marginBottom: 2 }),
  scL:       { fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em" },
  bigVote:   (v) => ({ width: "100%", padding: "14px 0", borderRadius: 10, border: "none", background: v ? "rgba(34,197,94,0.15)" : "#E8C547", cursor: v ? "default" : "pointer", fontSize: 14, fontWeight: 700, color: v ? "#22C55E" : "#0A0A0F", fontFamily: "'Syne', sans-serif" }),
  tlWrap:    { background: "#111118", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "24px 28px" },
  tlTitle:   { fontSize: 11, fontWeight: 700, color: "#4B5563", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 20 },
  tlItem:    { display: "flex", gap: 14, marginBottom: 18, position: "relative" },
  tlLine:    { position: "absolute", left: 7, top: 18, width: 1, height: "calc(100% + 4px)", background: "rgba(255,255,255,0.06)" },
  tlDot:     (c) => ({ width: 16, height: 16, borderRadius: "50%", background: c + "22", border: "1.5px solid " + c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: c, flexShrink: 0, marginTop: 2 }),
  tlDate:    { fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 2 },
  tlNote:    { fontSize: 13, color: "#9CA3AF", lineHeight: 1.5 },
  submitCard:{ background: "#111118", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 28 },
  label:     { fontSize: 12, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 },
  textarea:  { width: "100%", minHeight: 110, background: "#0A0A0F", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 14px", fontSize: 14, color: "#E8E6E0", fontFamily: "'Syne', sans-serif", outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6, display: "block" },
  select:    { width: "100%", background: "#0A0A0F", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "11px 14px", fontSize: 14, color: "#E8E6E0", fontFamily: "'Syne', sans-serif", outline: "none", appearance: "none", marginBottom: 20, cursor: "pointer" },
  dropdown:  { position: "absolute", top: "100%", left: 0, right: 0, background: "#1a1a24", border: "1px solid rgba(255,255,255,0.12)", borderTop: "none", borderRadius: "0 0 10px 10px", zIndex: 200, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" },
  dropItem:  (h) => ({ padding: "12px 16px", cursor: "pointer", background: h ? "rgba(232,197,71,0.08)" : "transparent", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.05)" }),
  dropText:  { fontSize: 13, color: "#E8E6E0", lineHeight: 1.4, flex: 1 },
  dropVotes: { fontSize: 11, color: "#6B7280", whiteSpace: "nowrap", marginTop: 2 },
  dropNew:   { padding: "10px 16px", fontSize: 12, color: "#E8C547", fontWeight: 600 },
  aiBox:     { background: "rgba(232,197,71,0.05)", border: "1px solid rgba(232,197,71,0.2)", borderRadius: 10, padding: 20, marginTop: 16 },
  aiTitle:   { fontSize: 12, fontWeight: 700, color: "#E8C547", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 },
  aiItem:    { background: "#0A0A0F", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: 14, marginBottom: 8, cursor: "pointer" },
  aiItemQ:   { fontSize: 13, fontWeight: 500, color: "#E8E6E0", marginBottom: 4, lineHeight: 1.4 },
  aiItemR:   { fontSize: 11, color: "#6B7280", marginBottom: 8 },
  aiItemFt:  { display: "flex", justifyContent: "space-between", alignItems: "center" },
  joinBtn:   { fontSize: 11, fontWeight: 700, color: "#E8C547", background: "rgba(232,197,71,0.1)", border: "1px solid rgba(232,197,71,0.3)", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'Syne', sans-serif" },
  primaryBtn:(d) => ({ background: d ? "rgba(255,255,255,0.05)" : "#E8C547", border: "none", borderRadius: 10, padding: "13px 24px", fontSize: 13, fontWeight: 700, color: d ? "#4B5563" : "#0A0A0F", cursor: d ? "not-allowed" : "pointer", fontFamily: "'Syne', sans-serif" }),
  spinner:   { display: "inline-block", width: 13, height: 13, border: "2px solid rgba(232,197,71,0.3)", borderTopColor: "#E8C547", borderRadius: "50%", animation: "spin 0.8s linear infinite", verticalAlign: "middle", marginRight: 8 },
  successBox:{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 16, padding: 40, textAlign: "center" },
};

export default function App() {
  const [view, setView]               = useState("home");
  const [questions, setQuestions]     = useState(SEED_QUESTIONS);
  const [votedIds, setVotedIds]       = useState(new Set());
  const [sortBy, setSortBy]           = useState("votes");
  const [activeTag, setActiveTag]     = useState("all");
  const [selectedQId, setSelectedQId] = useState(null);
  const [submitText, setSubmitText]   = useState("");
  const [submitTag, setSubmitTag]     = useState("general");
  const [aiResult, setAiResult]       = useState(null);
  const [aiLoading, setAiLoading]     = useState(false);
  const [submitted, setSubmitted]     = useState(false);
  const [showDrop, setShowDrop]       = useState(false);
  const [dropHover, setDropHover]     = useState(-1);
  const wrapRef = useRef(null);

  // close dropdown on outside click
  useEffect(() => {
    const fn = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDrop(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // instant keyword matches — computed inline, no state update, no re-render loop
  const getMatches = (text) => {
    if (text.trim().length < 4) return [];
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    return questions
      .map((q) => ({ ...q, score: words.reduce((s, w) => s + (q.text.toLowerCase().includes(w) ? 1 : 0), 0) }))
      .filter((q) => q.score > 0)
      .sort((a, b) => b.score - a.score || b.votes - a.votes)
      .slice(0, 4);
  };

  const handleVote = (qid, e) => {
    if (e) e.stopPropagation();
    if (votedIds.has(qid)) return;
    setVotedIds((p) => new Set([...p, qid]));
    setQuestions((p) => p.map((q) => q.id === qid ? { ...q, votes: q.votes + 1 } : q));
  };

  const joinFromDrop = (qid) => {
    handleVote(qid, null);
    setShowDrop(false);
    setSubmitText("");
    setSelectedQId(qid);
    setView("question");
  };

  // KEY FIX: stable onChange — no setState that causes remount
  const onTextChange = (e) => {
    const val = e.target.value;
    setSubmitText(val);
    if (aiResult) setAiResult(null);
    setShowDrop(val.trim().length >= 4);
  };

  const runAiCheck = async () => {
    if (submitText.trim().length < 20) return;
    setAiLoading(true);
    setShowDrop(false);
    setAiResult(null);
    try { setAiResult(await checkSimilar(submitText, questions)); }
    catch { setAiResult({ similar: [], isDistinct: true }); }
    setAiLoading(false);
  };

  const submitNew = () => {
    const q = { id: Date.now(), text: submitText, votes: 1, daysUnanswered: 0, timesDeflected: 0, tag: submitTag, status: "unanswered", history: [{ date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), type: "submitted", note: "Submitted by community" }] };
    setQuestions((p) => [q, ...p]);
    setVotedIds((p) => new Set([...p, q.id]));
    setSubmitted(true);
    setSubmitText("");
    setAiResult(null);
  };

  const goHome = () => { setView("home"); setSubmitted(false); };

  const filtered = questions
    .filter((q) => activeTag === "all" || q.tag === activeTag)
    .sort((a, b) => sortBy === "votes" ? b.votes - a.votes : b.daysUnanswered - a.daysUnanswered);

  const totalVoices     = questions.reduce((s, q) => s + q.votes, 0);
  const totalUnanswered = questions.filter((q) => q.status === "unanswered").length;
  const totalDeflected  = questions.reduce((s, q) => s + q.timesDeflected, 0);

  const QCard = ({ q }) => (
    <div style={S.qCard}
      onClick={() => { setSelectedQId(q.id); setView("question"); }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(232,197,71,0.3)"}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"}
    >
      <div style={S.voteCol}>
        <button style={S.voteBtn(votedIds.has(q.id))} onClick={(e) => handleVote(q.id, e)}>{votedIds.has(q.id) ? "✓" : "+1"}</button>
        <span style={S.voteCount}>{fmt(q.votes)}</span>
        <span style={S.voteLbl}>voices</span>
      </div>
      <div style={S.qBody}>
        <p style={S.qText}>{q.text}</p>
        <div style={S.qMeta}>
          <span style={S.pill("rgba(255,255,255,0.06)", "#9CA3AF")}>{q.tag}</span>
          {q.daysUnanswered > 0 && <span style={S.pill(q.daysUnanswered > 100 ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)", q.daysUnanswered > 100 ? "#EF4444" : "#F59E0B")}>{q.daysUnanswered}d ignored</span>}
          {q.timesDeflected > 0 && <span style={S.pill("rgba(239,68,68,0.08)", "#F87171")}>dodged {q.timesDeflected}×</span>}
        </div>
      </div>
    </div>
  );

  // ── Views ───────────────────────────────────────────────────────────────
  const HomeView = () => (
    <div style={S.page}>
      <div style={S.heroWrap}>
        <p style={S.heroEye}>UK Political Accountability</p>
        <h1 style={S.heroTitle}>Make the Prime Minister<br /><span style={S.heroAccent}>actually answer.</span></h1>
        <p style={S.heroSub}>Politicians love the word community. Let's see if they mean it. Every question here has been asked by thousands — and ignored.</p>
        <div style={S.statsRow}>
          <div><div style={S.statVal(false)}>{totalVoices.toLocaleString()}</div><div style={S.statLbl}>voices joined</div></div>
          <div><div style={S.statVal(true)}>{totalUnanswered}</div><div style={S.statLbl}>unanswered</div></div>
          <div><div style={S.statVal(true)}>{totalDeflected}</div><div style={S.statLbl}>deflections logged</div></div>
        </div>
      </div>
      <div style={S.pmCard}>
        <div style={S.pmAvatar}>KS</div>
        <div style={{ flex: 1 }}><p style={S.pmName}>Keir Starmer</p><p style={S.pmRole}>Prime Minister · Labour</p></div>
        <div style={{ textAlign: "right" }}><div style={S.pmPct}>11%</div><div style={S.pmPctLbl}>questions<br />answered</div></div>
      </div>
      <div style={S.ctrlRow}>
        <button style={S.sortBtn(sortBy === "votes")} onClick={() => setSortBy("votes")}>Most voices</button>
        <button style={S.sortBtn(sortBy === "days")}  onClick={() => setSortBy("days")}>Longest ignored</button>
        <div style={S.divV} />
        {TAGS.map((t) => <button key={t} style={S.tagBtn(activeTag === t)} onClick={() => setActiveTag(t)}>{t}</button>)}
      </div>
      {filtered.map((q) => <QCard key={q.id} q={q} />)}
    </div>
  );

  const QuestionView = () => {
    const q = questions.find((x) => x.id === selectedQId);
    if (!q) return null;
    return (
      <div style={S.page}>
        <button style={S.backBtn} onClick={goHome}>← Back to questions</button>
        <div style={S.detailHero}>
          <div style={S.qMeta}>
            <span style={S.pill("rgba(255,255,255,0.06)", "#9CA3AF")}>{q.tag}</span>
            <span style={S.pill("rgba(239,68,68,0.12)", "#EF4444")}>unanswered</span>
          </div>
          <p style={{ ...S.detailQ, marginTop: 14 }}>"{q.text}"</p>
          <div style={S.statGrid}>
            <div style={S.statCard}><div style={S.scV(false)}>{q.votes.toLocaleString()}</div><div style={S.scL}>people asking</div></div>
            <div style={S.statCard}><div style={S.scV(true)}>{q.daysUnanswered}</div><div style={S.scL}>days ignored</div></div>
            <div style={S.statCard}><div style={S.scV(true)}>{q.timesDeflected}</div><div style={S.scL}>deflections</div></div>
          </div>
          <button style={S.bigVote(votedIds.has(q.id))} onClick={(e) => handleVote(q.id, e)} disabled={votedIds.has(q.id)}>
            {votedIds.has(q.id) ? "✓  Your voice has been added" : "+  Add your voice to this question"}
          </button>
        </div>
        <div style={S.tlWrap}>
          <p style={S.tlTitle}>Deflection timeline</p>
          {q.history.map((h, i) => (
            <div key={i} style={S.tlItem}>
              {i < q.history.length - 1 && <div style={S.tlLine} />}
              <div style={S.tlDot(histColor(h.type))}>{histIcon(h.type)}</div>
              <div><div style={S.tlDate}>{h.date}</div><div style={S.tlNote}>{h.note}</div></div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Submit is rendered inline (not as nested component) — this is the fix for focus loss
  const matches = getMatches(submitText);

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,700&family=Syne:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`* {margin:0;padding:0;box-sizing:border-box} body{background:#0A0A0F} ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:#0A0A0F} ::-webkit-scrollbar-thumb{background:#2a2a3a;border-radius:3px} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={S.app}>
        <nav style={S.nav}>
          <span style={S.logo} onClick={goHome}>Community<span style={S.logoY}>Question</span></span>
          <button style={S.navBtn} onClick={() => { setView("submit"); setSubmitted(false); setAiResult(null); setSubmitText(""); }}>Ask a question</button>
        </nav>

        {view === "home"     && <HomeView />}
        {view === "question" && <QuestionView />}
        {view === "submit"   && (
          <div style={S.page}>
            <button style={S.backBtn} onClick={() => { goHome(); setAiResult(null); setSubmitText(""); }}>← Back</button>
            <p style={S.heroEye}>Ask a question</p>
            <h2 style={{ ...S.heroTitle, fontSize: 28, marginBottom: 24 }}>Make them <span style={S.heroAccent}>answer.</span></h2>
            {submitted ? (
              <div style={S.successBox}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
                <p style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: "#22C55E", marginBottom: 8 }}>Question submitted</p>
                <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 24 }}>Your voice has been added.</p>
                <button style={S.primaryBtn(false)} onClick={() => { setSubmitted(false); goHome(); }}>Back to questions</button>
              </div>
            ) : (
              <div style={S.submitCard}>
                <label style={S.label}>Your question for Keir Starmer</label>
                <div ref={wrapRef} style={{ position: "relative", marginBottom: 20 }}>
                  <textarea
                    style={S.textarea}
                    placeholder="Be specific. Yes/no questions work best — they leave no room to dodge."
                    value={submitText}
                    onChange={onTextChange}
                    onKeyDown={(e) => {
                      if (!showDrop || matches.length === 0) return;
                      if (e.key === "ArrowDown") { e.preventDefault(); setDropHover((h) => Math.min(h + 1, matches.length - 1)); }
                      if (e.key === "ArrowUp")   { e.preventDefault(); setDropHover((h) => Math.max(h - 1, 0)); }
                      if (e.key === "Enter" && dropHover >= 0) { e.preventDefault(); joinFromDrop(matches[dropHover].id); }
                      if (e.key === "Escape") setShowDrop(false);
                    }}
                  />
                  {showDrop && matches.length > 0 && (
                    <div style={S.dropdown}>
                      {matches.map((m, i) => (
                        <div key={m.id} style={S.dropItem(dropHover === i)}
                          onMouseEnter={() => setDropHover(i)}
                          onMouseLeave={() => setDropHover(-1)}
                          onMouseDown={(e) => { e.preventDefault(); joinFromDrop(m.id); }}
                        >
                          <span style={S.dropText}>{m.text}</span>
                          <span style={S.dropVotes}>{fmt(m.votes)} voices</span>
                        </div>
                      ))}
                      <div style={S.dropNew}>+ Submit as a new question below</div>
                    </div>
                  )}
                </div>

                <label style={S.label}>Topic</label>
                <select style={S.select} value={submitTag} onChange={(e) => setSubmitTag(e.target.value)}>
                  {["general","welfare","NHS","accountability","pensioners","immigration","justice","environment","housing","education","economy"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>

                <button style={{ ...S.primaryBtn(submitText.trim().length < 20 || aiLoading), width: "100%" }} onClick={runAiCheck} disabled={submitText.trim().length < 20 || aiLoading}>
                  {aiLoading ? <><span style={S.spinner} />Checking for similar questions…</> : "Check for similar questions →"}
                </button>

                {aiResult && (
                  <div style={S.aiBox}>
                    <p style={S.aiTitle}>{aiResult.similar?.length > 0 ? `${aiResult.similar.length} similar question${aiResult.similar.length > 1 ? "s" : ""} already exist` : "No duplicates found — your question looks distinct"}</p>
                    {aiResult.similar?.map(({ id, reason }) => {
                      const m = questions.find((q) => q.id === id);
                      if (!m) return null;
                      return (
                        <div key={id} style={S.aiItem}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(232,197,71,0.06)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "#0A0A0F"}
                        >
                          <p style={S.aiItemQ}>{m.text}</p>
                          <p style={S.aiItemR}>{reason}</p>
                          <div style={S.aiItemFt}>
                            <span style={{ fontSize: 12, color: "#6B7280" }}>{m.votes.toLocaleString()} voices</span>
                            <button style={S.joinBtn} onClick={() => { handleVote(id, null); setSubmitted(true); }}>+ Add my voice →</button>
                          </div>
                        </div>
                      );
                    })}
                    {aiResult.isDistinct && (
                      <div style={{ marginTop: aiResult.similar?.length ? 16 : 0, paddingTop: aiResult.similar?.length ? 16 : 0, borderTop: aiResult.similar?.length ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                        {aiResult.canonicalSuggestion && <p style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 12, fontStyle: "italic" }}>Suggested wording: "{aiResult.canonicalSuggestion}"</p>}
                        <button style={{ ...S.primaryBtn(false), width: "100%" }} onClick={submitNew}>Submit as new question</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
