import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import html2canvas from "html2canvas";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const getSessionId = () => {
  let id = localStorage.getItem("cq_session");
  if (!id) { id = "s_" + Math.random().toString(36).slice(2) + Date.now(); localStorage.setItem("cq_session", id); }
  return id;
};
const SESSION_ID = getSessionId();

const TAGS = ["all", "welfare", "NHS", "accountability", "pensioners", "immigration", "justice", "environment"];
const PARTIES = ["Labour", "Conservative", "Liberal Democrats", "SNP", "Reform UK", "Green", "Plaid Cymru", "Other"];

const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
const histIcon  = (t) => t === "submitted" ? "◎" : t === "deflected" ? "✕" : "✓";
const histColor = (t) => t === "submitted" ? "#9CA3AF" : t === "deflected" ? "#EF4444" : "#22C55E";
const daysAgo   = (d) => !d ? 0 : Math.floor((new Date() - new Date(d)) / 86400000);
const nextPMQs  = () => {
  const today = new Date();
  const next = new Date(today);
  next.setDate(today.getDate() + ((3 - today.getDay() + 7) % 7 || 7));
  return next.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

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
  app:        { minHeight: "100vh", background: "#0A0A0F", color: "#E8E6E0", fontFamily: "'Syne', sans-serif" },
  nav:        { position: "sticky", top: 0, zIndex: 100, background: "rgba(10,10,15,0.94)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo:       { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: "#F5F0E8", cursor: "pointer", letterSpacing: "-0.5px", userSelect: "none" },
  logoY:      { color: "#E8C547" },
  navBtn:     { background: "#E8C547", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, color: "#0A0A0F", cursor: "pointer", fontFamily: "'Syne', sans-serif" },
  page:       { maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" },
  backBtn:    { background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6B7280", padding: 0, marginBottom: 24, display: "flex", alignItems: "center", gap: 6, fontFamily: "'Syne', sans-serif" },
  loading:    { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", fontSize: 14, color: "#6B7280" },
  heroWrap:   { marginBottom: 32, paddingBottom: 32, borderBottom: "1px solid rgba(255,255,255,0.08)" },
  heroEye:    { fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#6B7280", textTransform: "uppercase", marginBottom: 10 },
  heroTitle:  { fontFamily: "'Playfair Display', serif", fontSize: "clamp(26px,5vw,40px)", lineHeight: 1.12, letterSpacing: "-1px", color: "#F5F0E8", marginBottom: 10 },
  heroAccent: { fontStyle: "italic", color: "#E8C547" },
  heroSub:    { fontSize: 15, color: "#9CA3AF", lineHeight: 1.65, maxWidth: 500, marginBottom: 24 },
  statsRow:   { display: "flex", gap: 28, flexWrap: "wrap" },
  statVal:    (r) => ({ fontSize: 26, fontWeight: 700, color: r ? "#EF4444" : "#F5F0E8", lineHeight: 1 }),
  statLbl:    { fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em" },
  topBanner:  { background: "linear-gradient(135deg, #1a0a00, #2a1500)", border: "1px solid rgba(232,197,71,0.35)", borderRadius: 16, padding: "20px 24px", marginBottom: 24 },
  topEye:     { fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "#E8C547", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 },
  topDot:     { width: 6, height: 6, borderRadius: "50%", background: "#E8C547", animation: "pulse 2s infinite" },
  topQ:       { fontSize: 15, fontWeight: 600, color: "#F5F0E8", lineHeight: 1.5, marginBottom: 14 },
  topStats:   { display: "flex", gap: 20, flexWrap: "wrap" },
  topVal:     (r) => ({ fontSize: 22, fontWeight: 700, color: r ? "#EF4444" : "#E8C547", lineHeight: 1 }),
  topLbl:     { fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em" },
  pmqsBanner: { background: "#111118", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 16px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  pmqsLeft:   { fontSize: 12, color: "#6B7280" },
  pmqsRight:  { fontSize: 12, fontWeight: 700, color: "#E8C547" },
  pmCard:     { background: "linear-gradient(135deg,#1a1a2e,#16213e)", border: "1px solid rgba(232,197,71,0.2)", borderRadius: 16, padding: "20px 24px", marginBottom: 24, display: "flex", alignItems: "center", gap: 16 },
  pmAvatar:   { width: 52, height: 52, borderRadius: "50%", background: "rgba(232,197,71,0.15)", border: "2px solid rgba(232,197,71,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#E8C547", flexShrink: 0 },
  pmName:     { fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700, color: "#F5F0E8", marginBottom: 2 },
  pmRole:     { fontSize: 12, color: "#6B7280" },
  pmPct:      { fontSize: 28, fontWeight: 700, color: "#EF4444", lineHeight: 1 },
  pmPctLbl:   { fontSize: 11, color: "#6B7280", textAlign: "right", lineHeight: 1.4 },
  ctrlRow:    { display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" },
  sortBtn:    (a) => ({ background: a ? "#E8C547" : "transparent", border: "1px solid " + (a ? "#E8C547" : "rgba(255,255,255,0.1)"), borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: a ? "#0A0A0F" : "#9CA3AF", cursor: "pointer", fontFamily: "'Syne', sans-serif" }),
  tagBtn:     (a) => ({ background: a ? "rgba(232,197,71,0.15)" : "transparent", border: "1px solid " + (a ? "rgba(232,197,71,0.4)" : "rgba(255,255,255,0.08)"), borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 600, color: a ? "#E8C547" : "#6B7280", cursor: "pointer", fontFamily: "'Syne', sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }),
  divV:       { width: 1, height: 20, background: "rgba(255,255,255,0.1)", margin: "0 4px" },
  qCard:      { background: "#111118", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px", marginBottom: 8, cursor: "pointer", display: "flex", gap: 16, alignItems: "flex-start" },
  voteCol:    { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 48, flexShrink: 0 },
  voteBtn:    (v) => ({ width: 38, height: 32, borderRadius: 8, border: v ? "none" : "1px solid rgba(255,255,255,0.12)", background: v ? "#E8C547" : "transparent", cursor: v ? "default" : "pointer", fontSize: 12, fontWeight: 700, color: v ? "#0A0A0F" : "#6B7280", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif" }),
  voteCount:  { fontSize: 16, fontWeight: 700, color: "#F5F0E8" },
  voteLbl:    { fontSize: 9, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" },
  qBody:      { flex: 1, minWidth: 0 },
  qText:      { fontSize: 14, fontWeight: 500, color: "#E8E6E0", lineHeight: 1.55, marginBottom: 10 },
  qMeta:      { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  pill:       (bg, c) => ({ fontSize: 10, background: bg, color: c, borderRadius: 4, padding: "3px 8px", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }),
  detailHero: { background: "#111118", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 28, marginBottom: 16 },
  detailTag:  { display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  detailQ:    { fontFamily: "'Playfair Display', serif", fontSize: "clamp(16px,3vw,21px)", color: "#F5F0E8", lineHeight: 1.45, marginBottom: 24, fontStyle: "italic" },
  statGrid:   { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 },
  statCard:   { background: "#0A0A0F", borderRadius: 10, padding: "14px 16px" },
  scV:        (r) => ({ fontSize: 26, fontWeight: 700, color: r ? "#EF4444" : "#F5F0E8", marginBottom: 2 }),
  scL:        { fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em" },
  bigVote:    (v) => ({ width: "100%", padding: "14px 0", borderRadius: 10, border: "none", background: v ? "rgba(34,197,94,0.15)" : "#E8C547", cursor: v ? "default" : "pointer", fontSize: 14, fontWeight: 700, color: v ? "#22C55E" : "#0A0A0F", fontFamily: "'Syne', sans-serif" }),
  shareBtn:   (l) => ({ background: "transparent", border: "1px solid rgba(232,197,71,0.3)", borderRadius: 10, padding: "13px 0", width: "100%", marginTop: 10, fontSize: 13, fontWeight: 700, color: l ? "#4B5563" : "#E8C547", cursor: l ? "not-allowed" : "pointer", fontFamily: "'Syne', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }),
  nextPmqs:   { background: "rgba(232,197,71,0.06)", border: "1px solid rgba(232,197,71,0.15)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" },
  nextPmqsL:  { fontSize: 12, color: "#6B7280" },
  nextPmqsR:  { fontSize: 13, fontWeight: 700, color: "#E8C547" },

  // MP champion box
  championBox:    { background: "linear-gradient(135deg, #0a1a0a, #0f2a0f)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 16, padding: "20px 24px", marginBottom: 16 },
  championHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 },
  championStar:   { fontSize: 16, color: "#22C55E" },
  championLabel:  { fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "#22C55E", textTransform: "uppercase" },
  championName:   { fontSize: 17, fontWeight: 700, color: "#F5F0E8", marginBottom: 4, fontFamily: "'Playfair Display', serif" },
  championMeta:   { fontSize: 13, color: "#9CA3AF", marginBottom: 12 },
  championDate:   { fontSize: 12, color: "#6B7280", fontStyle: "italic" },

  // pledge form
  pledgeBox:  { background: "#111118", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "20px 24px", marginBottom: 16 },
  pledgeTitle:{ fontSize: 13, fontWeight: 700, color: "#E8C547", marginBottom: 6 },
  pledgeSub:  { fontSize: 12, color: "#6B7280", marginBottom: 16, lineHeight: 1.5 },
  pledgeBtn:  (d) => ({ background: d ? "rgba(255,255,255,0.05)" : "rgba(34,197,94,0.15)", border: "1px solid " + (d ? "rgba(255,255,255,0.1)" : "rgba(34,197,94,0.4)"), borderRadius: 10, padding: "12px 0", width: "100%", fontSize: 13, fontWeight: 700, color: d ? "#4B5563" : "#22C55E", cursor: d ? "not-allowed" : "pointer", fontFamily: "'Syne', sans-serif", marginTop: 12 }),
  input:      { width: "100%", background: "#0A0A0F", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#E8E6E0", fontFamily: "'Syne', sans-serif", outline: "none", marginBottom: 10, boxSizing: "border-box" },
  select2:    { width: "100%", background: "#0A0A0F", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#E8E6E0", fontFamily: "'Syne', sans-serif", outline: "none", appearance: "none", marginBottom: 10, cursor: "pointer" },

  tlWrap:     { background: "#111118", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "24px 28px" },
  tlTitle:    { fontSize: 11, fontWeight: 700, color: "#4B5563", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 20 },
  tlItem:     { display: "flex", gap: 14, marginBottom: 18, position: "relative" },
  tlLine:     { position: "absolute", left: 7, top: 18, width: 1, height: "calc(100% + 4px)", background: "rgba(255,255,255,0.06)" },
  tlDot:      (c) => ({ width: 16, height: 16, borderRadius: "50%", background: c + "22", border: "1.5px solid " + c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: c, flexShrink: 0, marginTop: 2 }),
  tlDate:     { fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 2 },
  tlNote:     { fontSize: 13, color: "#9CA3AF", lineHeight: 1.5 },
  tlPending:  { background: "rgba(232,197,71,0.05)", border: "1px dashed rgba(232,197,71,0.2)", borderRadius: 8, padding: "10px 14px", marginTop: 8, fontSize: 12, color: "#6B7280" },

  // share card
  shareCard:  { position: "fixed", left: -9999, top: -9999, width: 600, background: "#0D1117", borderRadius: 16, overflow: "hidden", fontFamily: "'Syne', sans-serif" },
  scTop:      { padding: "24px 28px 20px" },
  scLogo:     { fontSize: 13, fontWeight: 700, color: "#E8C547", letterSpacing: "0.04em", marginBottom: 16 },
  scQ:        { fontSize: 17, fontWeight: 600, color: "#FFFFFF", lineHeight: 1.5, marginBottom: 20, fontStyle: "italic" },
  scStats:    { display: "flex", borderTop: "1px solid rgba(255,255,255,0.08)" },
  scStat:     { flex: 1, padding: "16px 20px", borderRight: "1px solid rgba(255,255,255,0.08)" },
  scStatLast: { flex: 1, padding: "16px 20px" },
  scStatV:    (r) => ({ fontSize: 26, fontWeight: 700, color: r ? "#EF4444" : "#FFFFFF", marginBottom: 4 }),
  scStatL:    { fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em" },
  scChampion: { background: "rgba(34,197,94,0.1)", borderTop: "1px solid rgba(34,197,94,0.2)", padding: "12px 28px", display: "flex", alignItems: "center", gap: 8 },
  scChampText:{ fontSize: 12, color: "#22C55E", fontWeight: 600 },
  scFooter:   { background: "#161b22", padding: "12px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  scFooterL:  { fontSize: 12, color: "#6B7280" },
  scFooterR:  { fontSize: 12, fontWeight: 700, color: "#E8C547" },

  submitCard: { background: "#111118", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 28 },
  label:      { fontSize: 12, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 },
  textarea:   { width: "100%", minHeight: 110, background: "#0A0A0F", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 14px", fontSize: 14, color: "#E8E6E0", fontFamily: "'Syne', sans-serif", outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6, display: "block" },
  select:     { width: "100%", background: "#0A0A0F", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "11px 14px", fontSize: 14, color: "#E8E6E0", fontFamily: "'Syne', sans-serif", outline: "none", appearance: "none", marginBottom: 20, cursor: "pointer" },
  dropdown:   { position: "absolute", top: "100%", left: 0, right: 0, background: "#1a1a24", border: "1px solid rgba(255,255,255,0.12)", borderTop: "none", borderRadius: "0 0 10px 10px", zIndex: 200, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" },
  dropItem:   (h) => ({ padding: "12px 16px", cursor: "pointer", background: h ? "rgba(232,197,71,0.08)" : "transparent", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.05)" }),
  dropText:   { fontSize: 13, color: "#E8E6E0", lineHeight: 1.4, flex: 1 },
  dropVotes:  { fontSize: 11, color: "#6B7280", whiteSpace: "nowrap", marginTop: 2 },
  dropNew:    { padding: "10px 16px", fontSize: 12, color: "#E8C547", fontWeight: 600 },
  aiBox:      { background: "rgba(232,197,71,0.05)", border: "1px solid rgba(232,197,71,0.2)", borderRadius: 10, padding: 20, marginTop: 16 },
  aiTitle:    { fontSize: 12, fontWeight: 700, color: "#E8C547", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 },
  aiItem:     { background: "#0A0A0F", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: 14, marginBottom: 8, cursor: "pointer" },
  aiItemQ:    { fontSize: 13, fontWeight: 500, color: "#E8E6E0", marginBottom: 4, lineHeight: 1.4 },
  aiItemR:    { fontSize: 11, color: "#6B7280", marginBottom: 8 },
  aiItemFt:   { display: "flex", justifyContent: "space-between", alignItems: "center" },
  joinBtn:    { fontSize: 11, fontWeight: 700, color: "#E8C547", background: "rgba(232,197,71,0.1)", border: "1px solid rgba(232,197,71,0.3)", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'Syne', sans-serif" },
  primaryBtn: (d) => ({ background: d ? "rgba(255,255,255,0.05)" : "#E8C547", border: "none", borderRadius: 10, padding: "13px 24px", fontSize: 13, fontWeight: 700, color: d ? "#4B5563" : "#0A0A0F", cursor: d ? "not-allowed" : "pointer", fontFamily: "'Syne', sans-serif" }),
  spinner:    { display: "inline-block", width: 13, height: 13, border: "2px solid rgba(232,197,71,0.3)", borderTopColor: "#E8C547", borderRadius: "50%", animation: "spin 0.8s linear infinite", verticalAlign: "middle", marginRight: 8 },
  successBox: { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 16, padding: 40, textAlign: "center" },
};

export default function App() {
  const [view, setView]               = useState("home");
  const [questions, setQuestions]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [votedIds, setVotedIds]       = useState(new Set());
  const [sortBy, setSortBy]           = useState("votes");
  const [activeTag, setActiveTag]     = useState("all");
  const [selectedQId, setSelectedQId] = useState(null);
  const [deflections, setDeflections] = useState({});
  const [submitText, setSubmitText]   = useState("");
  const [submitTag, setSubmitTag]     = useState("general");
  const [aiResult, setAiResult]       = useState(null);
  const [aiLoading, setAiLoading]     = useState(false);
  const [submitted, setSubmitted]     = useState(false);
  const [showDrop, setShowDrop]       = useState(false);
  const [dropHover, setDropHover]     = useState(-1);
  const [shareLoading, setShareLoading] = useState(false);

  // MP champion pledge form state
  const [showPledgeForm, setShowPledgeForm] = useState(false);
  const [pledgeName, setPledgeName]         = useState("");
  const [pledgeParty, setPledgeParty]       = useState("");
  const [pledgeConstituency, setPledgeConstituency] = useState("");
  const [pledgeSubmitting, setPledgeSubmitting]     = useState(false);
  const [pledgeSuccess, setPledgeSuccess]           = useState(false);

  const wrapRef      = useRef(null);
  const shareCardRef = useRef(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: qs }         = await supabase.from("questions").select("*").order("created_at", { ascending: true });
      const { data: voteCounts } = await supabase.from("question_vote_counts").select("*");
      const { data: defs }       = await supabase.from("deflections").select("*").order("created_at", { ascending: true });
      const { data: myVotes }    = await supabase.from("votes").select("question_id").eq("session_id", SESSION_ID);

      const voteMap = {};
      (voteCounts || []).forEach((v) => { voteMap[v.question_id] = parseInt(v.vote_count); });

      const defMap = {};
      (defs || []).forEach((d) => { if (!defMap[d.question_id]) defMap[d.question_id] = []; defMap[d.question_id].push(d); });
      setDeflections(defMap);

      setVotedIds(new Set((myVotes || []).map((v) => v.question_id)));
      setQuestions((qs || []).map((q) => ({ ...q, votes: voteMap[q.id] || 0, daysUnanswered: daysAgo(q.submitted_date), timesDeflected: q.times_deflected })));
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleVote = async (qid, e) => {
    if (e) e.stopPropagation();
    if (votedIds.has(qid)) return;
    setVotedIds((p) => new Set([...p, qid]));
    setQuestions((p) => p.map((q) => q.id === qid ? { ...q, votes: q.votes + 1 } : q));
    const { error } = await supabase.from("votes").insert({ question_id: qid, session_id: SESSION_ID });
    if (error) {
      setVotedIds((p) => { const n = new Set(p); n.delete(qid); return n; });
      setQuestions((p) => p.map((q) => q.id === qid ? { ...q, votes: q.votes - 1 } : q));
    }
  };

  // ── MP Champion pledge ──────────────────────────────────────────────────
  const handlePledge = async () => {
    if (!pledgeName.trim() || !pledgeParty || !pledgeConstituency.trim()) return;
    setPledgeSubmitting(true);
    const { error } = await supabase.from("questions").update({
      mp_champion_name: pledgeName.trim(),
      mp_champion_party: pledgeParty,
      mp_champion_constituency: pledgeConstituency.trim(),
      mp_champion_pledged_at: new Date().toISOString(),
    }).eq("id", selectedQId);

    if (!error) {
      await loadData();
      setPledgeSuccess(true);
      setShowPledgeForm(false);
      setPledgeName(""); setPledgeParty(""); setPledgeConstituency("");
    }
    setPledgeSubmitting(false);
  };

  // ── Share card ──────────────────────────────────────────────────────────
  const handleShare = async (q) => {
    setShareLoading(true);
    await new Promise((r) => setTimeout(r, 100));
    try {
      const canvas = await html2canvas(shareCardRef.current, { backgroundColor: "#0D1117", scale: 2, useCORS: true, logging: false });
      const link = document.createElement("a");
      link.download = `community-question-${q.id}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) { console.error(err); }
    setShareLoading(false);
  };

  const submitNew = async () => {
    const { data, error } = await supabase.from("questions")
      .insert({ text: submitText, tag: submitTag, status: "unanswered", submitted_date: new Date().toISOString().split("T")[0], times_deflected: 0 })
      .select().single();
    if (!error && data) {
      await supabase.from("deflections").insert({ question_id: data.id, event_date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), event_type: "submitted", note: "Question submitted by community" });
      await supabase.from("votes").insert({ question_id: data.id, session_id: SESSION_ID });
      await loadData();
    }
    setSubmitted(true); setSubmitText(""); setAiResult(null);
  };

  useEffect(() => {
    const fn = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDrop(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const getMatches = (text) => {
    if (text.trim().length < 4) return [];
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    return questions.map((q) => ({ ...q, score: words.reduce((s, w) => s + (q.text.toLowerCase().includes(w) ? 1 : 0), 0) }))
      .filter((q) => q.score > 0).sort((a, b) => b.score - a.score || b.votes - a.votes).slice(0, 4);
  };

  const joinFromDrop = (qid) => { handleVote(qid, null); setShowDrop(false); setSubmitText(""); setSelectedQId(qid); setView("question"); };
  const onTextChange = (e) => { const v = e.target.value; setSubmitText(v); if (aiResult) setAiResult(null); setShowDrop(v.trim().length >= 4); };
  const runAiCheck = async () => {
    if (submitText.trim().length < 20) return;
    setAiLoading(true); setShowDrop(false); setAiResult(null);
    try { setAiResult(await checkSimilar(submitText, questions)); } catch { setAiResult({ similar: [], isDistinct: true }); }
    setAiLoading(false);
  };
  const goHome = () => { setView("home"); setSubmitted(false); setPledgeSuccess(false); setShowPledgeForm(false); };

  const filtered      = questions.filter((q) => activeTag === "all" || q.tag === activeTag).sort((a, b) => sortBy === "votes" ? b.votes - a.votes : b.daysUnanswered - a.daysUnanswered);
  const topQuestion   = [...questions].sort((a, b) => b.votes - a.votes)[0];
  const totalVoices   = questions.reduce((s, q) => s + q.votes, 0);
  const totalUnanswered = questions.filter((q) => q.status === "unanswered").length;
  const totalDeflected  = questions.reduce((s, q) => s + (q.timesDeflected || 0), 0);
  const pmqsDate      = nextPMQs();
  const matches       = getMatches(submitText);
  const selectedQ     = questions.find((x) => x.id === selectedQId);
  const hasChampion   = selectedQ?.mp_champion_name;

  const QCard = ({ q }) => (
    <div style={S.qCard} onClick={() => { setSelectedQId(q.id); setView("question"); setPledgeSuccess(false); setShowPledgeForm(false); }}
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
          {q.mp_champion_name && <span style={S.pill("rgba(34,197,94,0.12)", "#22C55E")}>★ MP champion</span>}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,700&family=Syne:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`* {margin:0;padding:0;box-sizing:border-box} body{background:#0A0A0F} ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:#0A0A0F} ::-webkit-scrollbar-thumb{background:#2a2a3a;border-radius:3px} @keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* Hidden share card for html2canvas */}
      {selectedQ && (
        <div ref={shareCardRef} style={S.shareCard}>
          <div style={S.scTop}>
            <div style={S.scLogo}>CommunityQuestion.uk</div>
            <div style={S.scQ}>"{selectedQ.text}"</div>
          </div>
          <div style={S.scStats}>
            <div style={S.scStat}><div style={S.scStatV(false)}>{selectedQ.votes.toLocaleString()}</div><div style={S.scStatL}>people asking</div></div>
            <div style={S.scStat}><div style={S.scStatV(true)}>{selectedQ.daysUnanswered}</div><div style={S.scStatL}>days ignored</div></div>
            <div style={S.scStatLast}><div style={S.scStatV(true)}>{selectedQ.timesDeflected}×</div><div style={S.scStatL}>deflected</div></div>
          </div>
          {hasChampion && (
            <div style={S.scChampion}>
              <span style={{ fontSize: 14 }}>★</span>
              <span style={S.scChampText}>{selectedQ.mp_champion_name} MP ({selectedQ.mp_champion_party}) has pledged to raise this at PMQs</span>
            </div>
          )}
          <div style={S.scFooter}>
            <span style={S.scFooterL}>Directed at Keir Starmer · Prime Minister</span>
            <span style={S.scFooterR}>Add your voice →</span>
          </div>
        </div>
      )}

      <div style={S.app}>
        <nav style={S.nav}>
          <span style={S.logo} onClick={goHome}>Community<span style={S.logoY}>Question</span></span>
          <button style={S.navBtn} onClick={() => { setView("submit"); setSubmitted(false); setAiResult(null); setSubmitText(""); }}>Ask a question</button>
        </nav>

        {loading ? (
          <div style={S.loading}><span style={S.spinner} />Loading questions…</div>
        ) : (
          <>
            {view === "home" && (
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
                {topQuestion && (
                  <div style={S.topBanner}>
                    <div style={S.topEye}><div style={S.topDot} />Most wanted answer right now</div>
                    <p style={S.topQ}>"{topQuestion.text}"</p>
                    <div style={S.topStats}>
                      <div><div style={S.topVal(false)}>{topQuestion.votes.toLocaleString()}</div><div style={S.topLbl}>voices</div></div>
                      <div><div style={S.topVal(true)}>{topQuestion.daysUnanswered}</div><div style={S.topLbl}>days ignored</div></div>
                      <div><div style={S.topVal(true)}>{topQuestion.timesDeflected}×</div><div style={S.topLbl}>deflected</div></div>
                    </div>
                  </div>
                )}
                <div style={S.pmqsBanner}>
                  <span style={S.pmqsLeft}>Next PMQs — your chance to have this raised in parliament</span>
                  <span style={S.pmqsRight}>{pmqsDate}</span>
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
            )}

            {view === "question" && selectedQ && (
              <div style={S.page}>
                <button style={S.backBtn} onClick={goHome}>← Back to questions</button>

                <div style={S.detailHero}>
                  <div style={S.detailTag}>
                    <span style={S.pill("rgba(255,255,255,0.06)", "#9CA3AF")}>{selectedQ.tag}</span>
                    <span style={S.pill("rgba(239,68,68,0.12)", "#EF4444")}>unanswered</span>
                    {selectedQ.timesDeflected > 0 && <span style={S.pill("rgba(239,68,68,0.08)", "#F87171")}>deflected {selectedQ.timesDeflected}× at PMQs</span>}
                  </div>
                  <p style={S.detailQ}>"{selectedQ.text}"</p>
                  <div style={S.statGrid}>
                    <div style={S.statCard}><div style={S.scV(false)}>{selectedQ.votes.toLocaleString()}</div><div style={S.scL}>people asking</div></div>
                    <div style={S.statCard}><div style={S.scV(true)}>{selectedQ.daysUnanswered}</div><div style={S.scL}>days ignored</div></div>
                    <div style={S.statCard}><div style={S.scV(true)}>{selectedQ.timesDeflected}</div><div style={S.scL}>deflections</div></div>
                  </div>
                  <button style={S.bigVote(votedIds.has(selectedQ.id))} onClick={(e) => handleVote(selectedQ.id, e)} disabled={votedIds.has(selectedQ.id)}>
                    {votedIds.has(selectedQ.id) ? "✓  Your voice has been added" : "+  Add your voice to this question"}
                  </button>
                  <button style={S.shareBtn(shareLoading)} onClick={() => handleShare(selectedQ)} disabled={shareLoading}>
                    {shareLoading ? <><span style={S.spinner} />Generating share card…</> : "↗  Share this question"}
                  </button>
                </div>

                {/* MP Champion section */}
                {hasChampion ? (
                  <div style={S.championBox}>
                    <div style={S.championHeader}>
                      <span style={S.championStar}>★</span>
                      <span style={S.championLabel}>MP Champion</span>
                    </div>
                    <p style={S.championName}>{selectedQ.mp_champion_name} MP</p>
                    <p style={S.championMeta}>{selectedQ.mp_champion_party} · {selectedQ.mp_champion_constituency}</p>
                    <p style={S.championDate}>
                      Pledged to raise this question at PMQs
                      {selectedQ.mp_champion_pledged_at && ` on ${new Date(selectedQ.mp_champion_pledged_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
                    </p>
                  </div>
                ) : pledgeSuccess ? (
                  <div style={{ ...S.championBox, marginBottom: 16 }}>
                    <div style={S.championHeader}><span style={S.championStar}>★</span><span style={S.championLabel}>Pledge received</span></div>
                    <p style={{ fontSize: 14, color: "#9CA3AF" }}>Thank you. Your pledge has been recorded and will appear on this question shortly.</p>
                  </div>
                ) : (
                  <div style={S.pledgeBox}>
                    <p style={S.pledgeTitle}>★ Are you an MP? Champion this question.</p>
                    <p style={S.pledgeSub}>
                      {selectedQ.votes.toLocaleString()} people want this answered. Pledge to raise it at PMQs and your name will appear on this question and every share card.
                    </p>
                    {!showPledgeForm ? (
                      <button style={S.pledgeBtn(false)} onClick={() => setShowPledgeForm(true)}>
                        I'm an MP — I'll raise this question →
                      </button>
                    ) : (
                      <>
                        <input style={S.input} placeholder="Full name (e.g. Sarah Olney)" value={pledgeName} onChange={(e) => setPledgeName(e.target.value)} />
                        <select style={S.select2} value={pledgeParty} onChange={(e) => setPledgeParty(e.target.value)}>
                          <option value="">Select your party</option>
                          {PARTIES.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <input style={S.input} placeholder="Constituency (e.g. Richmond Park)" value={pledgeConstituency} onChange={(e) => setPledgeConstituency(e.target.value)} />
                        <button style={S.pledgeBtn(!pledgeName.trim() || !pledgeParty || !pledgeConstituency.trim() || pledgeSubmitting)}
                          onClick={handlePledge}
                          disabled={!pledgeName.trim() || !pledgeParty || !pledgeConstituency.trim() || pledgeSubmitting}
                        >
                          {pledgeSubmitting ? <><span style={S.spinner} />Submitting pledge…</> : "Confirm my pledge →"}
                        </button>
                        <button style={{ ...S.backBtn, marginTop: 10, marginBottom: 0 }} onClick={() => setShowPledgeForm(false)}>Cancel</button>
                      </>
                    )}
                  </div>
                )}

                <div style={S.nextPmqs}>
                  <span style={S.nextPmqsL}>Could be raised at the next PMQs</span>
                  <span style={S.nextPmqsR}>{pmqsDate}</span>
                </div>

                <div style={S.tlWrap}>
                  <p style={S.tlTitle}>Deflection timeline</p>
                  {(deflections[selectedQ.id] || []).map((h, i) => (
                    <div key={i} style={S.tlItem}>
                      {i < (deflections[selectedQ.id] || []).length - 1 && <div style={S.tlLine} />}
                      <div style={S.tlDot(histColor(h.event_type))}>{histIcon(h.event_type)}</div>
                      <div><div style={S.tlDate}>{h.event_date}</div><div style={S.tlNote}>{h.note}</div></div>
                    </div>
                  ))}
                  <div style={S.tlPending}>Waiting for a direct answer. Every Wednesday at PMQs this question could be raised.</div>
                </div>
              </div>
            )}

            {view === "submit" && (
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
                      <textarea style={S.textarea} placeholder="Be specific. Yes/no questions work best — they leave no room to dodge." value={submitText} onChange={onTextChange}
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
                            <div key={m.id} style={S.dropItem(dropHover === i)} onMouseEnter={() => setDropHover(i)} onMouseLeave={() => setDropHover(-1)} onMouseDown={(e) => { e.preventDefault(); joinFromDrop(m.id); }}>
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
                            <div key={id} style={S.aiItem} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(232,197,71,0.06)"} onMouseLeave={(e) => e.currentTarget.style.background = "#0A0A0F"}>
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
          </>
        )}
      </div>
    </>
  );
}
