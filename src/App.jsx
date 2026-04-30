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
const STOP_WORDS = new Set(["will","your","what","that","have","this","with","they","from","been","when","does","were","about","which","their","there","would","could","should","shall","into","over","more","some","than","then","also","just","even","much","such","very","only","well","both","each","most","many","these","those","being","having","doing","going","coming","getting","making","taking","giving","saying","knowing","thinking","feeling"]);

const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
const histIcon  = (t) => t === "submitted" ? "◎" : t === "deflected" ? "✕" : t === "champion" ? "★" : "✓";
const histColor = (t) => t === "submitted" ? "#555" : t === "deflected" ? "#FF3B3B" : t === "champion" ? "#22C55E" : "#22C55E";
const daysAgo   = (d) => !d ? 0 : Math.floor((new Date() - new Date(d)) / 86400000);
const fmtDate   = (d) => !d ? "" : new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const nextPMQs = () => {
  const today = new Date();
  const day = today.getDay();
  const daysUntilWed = day === 3 ? 0 : (3 - day + 7) % 7;
  const next = new Date(today);
  next.setDate(today.getDate() + daysUntilWed);
  return next.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

const R = "#FF3B3B";
const G = "#22C55E";

// ── Claude API ─────────────────────────────────────────────────────────────
const CLASSIFY_PROMPT = `You are helping a UK civic accountability platform. Given a question directed at the Prime Minister, return ONLY valid JSON:
{"tag":"<one of: welfare,NHS,accountability,pensioners,immigration,justice,environment,housing,education,economy,general>","quality":"<pass or fail>","failReason":"<if fail, one short sentence>"}
A question passes if it is a genuine coherent question relevant to a politician or government policy, not abusive or inappropriate. A question fails if it is gibberish, abusive, completely off-topic, or not a question.`;

const SIMILAR_PROMPT = `You are helping a UK civic accountability platform called Community Question. Find semantically similar questions to the one submitted. Return ONLY valid JSON:
{"similar":[{"id":<number>,"reason":"<one sentence>"}],"isDistinct":<boolean>,"canonicalSuggestion":"<string or null>"}
Existing questions: QUESTIONS_PLACEHOLDER`;

async function classifyQuestion(text) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 200, system: CLASSIFY_PROMPT, messages: [{ role: "user", content: `Question: "${text}"` }] }),
  });
  const data = await res.json();
  const raw = data.content?.find((b) => b.type === "text")?.text || "{}";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

async function checkSimilar(text, questions) {
  const system = SIMILAR_PROMPT.replace("QUESTIONS_PLACEHOLDER", JSON.stringify(questions.map((q) => ({ id: q.id, text: q.text }))));
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 800, system, messages: [{ role: "user", content: `New question: "${text}"` }] }),
  });
  const data = await res.json();
  const raw = data.content?.find((b) => b.type === "text")?.text || "{}";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

// ── Styles ─────────────────────────────────────────────────────────────────
const S = {
  app:        { minHeight: "100vh", background: "#0A0A0A", color: "#E8E6E0", fontFamily: "'Space Grotesk', sans-serif" },
  nav:        { position: "sticky", top: 0, zIndex: 100, background: "rgba(10,10,10,0.96)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 24px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo:       { fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer", letterSpacing: "0.02em", userSelect: "none" },
  logoR:      { color: R },
  navBtn:     { background: R, border: "none", borderRadius: 0, padding: "8px 16px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" },
  page:       { maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" },
  backBtn:    { background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#555", padding: 0, marginBottom: 24, display: "flex", alignItems: "center", gap: 6, fontFamily: "'Space Grotesk', sans-serif" },
  loading:    { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", fontSize: 13, color: "#555", fontFamily: "'Space Mono', monospace" },

  // hero
  heroWrap:   { borderLeft: `3px solid ${R}`, paddingLeft: 20, marginBottom: 32 },
  heroTag:    { fontFamily: "'Space Mono', monospace", fontSize: 10, color: R, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16 },
  heroPara:   { fontSize: 15, color: "#888", lineHeight: 1.8, marginBottom: 16, maxWidth: 560 },
  heroStatement: { fontSize: 15, fontWeight: 600, color: "#fff", lineHeight: 1.7, marginBottom: 20, maxWidth: 560 },
  heroCta:    { fontFamily: "'Space Mono', monospace", fontSize: 12, color: "#555", letterSpacing: "0.02em" },

  strip:      { background: R, padding: "16px 20px", margin: "0 -20px 32px", display: "flex", gap: 0, justifyContent: "space-around", textAlign: "center", flexWrap: "nowrap" },
  stripItem:  { flex: 1, padding: "0 8px" },
  stripVal:   { fontFamily: "'Space Mono', monospace", fontSize: "clamp(16px,3.5vw,24px)", fontWeight: 700, color: "#fff", lineHeight: 1 },
  stripLbl:   { fontSize: "clamp(8px,1.4vw,10px)", color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 },

  topBanner:  { background: "#111", border: `1px solid rgba(255,255,255,0.05)`, borderLeft: `3px solid ${R}`, padding: "20px 24px", marginBottom: 2, cursor: "pointer" },
  topLabel:   { fontFamily: "'Space Mono', monospace", fontSize: 10, color: R, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 },
  topQ:       { fontSize: 15, fontWeight: 600, color: "#fff", lineHeight: 1.5, marginBottom: 16 },
  topStats:   { display: "flex", gap: 28, flexWrap: "wrap" },
  topVal:     (r) => ({ fontFamily: "'Space Mono', monospace", fontSize: 22, fontWeight: 700, color: r ? R : "#fff", lineHeight: 1 }),
  topLbl:     { fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 },

  pmqsBanner: { background: `rgba(255,59,59,0.06)`, border: `1px solid rgba(255,59,59,0.15)`, padding: "10px 16px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  pmqsLeft:   { fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#555" },
  pmqsRight:  { fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, color: R },

  ctrlRow:    { display: "flex", gap: 4, marginBottom: 12, alignItems: "center", flexWrap: "wrap" },
  sortBtn:    (a) => ({ background: a ? R : "transparent", border: `1px solid ${a ? R : "rgba(255,255,255,0.08)"}`, borderRadius: 0, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: a ? "#fff" : "#555", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" }),
  tagBtn:     (a) => ({ background: a ? `rgba(255,59,59,0.1)` : "transparent", border: `1px solid ${a ? "rgba(255,59,59,0.3)" : "rgba(255,255,255,0.06)"}`, borderRadius: 0, padding: "3px 10px", fontSize: 10, fontWeight: a ? 700 : 400, color: a ? R : "#444", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }),
  divV:       { width: 1, height: 18, background: "rgba(255,255,255,0.08)", margin: "0 2px" },

  qCard:      { background: "#111", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 0, padding: "18px 20px", marginBottom: 2, cursor: "pointer", display: "flex", gap: 16, alignItems: "flex-start" },
  voteCol:    { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 52, flexShrink: 0 },
  voteBtn:    (v) => ({ width: 38, height: 30, borderRadius: 0, border: v ? "none" : "1px solid rgba(255,255,255,0.1)", background: v ? G : "transparent", cursor: v ? "default" : "pointer", fontSize: 11, fontWeight: 700, color: v ? "#fff" : "#555", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Mono', monospace" }),
  voteCount:  { fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color: "#fff" },
  voteLbl:    { fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" },
  qBody:      { flex: 1, minWidth: 0 },
  qText:      { fontSize: 14, color: "#bbb", lineHeight: 1.55, marginBottom: 6 },
  qDate:      { fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#333", marginBottom: 8 },
  qMeta:      { display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" },
  pill:       (bg, c) => ({ fontFamily: "'Space Mono', monospace", fontSize: 9, background: bg, color: c, borderRadius: 0, padding: "2px 7px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }),

  detailHero: { background: "#111", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 0, padding: 28, marginBottom: 2 },
  detailTag:  { display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" },
  detailDate: { fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#333", marginBottom: 14 },
  detailQ:    { fontSize: "clamp(16px,3vw,20px)", fontWeight: 600, color: "#fff", lineHeight: 1.45, marginBottom: 24 },
  statGrid:   { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 20 },
  statCard:   { background: "#0A0A0A", padding: "14px 16px" },
  scV:        (r) => ({ fontFamily: "'Space Mono', monospace", fontSize: 26, fontWeight: 700, color: r ? R : "#fff", marginBottom: 2 }),
  scL:        { fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em" },
  bigVote:    (v) => ({ width: "100%", padding: "13px 0", border: "none", borderRadius: 0, background: v ? "rgba(34,197,94,0.12)" : R, cursor: v ? "default" : "pointer", fontSize: 13, fontWeight: 700, color: v ? G : "#fff", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" }),
  shareBtn:   (l) => ({ background: "transparent", border: `1px solid rgba(255,59,59,0.3)`, borderRadius: 0, padding: "12px 0", width: "100%", marginTop: 6, fontSize: 12, fontWeight: 700, color: l ? "#444" : R, cursor: l ? "not-allowed" : "pointer", fontFamily: "'Space Grotesk', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textTransform: "uppercase", letterSpacing: "0.04em" }),
  reportBtn:  { background: "transparent", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 0, padding: "8px 0", width: "100%", marginTop: 6, fontSize: 11, fontWeight: 700, color: "#333", cursor: "pointer", fontFamily: "'Space Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em" },

  nextPmqs:   { background: "rgba(255,59,59,0.05)", border: "1px solid rgba(255,59,59,0.12)", padding: "11px 16px", marginBottom: 2, display: "flex", alignItems: "center", justifyContent: "space-between" },
  nextPmqsL:  { fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#555" },
  nextPmqsR:  { fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, color: R },

  championBox:   { background: "#111", border: "1px solid rgba(34,197,94,0.2)", borderLeft: "3px solid #22C55E", padding: "20px 24px", marginBottom: 2 },
  championLabel: { fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: G, textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 },
  championName:  { fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 4 },
  championMeta:  { fontSize: 13, color: "#888", marginBottom: 8 },
  championDate:  { fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#555", marginBottom: 12 },
  copyLinkBtn:   { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 0, padding: "8px 16px", fontSize: 11, fontWeight: 700, color: G, cursor: "pointer", fontFamily: "'Space Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em" },

  pledgeBox:  { background: "#111", border: "1px solid rgba(255,255,255,0.06)", padding: "20px 24px", marginBottom: 2 },
  pledgeTitle:{ fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, color: R, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" },
  pledgeSub:  { fontSize: 13, color: "#666", marginBottom: 16, lineHeight: 1.6 },
  pledgeBtn:  (d) => ({ background: d ? "rgba(255,255,255,0.03)" : "rgba(34,197,94,0.12)", border: `1px solid ${d ? "rgba(255,255,255,0.06)" : "rgba(34,197,94,0.3)"}`, borderRadius: 0, padding: "12px 0", width: "100%", fontSize: 12, fontWeight: 700, color: d ? "#333" : G, cursor: d ? "not-allowed" : "pointer", fontFamily: "'Space Grotesk', sans-serif", marginTop: 10, textTransform: "uppercase", letterSpacing: "0.04em" }),
  input:      { width: "100%", background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 0, padding: "10px 12px", fontSize: 13, color: "#E8E6E0", fontFamily: "'Space Grotesk', sans-serif", outline: "none", marginBottom: 8, boxSizing: "border-box" },
  select2:    { width: "100%", background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 0, padding: "10px 12px", fontSize: 13, color: "#E8E6E0", fontFamily: "'Space Grotesk', sans-serif", outline: "none", appearance: "none", marginBottom: 8, cursor: "pointer" },

  tlWrap:     { background: "#111", border: "1px solid rgba(255,255,255,0.05)", padding: "24px 28px" },
  tlTitle:    { fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, color: "#333", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 20 },
  tlItem:     { display: "flex", gap: 14, marginBottom: 18, position: "relative" },
  tlLine:     { position: "absolute", left: 7, top: 18, width: 1, height: "calc(100% + 4px)", background: "rgba(255,255,255,0.05)" },
  tlDot:      (c) => ({ width: 16, height: 16, borderRadius: 0, background: c + "18", border: `1.5px solid ${c}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: c, flexShrink: 0, marginTop: 2 }),
  tlDate:     { fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, color: "#444", marginBottom: 3 },
  tlNote:     { fontSize: 13, color: "#888", lineHeight: 1.55 },
  tlPending:  { background: "rgba(255,59,59,0.04)", border: "1px dashed rgba(255,59,59,0.2)", padding: "10px 14px", marginTop: 8, fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#555" },

  shareCardWrap: { position: "fixed", left: -9999, top: -9999, width: 600, background: "#0D1117", overflow: "hidden", fontFamily: "'Space Grotesk', sans-serif" },
  scTop:      { padding: "24px 28px 20px" },
  scLogo:     { fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700, color: R, letterSpacing: "0.06em", marginBottom: 16 },
  scQ:        { fontSize: 16, fontWeight: 600, color: "#fff", lineHeight: 1.5, marginBottom: 20 },
  scStats:    { display: "flex", borderTop: "1px solid rgba(255,255,255,0.08)" },
  scStat:     { flex: 1, padding: "16px 20px", borderRight: "1px solid rgba(255,255,255,0.08)" },
  scStatLast: { flex: 1, padding: "16px 20px" },
  scStatV:    (r) => ({ fontFamily: "'Space Mono', monospace", fontSize: 26, fontWeight: 700, color: r ? R : "#fff", marginBottom: 4 }),
  scStatL:    { fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em" },
  scChampion: { background: "rgba(34,197,94,0.08)", borderTop: "1px solid rgba(34,197,94,0.15)", padding: "10px 28px", display: "flex", alignItems: "center", gap: 8 },
  scChampText:{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: G, fontWeight: 700 },
  scFooter:   { background: "#161b22", padding: "12px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  scFooterL:  { fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#444" },
  scFooterR:  { fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, color: R },

  submitCard: { background: "#111", border: "1px solid rgba(255,255,255,0.06)", padding: 28 },
  label:      { fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 },
  textarea:   { width: "100%", minHeight: 110, background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 0, padding: "12px 14px", fontSize: 14, color: "#E8E6E0", fontFamily: "'Space Grotesk', sans-serif", outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6, display: "block" },
  dropdown:   { position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", zIndex: 200, maxHeight: 280, overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" },
  dropItem:   (h) => ({ padding: "12px 16px", cursor: "pointer", background: h ? "rgba(255,59,59,0.08)" : "transparent", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.04)" }),
  dropText:   { fontSize: 13, color: "#bbb", lineHeight: 1.4, flex: 1 },
  dropVotes:  { fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#444", whiteSpace: "nowrap", marginTop: 2 },
  dropNone:   { padding: "12px 16px", fontFamily: "'Space Mono', monospace", fontSize: 11, color: R, fontWeight: 700, cursor: "pointer", borderTop: "1px solid rgba(255,59,59,0.15)", background: "rgba(255,59,59,0.04)" },
  aiBox:      { background: "rgba(255,59,59,0.04)", border: "1px solid rgba(255,59,59,0.15)", padding: 20, marginTop: 12 },
  aiTitle:    { fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, color: R, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 },
  aiItem:     { background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.05)", padding: 14, marginBottom: 6 },
  aiItemQ:    { fontSize: 13, color: "#bbb", marginBottom: 4, lineHeight: 1.4 },
  aiItemR:    { fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#444", marginBottom: 8 },
  aiItemFt:   { display: "flex", justifyContent: "space-between", alignItems: "center" },
  joinBtn:    { fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, color: R, background: "rgba(255,59,59,0.08)", border: "1px solid rgba(255,59,59,0.2)", borderRadius: 0, padding: "4px 10px", cursor: "pointer" },
  primaryBtn: (d) => ({ background: d ? "rgba(255,255,255,0.03)" : R, border: "none", borderRadius: 0, padding: "13px 24px", fontSize: 12, fontWeight: 700, color: d ? "#333" : "#fff", cursor: d ? "not-allowed" : "pointer", fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" }),
  spinner:    { display: "inline-block", width: 12, height: 12, border: "2px solid rgba(255,59,59,0.3)", borderTopColor: R, borderRadius: "50%", animation: "spin 0.8s linear infinite", verticalAlign: "middle", marginRight: 8 },
  successBox: { background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", padding: 40, textAlign: "center" },
  errorBox:   { background: "rgba(255,59,59,0.06)", border: "1px solid rgba(255,59,59,0.2)", padding: 20, marginTop: 12 },
  errorTitle: { fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, color: R, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 },
  errorText:  { fontSize: 13, color: "#888", lineHeight: 1.6 },
  loadingBox: { background: "rgba(255,59,59,0.04)", border: "1px solid rgba(255,59,59,0.15)", padding: "24px 20px", marginTop: 12, textAlign: "center" },
};

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]                 = useState("home");
  const [questions, setQuestions]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [votedIds, setVotedIds]         = useState(new Set());
  const [reportedIds, setReportedIds]   = useState(new Set());
  const [sortBy, setSortBy]             = useState("votes");
  const [activeTag, setActiveTag]       = useState("all");
  const [selectedQId, setSelectedQId]   = useState(null);
  const [deflections, setDeflections]   = useState({});
  const [submitText, setSubmitText]     = useState("");
  const [submitTag, setSubmitTag]       = useState("");
  const [aiResult, setAiResult]         = useState(null);
  const [aiLoading, setAiLoading]       = useState(false);
  const [submitted, setSubmitted]       = useState(false);
  const [showDrop, setShowDrop]         = useState(false);
  const [dropHover, setDropHover]       = useState(-1);
  const [shareLoading, setShareLoading] = useState(false);
  const [qualityError, setQualityError] = useState("");
  const [autoChecked, setAutoChecked]   = useState(false);
  const [copySuccess, setCopySuccess]   = useState(false);
  const [showPledgeForm, setShowPledgeForm]         = useState(false);
  const [pledgeName, setPledgeName]                 = useState("");
  const [pledgeParty, setPledgeParty]               = useState("");
  const [pledgeConstituency, setPledgeConstituency] = useState("");
  const [pledgeSubmitting, setPledgeSubmitting]     = useState(false);
  const [pledgeSuccess, setPledgeSuccess]           = useState(false);
  const wrapRef      = useRef(null);
  const shareCardRef = useRef(null);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [view, selectedQId]);

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

  const handleReport = async (qid) => {
    if (reportedIds.has(qid)) return;
    setReportedIds((p) => new Set([...p, qid]));
    await supabase.from("deflections").insert({ question_id: qid, event_date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), event_type: "reported", note: "Reported by a community member as potentially inappropriate" });
  };

  const handlePledge = async () => {
    if (!pledgeName.trim() || !pledgeParty || !pledgeConstituency.trim()) return;
    setPledgeSubmitting(true);
    const { error } = await supabase.from("questions").update({
      mp_champion_name: pledgeName.trim(), mp_champion_party: pledgeParty,
      mp_champion_constituency: pledgeConstituency.trim(), mp_champion_pledged_at: new Date().toISOString(),
    }).eq("id", selectedQId);
    if (!error) {
      await supabase.from("deflections").insert({
        question_id: selectedQId,
        event_date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        event_type: "champion",
        note: `${pledgeName.trim()} MP (${pledgeParty}) pledged to raise this question at PMQs`,
      });
      await loadData();
      setPledgeSuccess(true); setShowPledgeForm(false);
      setPledgeName(""); setPledgeParty(""); setPledgeConstituency("");
    }
    setPledgeSubmitting(false);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}?q=${selectedQId}`);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

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

  const runAiCheck = async () => {
    if (submitText.trim().length < 20) return;
    setAiLoading(true); setShowDrop(false); setAiResult(null); setQualityError("");
    try {
      const classify = await classifyQuestion(submitText);
      if (classify.quality === "fail") {
        setQualityError(classify.failReason || "This doesn't look like a valid question directed at the Prime Minister.");
        setAiLoading(false);
        return;
      }
      if (classify.tag) setSubmitTag(classify.tag);
      const similar = await checkSimilar(submitText, questions);
      setAiResult(similar);
    } catch { setAiResult({ similar: [], isDistinct: true }); }
    setAiLoading(false);
  };

  const submitNew = async () => {
    const { data, error } = await supabase.from("questions")
      .insert({ text: submitText, tag: submitTag || "general", status: "unanswered", submitted_date: new Date().toISOString().split("T")[0], times_deflected: 0 })
      .select().single();
    if (!error && data) {
      await supabase.from("deflections").insert({ question_id: data.id, event_date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), event_type: "submitted", note: "Question submitted by community" });
      await supabase.from("votes").insert({ question_id: data.id, session_id: SESSION_ID });
      await loadData();
    }
    setSubmitted(true); setSubmitText(""); setAiResult(null); setSubmitTag("");
  };

  useEffect(() => {
    const fn = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDrop(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const getMatches = (text) => {
    if (text.trim().length < 4) return [];
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 4 && !STOP_WORDS.has(w));
    if (words.length === 0) return [];
    return questions.map((q) => ({ ...q, score: words.reduce((s, w) => s + (q.text.toLowerCase().includes(w) ? 1 : 0), 0) }))
      .filter((q) => q.score > 0).sort((a, b) => b.score - a.score || b.votes - a.votes).slice(0, 4);
  };

  const joinFromDrop = (qid) => { handleVote(qid, null); setShowDrop(false); setSubmitText(""); setSelectedQId(qid); setView("question"); };

  const onTextChange = (e) => {
    const v = e.target.value;
    setSubmitText(v);
    if (aiResult) setAiResult(null);
    if (qualityError) setQualityError("");
    if (submitTag) setSubmitTag("");
    setAutoChecked(false);
    setShowDrop(v.trim().length >= 4);
  };

  const goHome = () => { setView("home"); setSubmitted(false); setPledgeSuccess(false); setShowPledgeForm(false); setCopySuccess(false); };

  const getSorted = (qs) => {
    if (sortBy === "votes")  return [...qs].sort((a, b) => b.votes - a.votes);
    if (sortBy === "days")   return [...qs].sort((a, b) => b.daysUnanswered - a.daysUnanswered);
    if (sortBy === "recent") return [...qs].sort((a, b) => new Date(b.submitted_date) - new Date(a.submitted_date));
    return qs;
  };

  const filtered      = getSorted(questions.filter((q) => activeTag === "all" || q.tag === activeTag));
  const topQuestion   = [...questions].sort((a, b) => b.votes - a.votes)[0];
  const totalVoices   = questions.reduce((s, q) => s + q.votes, 0);
  const totalUnanswered = questions.filter((q) => q.status === "unanswered").length;
  const totalDeflected  = questions.reduce((s, q) => s + (q.timesDeflected || 0), 0);
  const pmqsDate      = nextPMQs();
  const matches       = getMatches(submitText);
  const selectedQ     = questions.find((x) => x.id === selectedQId);
  const hasChampion   = selectedQ?.mp_champion_name;

  const QCard = ({ q }) => (
    <div style={S.qCard}
      onClick={() => { setSelectedQId(q.id); setView("question"); setPledgeSuccess(false); setShowPledgeForm(false); }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,59,59,0.25)"; e.currentTarget.style.background = "#141414"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)"; e.currentTarget.style.background = "#111"; }}
    >
      <div style={S.voteCol}>
        <button style={S.voteBtn(votedIds.has(q.id))} onClick={(e) => handleVote(q.id, e)}>{votedIds.has(q.id) ? "✓" : "+1"}</button>
        <span style={S.voteCount}>{fmt(q.votes)}</span>
        <span style={S.voteLbl}>voices</span>
      </div>
      <div style={S.qBody}>
        <p style={S.qText}>{q.text}</p>
        <p style={S.qDate}>// First asked {fmtDate(q.submitted_date)}</p>
        <div style={S.qMeta}>
          <span style={S.pill("rgba(255,255,255,0.04)", "#555")}>{q.tag}</span>
          {q.daysUnanswered > 0 && <span style={S.pill("rgba(255,59,59,0.1)", R)}>{q.daysUnanswered}d ignored</span>}
          {q.timesDeflected > 0 && <span style={S.pill("rgba(255,59,59,0.06)", "#FF6B6B")}>dodged {q.timesDeflected}×</span>}
          {q.mp_champion_name && <span style={S.pill("rgba(34,197,94,0.1)", G)}>★ MP champion</span>}
          {q.status === "answered" && <span style={S.pill("rgba(34,197,94,0.15)", G)}>✓ answered</span>}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <style>{`* {margin:0;padding:0;box-sizing:border-box} body{background:#0A0A0A} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0A0A0A} ::-webkit-scrollbar-thumb{background:#222} @keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {selectedQ && (
        <div ref={shareCardRef} style={S.shareCardWrap}>
          <div style={S.scTop}>
            <div style={S.scLogo}>COMMUNITYQUESTION.UK</div>
            <div style={S.scQ}>"{selectedQ.text}"</div>
          </div>
          <div style={S.scStats}>
            <div style={S.scStat}><div style={S.scStatV(false)}>{selectedQ.votes.toLocaleString()}</div><div style={S.scStatL}>people asking</div></div>
            <div style={S.scStat}><div style={S.scStatV(true)}>{selectedQ.daysUnanswered}</div><div style={S.scStatL}>days ignored</div></div>
            <div style={S.scStatLast}><div style={S.scStatV(true)}>{selectedQ.timesDeflected}×</div><div style={S.scStatL}>dodged</div></div>
          </div>
          {hasChampion && (
            <div style={S.scChampion}>
              <span style={{ fontSize: 12, color: G }}>★</span>
              <span style={S.scChampText}>{selectedQ.mp_champion_name} MP ({selectedQ.mp_champion_party}) pledged to raise this at PMQs</span>
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
          <span style={S.logo} onClick={goHome}>COMMUNITY<span style={S.logoR}>QUESTION</span></span>
          <button style={S.navBtn} onClick={() => { setView("submit"); setSubmitted(false); setAiResult(null); setSubmitText(""); setQualityError(""); setAutoChecked(false); }}>Ask a question</button>
        </nav>

        {loading ? (
          <div style={S.loading}>// loading questions…</div>
        ) : (
          <>
            {/* ── HOME ── */}
            {view === "home" && (
              <div style={S.page}>
                <div style={S.heroWrap}>
                  <div style={S.heroTag}>// Community Question</div>
                  <p style={S.heroPara}>Every day, thousands of people are asking the same questions — scattered, individual, easy to ignore. We bring those voices together. One question. One number. One permanent public record that grows every day it goes unanswered.</p>
                  <p style={S.heroStatement}>They have no obligation to answer. But everyone can see that they haven't.</p>
                  <p style={S.heroCta}>Add your voice to a question already being asked — or submit one that hasn't been yet.</p>
                </div>

                <div style={S.strip}>
                  <div style={S.stripItem}><div style={S.stripVal}>{totalVoices.toLocaleString()}</div><div style={S.stripLbl}>voices demanding answers</div></div>
                  <div style={S.stripItem}><div style={S.stripVal}>{totalUnanswered}</div><div style={S.stripLbl}>questions unanswered</div></div>
                  <div style={S.stripItem}><div style={S.stripVal}>{totalDeflected}</div><div style={S.stripLbl}>times dodged</div></div>
                </div>

                {topQuestion && (
                  <div style={S.topBanner}
                    onClick={() => { setSelectedQId(topQuestion.id); setView("question"); }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(255,59,59,0.4)"}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)"}
                  >
                    <div style={S.topLabel}>// Most wanted answer right now</div>
                    <p style={S.topQ}>"{topQuestion.text}"</p>
                    <div style={S.topStats}>
                      <div><div style={S.topVal(false)}>{topQuestion.votes.toLocaleString()}</div><div style={S.topLbl}>voices</div></div>
                      <div><div style={S.topVal(true)}>{topQuestion.daysUnanswered}</div><div style={S.topLbl}>days ignored</div></div>
                      <div><div style={S.topVal(true)}>{topQuestion.timesDeflected}×</div><div style={S.topLbl}>dodged</div></div>
                    </div>
                  </div>
                )}

                <div style={S.pmqsBanner}>
                  <span style={S.pmqsLeft}>// next PMQs</span>
                  <span style={S.pmqsRight}>{pmqsDate} — will they answer this time?</span>
                </div>

                <div style={S.ctrlRow}>
                  <button style={S.sortBtn(sortBy === "votes")}  onClick={() => setSortBy("votes")}>Most voices</button>
                  <button style={S.sortBtn(sortBy === "days")}   onClick={() => setSortBy("days")}>Longest ignored</button>
                  <button style={S.sortBtn(sortBy === "recent")} onClick={() => setSortBy("recent")}>Most recent</button>
                  <div style={S.divV} />
                  {TAGS.map((t) => <button key={t} style={S.tagBtn(activeTag === t)} onClick={() => setActiveTag(t)}>{t}</button>)}
                </div>

                {filtered.map((q) => <QCard key={q.id} q={q} />)}

                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: 32, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#333" }}>// communityquestion.uk</span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: R }}>No more dark corners. Nowhere left to hide.</span>
                </div>
              </div>
            )}

            {/* ── QUESTION DETAIL ── */}
            {view === "question" && selectedQ && (
              <div style={S.page}>
                <button style={S.backBtn} onClick={goHome}>← Back</button>
                <div style={S.detailHero}>
                  <div style={S.detailTag}>
                    <span style={S.pill("rgba(255,255,255,0.04)", "#555")}>{selectedQ.tag}</span>
                    {selectedQ.status === "answered"
                      ? <span style={S.pill("rgba(34,197,94,0.15)", G)}>✓ answered</span>
                      : <span style={S.pill("rgba(255,59,59,0.1)", R)}>unanswered</span>}
                    {selectedQ.timesDeflected > 0 && <span style={S.pill("rgba(255,59,59,0.06)", "#FF6B6B")}>dodged {selectedQ.timesDeflected}× at PMQs</span>}
                  </div>
                  <p style={S.detailDate}>// First asked {fmtDate(selectedQ.submitted_date)}</p>
                  <p style={S.detailQ}>"{selectedQ.text}"</p>
                  <div style={S.statGrid}>
                    <div style={S.statCard}><div style={S.scV(false)}>{selectedQ.votes.toLocaleString()}</div><div style={S.scL}>people asking</div></div>
                    <div style={S.statCard}><div style={S.scV(true)}>{selectedQ.daysUnanswered}</div><div style={S.scL}>days ignored</div></div>
                    <div style={S.statCard}><div style={S.scV(true)}>{selectedQ.timesDeflected}</div><div style={S.scL}>times dodged</div></div>
                  </div>
                  <button style={S.bigVote(votedIds.has(selectedQ.id))} onClick={(e) => handleVote(selectedQ.id, e)} disabled={votedIds.has(selectedQ.id)}>
                    {votedIds.has(selectedQ.id) ? "✓  Your voice has been added" : "+  Add your voice"}
                  </button>
                  <button style={S.shareBtn(shareLoading)} onClick={() => handleShare(selectedQ)} disabled={shareLoading}>
                    {shareLoading ? <><span style={S.spinner} />Generating…</> : "↗  Share this question"}
                  </button>
                  <button style={S.reportBtn} onClick={() => handleReport(selectedQ.id)}>
                    {reportedIds.has(selectedQ.id) ? "// Reported — thank you" : "// Report this question as inappropriate"}
                  </button>
                </div>

                {hasChampion ? (
                  <div style={S.championBox}>
                    <div style={S.championLabel}><span style={{ color: G }}>★</span> MP Champion</div>
                    <p style={S.championName}>{selectedQ.mp_champion_name} MP</p>
                    <p style={S.championMeta}>{selectedQ.mp_champion_party} · {selectedQ.mp_champion_constituency}</p>
                    <p style={S.championDate}>Pledged to raise this question at PMQs{selectedQ.mp_champion_pledged_at && ` on ${new Date(selectedQ.mp_champion_pledged_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}</p>
                    <button style={S.copyLinkBtn} onClick={handleCopyLink}>{copySuccess ? "✓ Link copied!" : "// Copy question link"}</button>
                  </div>
                ) : pledgeSuccess ? (
                  <div style={{ ...S.championBox, marginBottom: 2 }}>
                    <div style={S.championLabel}><span style={{ color: G }}>★</span> Pledge received</div>
                    <p style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>Thank you. Your pledge has been recorded.</p>
                    <button style={S.copyLinkBtn} onClick={handleCopyLink}>{copySuccess ? "✓ Link copied!" : "// Copy question link to share"}</button>
                  </div>
                ) : (
                  <div style={S.pledgeBox}>
                    <p style={S.pledgeTitle}>// Are you an MP? Champion this question.</p>
                    <p style={S.pledgeSub}>{selectedQ.votes.toLocaleString()} people want this answered. Pledge to raise it at PMQs and your name appears on this question and every share card.</p>
                    {!showPledgeForm ? (
                      <button style={S.pledgeBtn(false)} onClick={() => setShowPledgeForm(true)}>I'm an MP — I'll raise this →</button>
                    ) : (
                      <>
                        <input style={S.input} placeholder="Full name (e.g. Sarah Olney)" value={pledgeName} onChange={(e) => setPledgeName(e.target.value)} />
                        <select style={S.select2} value={pledgeParty} onChange={(e) => setPledgeParty(e.target.value)}>
                          <option value="">Select your party</option>
                          {PARTIES.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <input style={S.input} placeholder="Constituency" value={pledgeConstituency} onChange={(e) => setPledgeConstituency(e.target.value)} />
                        <button style={S.pledgeBtn(!pledgeName.trim() || !pledgeParty || !pledgeConstituency.trim() || pledgeSubmitting)} onClick={handlePledge} disabled={!pledgeName.trim() || !pledgeParty || !pledgeConstituency.trim() || pledgeSubmitting}>
                          {pledgeSubmitting ? <><span style={S.spinner} />Submitting…</> : "Confirm pledge →"}
                        </button>
                        <button style={{ ...S.backBtn, marginTop: 10, marginBottom: 0 }} onClick={() => setShowPledgeForm(false)}>Cancel</button>
                      </>
                    )}
                  </div>
                )}

                <div style={S.nextPmqs}>
                  <span style={S.nextPmqsL}>// next PMQs</span>
                  <span style={S.nextPmqsR}>{pmqsDate}</span>
                </div>

                <div style={S.tlWrap}>
                  <p style={S.tlTitle}>// Deflection timeline</p>
                  {(deflections[selectedQ.id] || []).map((h, i) => (
                    <div key={i} style={S.tlItem}>
                      {i < (deflections[selectedQ.id] || []).length - 1 && <div style={S.tlLine} />}
                      <div style={S.tlDot(histColor(h.event_type))}>{histIcon(h.event_type)}</div>
                      <div><div style={S.tlDate}>{h.event_date}</div><div style={S.tlNote}>{h.note}</div></div>
                    </div>
                  ))}
                  <div style={S.tlPending}>// Waiting for a direct answer. Every Wednesday at PMQs this question could be raised.</div>
                </div>
              </div>
            )}

            {/* ── SUBMIT ── */}
            {view === "submit" && (
              <div style={S.page}>
                <button style={S.backBtn} onClick={() => { goHome(); setAiResult(null); setSubmitText(""); setQualityError(""); setAutoChecked(false); }}>← Back</button>
                <div style={{ borderLeft: `3px solid ${R}`, paddingLeft: 20, marginBottom: 28 }}>
                  <div style={S.heroTag}>// Ask a question</div>
                  <h2 style={{ fontSize: "clamp(24px,4vw,32px)", fontWeight: 700, color: "#fff", letterSpacing: "-1px", marginBottom: 10 }}>Make them <span style={{ color: R }}>answer.</span></h2>
                  <p style={{ fontSize: 13, color: "#555", lineHeight: 1.7 }}>Be specific. Yes/no questions work best — they leave no room to dodge. If your question has already been asked, add your voice to it instead.</p>
                </div>

                {submitted ? (
                  <div style={S.successBox}>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 32, color: G, marginBottom: 12 }}>✓</div>
                    <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, color: G, marginBottom: 8 }}>Question submitted.</p>
                    <p style={{ fontSize: 13, color: "#555", marginBottom: 24 }}>Your voice has been added. Share it to build momentum.</p>
                    <button style={S.primaryBtn(false)} onClick={() => { setSubmitted(false); goHome(); }}>Back to questions</button>
                  </div>
                ) : (
                  <div style={S.submitCard}>
                    <label style={S.label}>Your question for Keir Starmer</label>
                    <div ref={wrapRef} style={{ position: "relative", marginBottom: 16 }}>
                      <textarea
                        style={S.textarea}
                        placeholder='e.g. "Will you scrap the two-child benefit cap — yes or no?"'
                        value={submitText}
                        onChange={onTextChange}
                        onKeyDown={(e) => {
                          if (!showDrop || matches.length === 0) return;
                          if (e.key === "ArrowDown") { e.preventDefault(); setDropHover((h) => Math.min(h + 1, matches.length)); }
                          if (e.key === "ArrowUp")   { e.preventDefault(); setDropHover((h) => Math.max(h - 1, 0)); }
                          if (e.key === "Escape") setShowDrop(false);
                        }}
                      />
                      {showDrop && matches.length > 0 && (
                        <div style={S.dropdown}>
                          {matches.map((m, i) => (
                            <div key={m.id} style={S.dropItem(dropHover === i)}
                              onMouseEnter={() => setDropHover(i)}
                              onMouseLeave={() => setDropHover(-1)}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); joinFromDrop(m.id); }}
                            >
                              <span style={S.dropText}>{m.text}</span>
                              <span style={S.dropVotes}>{fmt(m.votes)}</span>
                            </div>
                          ))}
                          <div style={S.dropNone}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDrop(false); setAutoChecked(true); runAiCheck(); }}
                          >
                            // None of these match — check my question →
                          </div>
                        </div>
                      )}
                    </div>

                    {!autoChecked && (
                      <button style={{ ...S.primaryBtn(submitText.trim().length < 20 || aiLoading), width: "100%" }} onClick={runAiCheck} disabled={submitText.trim().length < 20 || aiLoading}>
                        {aiLoading ? <><span style={S.spinner} />Checking question…</> : "Check for similar questions →"}
                      </button>
                    )}

                    {aiLoading && (
                      <div style={S.loadingBox}>
                        <span style={S.spinner} />
                        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#555" }}>// Checking your question…</span>
                      </div>
                    )}

                    {qualityError && (
                      <div style={S.errorBox}>
                        <p style={S.errorTitle}>// Question not accepted</p>
                        <p style={S.errorText}>{qualityError} Please rephrase and try again.</p>
                      </div>
                    )}

                    {aiResult && (
                      <div style={S.aiBox}>
                        <p style={S.aiTitle}>{aiResult.similar?.length > 0 ? `${aiResult.similar.length} similar question${aiResult.similar.length > 1 ? "s" : ""} already exist` : "No duplicates found — your question looks distinct"}</p>
                        {aiResult.similar?.map(({ id, reason }) => {
                          const m = questions.find((q) => q.id === id);
                          if (!m) return null;
                          return (
                            <div key={id} style={S.aiItem}
                              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,59,59,0.05)"}
                              onMouseLeave={(e) => e.currentTarget.style.background = "#0A0A0A"}
                            >
                              <p style={S.aiItemQ}>{m.text}</p>
                              <p style={S.aiItemR}>{reason}</p>
                              <div style={S.aiItemFt}>
                                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#444" }}>{m.votes.toLocaleString()} voices</span>
                                <button style={S.joinBtn} onClick={() => { handleVote(id, null); setSubmitted(true); }}>+ Add my voice →</button>
                              </div>
                            </div>
                          );
                        })}
                        {aiResult.isDistinct && (
                          <div style={{ marginTop: aiResult.similar?.length ? 16 : 0, paddingTop: aiResult.similar?.length ? 16 : 0, borderTop: aiResult.similar?.length ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                            {aiResult.canonicalSuggestion && <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#555", marginBottom: 12 }}>// Suggested wording: "{aiResult.canonicalSuggestion}"</p>}
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
