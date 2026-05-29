import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

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

// Read question ID from URL on load
const getUrlQuestionId = () => {
  const params = new URLSearchParams(window.location.search);
  const q = params.get("q");
  return q ? parseInt(q) : null;
};

const TAGS = ["all", "welfare", "NHS", "accountability", "pensioners", "immigration", "justice", "environment"];

// Short word whitelist — important terms under 5 chars
const SHORT_WORDS = new Set(["nhs","mps","gps","tax","law","cut","cuts","pay","war","aid","ban","fee","pip","dwp","esa","uc","pm","mp","gp","eu","un","net","vat","hmrc","gdp","ppe","pfi"]);
const STOP_WORDS  = new Set(["will","your","what","that","have","this","with","they","from","been","when","does","were","about","which","their","there","would","could","should","shall","into","over","more","some","than","then","also","just","even","much","such","very","only","well","both","each","most","many","these","those","being","having","doing","going","coming","getting","making","taking","giving","saying","knowing","thinking","feeling"]);

const fmt     = (n) => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
const daysAgo = (d) => !d ? 0 : Math.floor((new Date() - new Date(d)) / 86400000);
const fmtDate = (d) => !d ? "" : new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const histIcon  = (t) => t === "submitted" ? "◎" : t === "deflected" ? "✕" : t === "champion" ? "★" : t === "reported" ? "⚑" : "✓";
const histColor = (t) => t === "submitted" ? "#555" : t === "deflected" ? "#FF3B3B" : t === "champion" ? "#22C55E" : t === "reported" ? "#F59E0B" : "#22C55E";

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

const SIMILAR_PROMPT = `You are helping a UK civic accountability platform called Community Question.

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

- "similar" should only contain questions where the SAME answer would satisfy both askers. Empty array if none.
- "isDistinct" is true if the new question is NOT a match for any existing question.
- "canonicalSuggestion" is an optional cleaner phrasing of the new question, or null.

Existing questions: QUESTIONS_PLACEHOLDER`;

async function classifyQuestion(text) {
  const res = await fetch("/api/ai-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "classify", text }),
  });
  if (!res.ok) throw new Error("Classify failed");
  return res.json();
}

async function checkSimilar(text, questions) {
  const res = await fetch("/api/ai-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "similar", text, questions }),
  });
  if (!res.ok) throw new Error("Similar check failed");
  return res.json();
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

  heroWrap:   { borderLeft: `3px solid ${R}`, paddingLeft: 20, marginBottom: 32 },
  heroTag:    { fontFamily: "'Space Mono', monospace", fontSize: 10, color: R, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16 },
  heroPara:   { fontSize: 15, color: "#888", lineHeight: 1.8, marginBottom: 20, maxWidth: 560 },
  heroCta:    { fontFamily: "'Space Mono', monospace", fontSize: 12, color: "#555", letterSpacing: "0.02em" },

  strip:      { background: R, padding: "16px 20px", margin: "0 -20px 32px", display: "flex", gap: 0, justifyContent: "space-around", textAlign: "center" },
  stripItem:  { flex: 1, padding: "0 8px" },
  stripVal:   { fontFamily: "'Space Mono', monospace", fontSize: "clamp(16px,3.5vw,24px)", fontWeight: 700, color: "#fff", lineHeight: 1 },
  stripLbl:   { fontSize: "clamp(8px,1.4vw,10px)", color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 },

  topBanner:  { background: "#111", border: `1px solid rgba(255,255,255,0.05)`, borderLeft: `3px solid ${R}`, padding: "20px 24px", marginBottom: 2, cursor: "pointer" },
  topLabel:   { fontSize: 10, color: R, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, display: "flex", alignItems: "center", gap: 8, fontFamily: "'Space Mono', monospace" },
  topDot:     { width: 6, height: 6, borderRadius: "50%", background: R, animation: "pulse 2s infinite", flexShrink: 0 },
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
  shareBtn:   (s) => ({ background: s ? "rgba(34,197,94,0.08)" : "transparent", border: `1px solid ${s ? "rgba(34,197,94,0.3)" : "rgba(255,59,59,0.3)"}`, borderRadius: 0, padding: "12px 0", width: "100%", marginTop: 6, fontSize: 12, fontWeight: 700, color: s ? G : R, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textTransform: "uppercase", letterSpacing: "0.04em" }),
  reportBtn:  { background: "transparent", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 0, padding: "8px 0", width: "100%", marginTop: 6, fontSize: 11, fontWeight: 700, color: "#333", cursor: "pointer", fontFamily: "'Space Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em" },

  nextPmqs:   { background: "rgba(255,59,59,0.05)", border: "1px solid rgba(255,59,59,0.12)", padding: "11px 16px", marginBottom: 2, display: "flex", alignItems: "center", justifyContent: "space-between" },
  nextPmqsL:  { fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#555" },
  nextPmqsR:  { fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, color: R },

  championBox:   { background: "#111", border: "1px solid rgba(34,197,94,0.2)", borderLeft: "3px solid #22C55E", padding: "20px 24px", marginBottom: 2 },
  championLabel: { fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: G, textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 },
  championName:  { fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 4 },
  championMeta:  { fontSize: 13, color: "#888", marginBottom: 8 },
  championDate:  { fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#555", marginBottom: 12 },
  copyLinkBtn:   (s) => ({ background: s ? "rgba(34,197,94,0.15)" : "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 0, padding: "8px 16px", fontSize: 11, fontWeight: 700, color: G, cursor: "pointer", fontFamily: "'Space Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em" }),

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
  secondaryBtn: { background: "transparent", border: `1px solid rgba(255,59,59,0.3)`, borderRadius: 0, padding: "13px 24px", fontSize: 12, fontWeight: 700, color: R, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" },
  spinner:    { display: "inline-block", width: 12, height: 12, border: "2px solid rgba(255,59,59,0.3)", borderTopColor: R, borderRadius: "50%", animation: "spin 0.8s linear infinite", verticalAlign: "middle", marginRight: 8 },
  successBox: { background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", padding: 40, textAlign: "center" },
  errorBox:   { background: "rgba(255,59,59,0.06)", border: "1px solid rgba(255,59,59,0.2)", padding: 20, marginTop: 12 },
  errorTitle: { fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, color: R, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 },
  errorText:  { fontSize: 13, color: "#888", lineHeight: 1.6 },
  loadingBox: { background: "rgba(255,59,59,0.04)", border: "1px solid rgba(255,59,59,0.15)", padding: "24px 20px", marginTop: 12, textAlign: "center" },
  useWordingBtn: { background: "rgba(255,59,59,0.08)", border: "1px solid rgba(255,59,59,0.2)", borderRadius: 0, padding: "6px 12px", fontSize: 11, fontWeight: 700, color: R, cursor: "pointer", fontFamily: "'Space Mono', monospace", textTransform: "uppercase", letterSpacing: "0.04em", marginLeft: 8, whiteSpace: "nowrap" },
  docWrap: { maxWidth: 720, margin: "0 auto", padding: "32px 24px 80px", color: "#D1D5DB", lineHeight: 1.7 },
  docH1: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 32, fontWeight: 700, color: "#fff", marginBottom: 8 },
  docH2: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, color: "#fff", marginTop: 32, marginBottom: 12 },
  docP: { fontSize: 15, marginBottom: 14, color: "#9CA3AF" },
  docMeta: { fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#6B7280", marginBottom: 32, letterSpacing: "0.04em" },
  docList: { fontSize: 15, color: "#9CA3AF", marginBottom: 14, paddingLeft: 24 },
  docLink: { color: "#FF3B3B", textDecoration: "underline", cursor: "pointer" },
  footer: { borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 80, padding: "32px 24px", display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap" },
  footerLink: { fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#6B7280", letterSpacing: "0.04em", cursor: "pointer", background: "none", border: "none", padding: 0 },
  cookieBanner: { position: "fixed", bottom: 16, left: 16, right: 16, maxWidth: 640, margin: "0 auto", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, zIndex: 1000, fontSize: 13, color: "#D1D5DB" },
  cookieBtn: { background: "#FF3B3B", color: "#fff", border: "none", padding: "8px 16px", fontSize: 12, fontFamily: "'Space Mono', monospace", letterSpacing: "0.04em", cursor: "pointer", whiteSpace: "nowrap" },
};

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const urlQId = getUrlQuestionId();

  const [view, setView]                 = useState(urlQId ? "question" : "home");
  const [questions, setQuestions]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [votedIds, setVotedIds]         = useState(new Set());
  const [reportedIds, setReportedIds]   = useState(new Set());
  const [sortBy, setSortBy]             = useState("votes");
  const [activeTag, setActiveTag]       = useState("all");
  const [selectedQId, setSelectedQId]   = useState(urlQId);
  const [deflections, setDeflections]   = useState({});
  const [submitText, setSubmitText]     = useState("");
  const [submitTag, setSubmitTag]       = useState("");
  const [aiResult, setAiResult]         = useState(null);
  const [aiLoading, setAiLoading]       = useState(false);
  const [submitted, setSubmitted]       = useState(false);
  const [submittedQId, setSubmittedQId] = useState(null);
  const [showDrop, setShowDrop]         = useState(false);
  const [dropHover, setDropHover]       = useState(-1);
  const [qualityError, setQualityError] = useState("");
  const [autoChecked, setAutoChecked]   = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [copySuccess, setCopySuccess]   = useState(false);
    const [cookieAccepted, setCookieAccepted] = useState(() => localStorage.getItem("cq_cookie_accepted") === "true");
  const wrapRef = useRef(null);

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

    // Share — copy direct question URL to clipboard
  const handleShare = (qid) => {
    const url = `${window.location.origin}?q=${qid}`;
    navigator.clipboard.writeText(url);
    setShareSuccess(true);
    setTimeout(() => setShareSuccess(false), 2000);
  };

  // Copy link for MP champion
  const handleCopyLink = (qid) => {
    const url = `${window.location.origin}?q=${qid}`;
    navigator.clipboard.writeText(url);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Copy link for submitted question
  const handleShareSubmitted = () => {
    if (!submittedQId) return;
    const url = `${window.location.origin}?q=${submittedQId}`;
    navigator.clipboard.writeText(url);
    setShareSuccess(true);
    setTimeout(() => setShareSuccess(false), 2000);
  };

  const runAiCheck = async () => {
  if (submitText.trim().length < 20) return;

  console.log("runAiCheck called with:", submitText);

  setAiLoading(true);
  setShowDrop(false);
  setAiResult(null);
  setQualityError("");

  try {
    // Step 1: Classify the question
    const classify = await classifyQuestion(submitText);

    if (classify.quality === "fail") {
      setQualityError(classify.failReason || "This doesn't look like a valid question directed at the Prime Minister.");
      setAiLoading(false);
      return;
    }

    if (classify.tag) setSubmitTag(classify.tag);

    // Step 2: Semantic similarity check with Grok
    const topQuestions = [...questions]
      .sort((a, b) => (b.votes || 0) - (a.votes || 0))
      .slice(0, 10);

    console.log(`Sending top ${topQuestions.length} questions to Grok`);

    const similar = await checkSimilar(submitText, topQuestions);
    setAiResult(similar);

  } catch (err) {
    console.error("AI Check error:", err);
    setAiResult({ similar: [], isDistinct: true });
  } finally {
    setAiLoading(false);
  }
};

  const submitNew = async (textToSubmit) => {
    const finalText = textToSubmit || submitText;
    const { data, error } = await supabase.from("questions")
      .insert({ text: finalText, tag: submitTag || "general", status: "unanswered", submitted_date: new Date().toISOString().split("T")[0], times_deflected: 0 })
      .select().single();
    if (!error && data) {
      await supabase.from("deflections").insert({ question_id: data.id, event_date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), event_type: "submitted", note: "Question submitted by community" });
      await supabase.from("votes").insert({ question_id: data.id, session_id: SESSION_ID });
      setSubmittedQId(data.id);
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
    if (text.trim().length < 2) return [];
    const words = text.toLowerCase().split(/\s+/).filter((w) => {
      if (SHORT_WORDS.has(w)) return true;
      return w.length > 5 && !STOP_WORDS.has(w);
    });
    if (words.length === 0) return [];
    return questions.map((q) => ({ ...q, score: words.reduce((s, w) => s + (q.text.toLowerCase().includes(w) ? 1 : 0), 0) }))
      .filter((q) => q.score > 0).sort((a, b) => b.score - a.score || b.votes - a.votes).slice(0, 4);
  };

  const joinFromDrop = (qid) => { handleVote(qid, null); setShowDrop(false); setSubmitText(""); setSelectedQId(qid); setView("question"); };

  const onTextChange = (e) => {
  const v = e.target.value;
  setSubmitText(v);
  
  // Clear previous results
  if (aiResult) setAiResult(null);
  if (qualityError) setQualityError("");
  if (submitTag) setSubmitTag("");
  
  setShowDrop(false);           // ← Disable real-time dropdown
  setAutoChecked(false);
};

  const goHome = () => {
  setView("home");
  setSelectedQId(null);
  setSubmitted(false);
  setCopySuccess(false);
  setShareSuccess(false);
  setSubmittedQId(null);
  window.history.pushState({}, "", "/");
  window.scrollTo(0, 0);
};

  const openQuestion = (qid) => {
    setSelectedQId(qid); setView("question");S
    window.history.pushState({}, "", `?q=${qid}`);
  };

  const getSorted = (qs) => {
    if (sortBy === "votes")  return [...qs].sort((a, b) => b.votes - a.votes);
    if (sortBy === "days")   return [...qs].sort((a, b) => b.daysUnanswered - a.daysUnanswered);
    if (sortBy === "recent") return [...qs].sort((a, b) => {
  const dateDiff = new Date(b.submitted_date) - new Date(a.submitted_date);
  if (dateDiff !== 0) return dateDiff;
  return new Date(b.created_at) - new Date(a.created_at);
});
    return qs;
  };

  const filtered      = getSorted(questions.filter((q) => activeTag === "all" || q.tag === activeTag));
  const topQuestion   = [...questions].sort((a, b) => b.votes - a.votes)[0];
  const totalVoices   = questions.reduce((s, q) => s + q.votes, 0);
  const totalUnanswered = questions.filter((q) => q.status === "unanswered").length;
  const totalDeflected  = questions.reduce((s, q) => s + (q.timesDeflected || 0), 0);
  const pmqsDate      = nextPMQs();
  const selectedQ     = questions.find((x) => x.id === selectedQId);
  const hasChampion   = selectedQ?.mp_champion_name;

  const QCard = ({ q }) => (
    <div style={S.qCard}
      onClick={() => openQuestion(q.id)}
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
      <style>{`
        * {margin:0;padding:0;box-sizing:border-box}
        body{background:#0A0A0A}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:#0A0A0A}
        ::-webkit-scrollbar-thumb{background:#222}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
      `}</style>

      <div style={S.app}>
        <nav style={S.nav}>
          <span style={S.logo} onClick={goHome}>COMMUNITY<span style={S.logoR}>QUESTION</span></span>
          <button style={S.navBtn} onClick={() => { setView("submit"); setSubmitted(false); setAiResult(null); setSubmitText(""); setQualityError(""); setAutoChecked(false); setSubmittedQId(null); }}>Ask a question</button>
        </nav>

        {loading ? (
          <div style={S.loading}>// loading questions…</div>
        ) : (
          <>
            {/* ── HOME ── */}
            {view === "home" && (
              <div style={S.page}>
                <div style={S.heroWrap}>
                  <div style={S.heroTag}>// To the Prime Minister</div>
                  <p style={S.heroPara}>Every day, thousands of people are asking the same questions — scattered, individual, easy to ignore. We bring those voices together. One question. One number. One permanent public record that grows every day it goes unanswered.</p>
                  <p style={S.heroCta}>Add your voice to a question already being asked — or submit one that hasn't been yet.</p>
                </div>

                <div style={S.strip}>
                  <div style={S.stripItem}><div style={S.stripVal}>{totalVoices.toLocaleString()}</div><div style={S.stripLbl}>voices</div></div>
                  <div style={S.stripItem}><div style={S.stripVal}>{totalUnanswered}</div><div style={S.stripLbl}>questions unanswered</div></div>
                  <div style={S.stripItem}><div style={S.stripVal}>{totalDeflected}</div><div style={S.stripLbl}>times dodged</div></div>
                </div>

                {topQuestion && (
                  <div style={S.topBanner}
                    onClick={() => openQuestion(topQuestion.id)}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(255,59,59,0.4)"}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)"}
                  >
                    <div style={S.topLabel}><div style={S.topDot} />Most wanted answer right now</div>
                    <p style={S.topQ}>"{topQuestion.text}"</p>
                    <div style={S.topStats}>
                      <div><div style={S.topVal(false)}>{topQuestion.votes.toLocaleString()}</div><div style={S.topLbl}>voices</div></div>
                      <div><div style={S.topVal(true)}>{topQuestion.daysUnanswered}</div><div style={S.topLbl}>days ignored</div></div>
                      <div><div style={S.topVal(true)}>{topQuestion.timesDeflected}×</div><div style={S.topLbl}>dodged</div></div>
                    </div>{topQuestion.mp_champion_name && (
  <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 8, fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#22C55E", letterSpacing: "0.04em" }}>
    <span>✓</span>
    <span>CLAIMED BY {topQuestion.mp_champion_name.toUpperCase()}{topQuestion.mp_champion_party ? ` (${topQuestion.mp_champion_party.toUpperCase()})` : ""}</span>
  </div>
)}
                  </div>
                )}

                <div style={S.pmqsBanner}>
                  <span style={S.pmqsLeft}>// next PMQs</span>
                  <span style={S.pmqsRight}>{pmqsDate}</span>
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
                  <button style={S.shareBtn(shareSuccess)} onClick={() => handleShare(selectedQ.id)}>
                    {shareSuccess ? "✓  Link copied!" : "↗  Share this question"}
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
                    <button style={S.copyLinkBtn(copySuccess)} onClick={() => handleCopyLink(selectedQ.id)}>
                      {copySuccess ? "✓ Link copied!" : "// Copy link to share"}
                    </button>
                  </div>
                ) : (
                  <div style={S.pledgeBox}>
  <p style={S.pledgeTitle}>// Are you an MP? Champion this question.</p>
  <p style={S.pledgeSub}>{selectedQ.votes.toLocaleString()} people want this answered. Pledge to raise it at PMQs and your name appears on this page as the MP who took it forward.</p>
  <p style={{ ...S.pledgeSub, marginTop: 16, color: "#9CA3AF" }}>To pledge, email <a href="mailto:champions@communityquestion.uk" style={{ color: "#FF3B3B", textDecoration: "underline" }}>champions@communityquestion.uk</a> from your Parliamentary email address. We'll add your pledge within 24 hours.</p>
</div>
                )}

                <div style={S.nextPmqs}>
                  <span style={S.nextPmqsL}>// next PMQs</span>
                  <span style={S.nextPmqsR}>{pmqsDate}</span>
                </div>

                <div style={S.tlWrap}>
                  <p style={S.tlTitle}>// Timeline</p>
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
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: R, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>// Ask the Prime Minister a question</div>
                  <p style={{ fontSize: 13, color: "#555", lineHeight: 1.7, maxWidth: 520 }}>
                    Type your question below. If thousands of others are already asking the same thing, we'll find them and combine all your voices into one. A single, powerful question — with a number behind it that's impossible to ignore.
                  </p>
                </div>

              {submitted ? (
  <div style={S.successBox}>
    <div style={{ fontFamily: "'Space Mono'", fontSize: 32, color: "G", marginBottom: 12 }}>✅</div>
    <p style={{ fontFamily: "'Space Mono'", fontSize: 14, color: "G", marginBottom: 8 }}>Question submitted.</p>
    <p style={{ fontSize: 13, color: "#a3a3a3", marginBottom: 28 }}>Your voice has been added. Share it to build momentum.</p>
    
    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
      <button style={S.primaryBtn(false)} onClick={() => { setSubmitted(false); goHome(); }}>← Back to questions</button>
      <button style={{ ...S.secondaryBtn }} onClick={handleShareSubmitted}>
        {shareSuccess ? "✅ Link copied!" : "↗ Share this question"}
      </button>
    </div>
  </div>
) : (
  /* === CLEAN V1 ASK FORM === */
  <div style={S.submitCard}>
    <label style={S.label}>Your question for Keir Starmer</label>
    
    <textarea
      style={S.textarea}
      placeholder='e.g. "Will you scrap the two-child benefit cap — yes or no?"'
      value={submitText}
      onChange={onTextChange}
      rows={4}
    />

    <button 
      style={S.primaryBtn}
      onClick={runAiCheck}
      disabled={submitText.trim().length < 20 || aiLoading}
    >
      {aiLoading ? "🔍 Checking for similar questions..." : "✅ CHECK FOR SIMILAR QUESTIONS →"}
    </button>

    {qualityError && <div style={{color: "#ff6b6b", marginTop: "12px"}}>{qualityError}</div>}

    {aiResult && (
      <div style={{marginTop: "16px", padding: "12px", background: "#1f1f1f", borderRadius: "8px"}}>
        <pre style={{whiteSpace: "pre-wrap", fontSize: "13px"}}>{JSON.stringify(aiResult, null, 2)}</pre>
        <button onClick={() => submitNew(submitText)} style={{marginTop: "10px", padding: "12px", background: "#ff4d4d", color: "white", border: "none", borderRadius: "6px", width: "100%"}}>
          ➕ POST AS NEW QUESTION
        </button>
      </div>
    )}
  </div>
)}
            {/* ── PRIVACY POLICY ─────────────────────────────────────── */}
            {view === "privacy" && (
              <div style={S.page}>
                <button style={S.back} onClick={() => { setView("home"); window.history.pushState({}, "", "/"); window.scrollTo(0, 0); }}>← Back</button>
                <div style={S.docWrap}>
                  <h1 style={S.docH1}>Privacy Policy</h1>
                  <p style={S.docMeta}>Last updated: 7 May 2026</p>

                  <h2 style={S.docH2}>1. Who we are</h2>
                  <p style={S.docP}>Community Question is a UK political accountability platform that aggregates questions directed at politicians and tracks whether those questions have been answered.</p>
                  <p style={S.docP}>Community Question is operated by Lou Quinn as an individual. For the purposes of UK GDPR and the Data Protection Act 2018, the data controller is:</p>
                  <p style={S.docP}>Lou Quinn<br />11-13 Penhill Road<br />Cardiff<br />CF11 9UP</p>
                  <p style={S.docP}>Contact: privacy@communityquestion.uk</p>

                  <h2 style={S.docH2}>2. What data we collect</h2>
                  <p style={S.docP}>We collect the minimum data needed to operate the platform.</p>
                  <p style={S.docP}>When you visit the site, we automatically generate an anonymous session identifier and store it in your browser's local storage. This session identifier is not linked to your name, email, or any identifying information. It exists only so that we can record which questions you have voted on or submitted, and prevent duplicate voting.</p>
                  <p style={S.docP}>When you submit a question, we record the text of your question, the topic tag, and the date and time of submission, alongside your anonymous session identifier.</p>
                  <p style={S.docP}>When you vote on a question, we record your anonymous session identifier and the question you voted on.</p>
                  <p style={S.docP}>We do not collect your name, email address, IP address (beyond what our hosting providers automatically log for security purposes), location, or any other personally identifying information.</p>
                  <p style={S.docP}>We do not use cookies for tracking, advertising, or analytics. The only client-side storage we use is the anonymous session identifier described above.</p>

                  <h2 style={S.docH2}>3. How we use your data</h2>
                  <p style={S.docP}>We use the data we collect solely to operate the platform: to display questions, count votes accurately, prevent duplicate voting, and show you which questions you have already engaged with.</p>
                  <p style={S.docP}>The text of submitted questions is published publicly on the platform. By submitting a question, you agree that the text of your question may be displayed publicly, indexed by search engines, and shared by other users.</p>
                  <p style={S.docP}>We do not sell, rent, or share your data with third parties for marketing purposes. We do not profile users or build advertising profiles.</p>

                  <h2 style={S.docH2}>4. Legal basis</h2>
                  <p style={S.docP}>Our legal basis for processing data under UK GDPR is legitimate interest: the operation of a public-interest civic accountability platform requires a basic record of submissions and votes. This processing is minimal, anonymous, and proportionate to the purpose.</p>

                  <h2 style={S.docH2}>5. How long we keep data</h2>
                  <p style={S.docP}>Submitted questions, vote records, and deflection history are retained indefinitely as part of the public record of the platform. This is core to the platform's purpose: tracking how long questions have gone unanswered requires preserving the original submission date.</p>
                  <p style={S.docP}>Anonymous session identifiers persist in your browser until you clear your browser data, or for as long as the corresponding records remain in our database.</p>

                  <h2 style={S.docH2}>6. Third-party services</h2>
                  <p style={S.docP}>We use the following third-party services to operate the platform:</p>
                  <ul style={S.docList}>
                    <li><a href="https://vercel.com/legal/privacy-policy" style={S.docLink} target="_blank" rel="noopener noreferrer">Vercel (hosting)</a></li>
                    <li><a href="https://supabase.com/privacy" style={S.docLink} target="_blank" rel="noopener noreferrer">Supabase (database)</a></li>
                    <li><a href="https://www.anthropic.com/legal/privacy" style={S.docLink} target="_blank" rel="noopener noreferrer">Anthropic (AI duplicate detection)</a></li>
                    <li><a href="https://www.namecheap.com/legal/general/privacy-policy/" style={S.docLink} target="_blank" rel="noopener noreferrer">Namecheap (domain registration)</a></li>
                  </ul>
                  <p style={S.docP}>These providers may process data on our behalf as part of delivering their services. They are bound by their own privacy policies and applicable data protection law.</p>
                  <p style={S.docP}>When you submit a question, the text of your question is sent to Anthropic's Claude AI for the purpose of detecting duplicate questions. Anthropic does not use this data to train their models. The submitted text is processed in the moment and not stored by Anthropic for any purpose beyond serving the immediate request.</p>

                  <h2 style={S.docH2}>7. Your rights</h2>
                  <p style={S.docP}>Under UK GDPR you have the right to:</p>
                  <ul style={S.docList}>
                    <li>Access the data we hold about you</li>
                    <li>Request correction of inaccurate data</li>
                    <li>Request deletion of your data</li>
                    <li>Object to processing</li>
                    <li>Lodge a complaint with the Information Commissioner's Office (ICO) at <a href="https://ico.org.uk" style={S.docLink} target="_blank" rel="noopener noreferrer">ico.org.uk</a></li>
                  </ul>
                  <p style={S.docP}>Because we do not collect identifying information, exercising some of these rights may require you to provide us with the session identifier from your browser, which acts as the only link between you and your activity on the platform.</p>
                  <p style={S.docP}>To exercise any of these rights, contact us at privacy@communityquestion.uk.</p>

                  <h2 style={S.docH2}>8. Changes to this policy</h2>
                  <p style={S.docP}>We may update this policy from time to time. The "last updated" date at the top of this page will reflect when changes were made. Material changes will be communicated by a notice on the site.</p>

                  <h2 style={S.docH2}>9. Complaints</h2>
                  <p style={S.docP}>If you have concerns about how your data is being handled and we have not been able to resolve them, you have the right to lodge a complaint with the UK's data protection regulator:</p>
                  <p style={S.docP}>Information Commissioner's Office<br />Wycliffe House, Water Lane<br />Wilmslow, Cheshire SK9 5AF<br /><a href="https://ico.org.uk" style={S.docLink} target="_blank" rel="noopener noreferrer">ico.org.uk</a></p>
                </div>
              </div>
            )}

            {/* ── TERMS OF USE ───────────────────────────────────────── */}
            {view === "terms" && (
              <div style={S.page}>
                <button style={S.back} onClick={() => { setView("home"); window.history.pushState({}, "", "/"); window.scrollTo(0, 0); }}>← Back</button>
                <div style={S.docWrap}>
                  <h1 style={S.docH1}>Terms of Use</h1>
                  <p style={S.docMeta}>Last updated: 7 May 2026</p>

                  <h2 style={S.docH2}>1. About Community Question</h2>
                  <p style={S.docP}>Community Question is a public-interest civic accountability platform operated by Lou Quinn. It allows members of the public to submit questions directed at UK politicians, vote on existing questions, and track which questions have been answered or evaded.</p>
                  <p style={S.docP}>By using this site, you agree to these Terms of Use. If you do not agree, please do not use the platform.</p>

                  <h2 style={S.docH2}>2. Use of the platform</h2>
                  <p style={S.docP}>You may use Community Question to submit, view, and vote on questions directed at UK politicians and public officials.</p>
                  <p style={S.docP}>By submitting a question, you confirm that:</p>
                  <ul style={S.docList}>
                    <li>The question is genuine and relates to a matter of public interest, public policy, or the conduct of a politician or public official in their public role.</li>
                    <li>The question is your own work or you have the right to submit it.</li>
                    <li>The question does not contain unlawful, defamatory, harassing, threatening, obscene, or grossly offensive content.</li>
                    <li>The question does not contain private or confidential information about any individual, including private citizens or the family members of politicians.</li>
                    <li>You understand and accept that submitted questions are published publicly and may be shared, indexed, and quoted by others.</li>
                  </ul>

                  <h2 style={S.docH2}>3. Content we will not accept</h2>
                  <p style={S.docP}>We reserve the right to remove or refuse to publish any submission that:</p>
                  <ul style={S.docList}>
                    <li>Targets private individuals rather than public figures acting in a public role.</li>
                    <li>Contains personal attacks, abuse, or harassment.</li>
                    <li>Contains false statements of fact about identifiable individuals.</li>
                    <li>Promotes violence, discrimination, or unlawful activity.</li>
                    <li>Is spam, repetitive, or submitted in bad faith.</li>
                    <li>Is incoherent, abusive, or otherwise fails the basic quality standards applied at submission.</li>
                  </ul>
                  <p style={S.docP}>We use AI-assisted moderation at submission to flag potential issues, and we reserve the right to review and remove any submission at any time.</p>

                  <h2 style={S.docH2}>4. Politicians and public figures</h2>
                  <p style={S.docP}>This platform discusses the conduct of politicians and public officials in their public roles. Comment, criticism, and accountability of public figures acting in public roles is a recognised matter of public interest.</p>
                  <p style={S.docP}>We make every effort to ensure that questions and any associated information about politicians are accurate. If you are a politician or public official mentioned on the platform and believe information about you is inaccurate, please contact privacy@communityquestion.uk and we will review the matter promptly.</p>

                  <h2 style={S.docH2}>5. MP champion feature</h2>
                  <p style={S.docP}>The MP Champion feature allows Members of Parliament to publicly pledge to ask a question on behalf of the community. Any MP who claims a question via the platform agrees that their name, party, constituency, and pledge date may be displayed publicly on the platform.</p>

                  <h2 style={S.docH2}>6. Intellectual property</h2>
                  <p style={S.docP}>The Community Question name, design, and underlying code are the property of Lou Quinn. The text of user-submitted questions remains the intellectual property of the user, but by submitting a question you grant us a non-exclusive, royalty-free, worldwide licence to display, reproduce, share, and archive the question as part of the platform's operation.</p>

                  <h2 style={S.docH2}>7. Limitation of liability</h2>
                  <p style={S.docP}>Community Question is provided on an "as is" basis. We make no warranties about the accuracy or availability of the platform.</p>
                  <p style={S.docP}>To the maximum extent permitted by law, we are not liable for any loss or damage arising from your use of the platform, including but not limited to loss of data, loss of opportunity, or reputational harm.</p>
                  <p style={S.docP}>Nothing in these terms limits our liability for matters that cannot be limited by law, including death or personal injury caused by negligence, or fraud.</p>

                  <h2 style={S.docH2}>8. Changes to these terms</h2>
                  <p style={S.docP}>We may update these terms from time to time. The "last updated" date at the top of this page will reflect when changes were made. Continued use of the platform after changes constitutes acceptance of the updated terms.</p>

                  <h2 style={S.docH2}>9. Governing law</h2>
                  <p style={S.docP}>These terms are governed by the laws of England and Wales. Any disputes will be subject to the exclusive jurisdiction of the courts of England and Wales.</p>

                  <h2 style={S.docH2}>10. Contact</h2>
                  <p style={S.docP}>For any questions about these Terms of Use, contact privacy@communityquestion.uk.</p>
                </div>
              </div>
            )}

            {/* ── COOKIE NOTICE ──────────────────────────────────────── */}
            {view === "cookies" && (
              <div style={S.page}>
                <button style={S.back} onClick={() => { setView("home"); window.history.pushState({}, "", "/"); window.scrollTo(0, 0); }}>← Back</button>
                <div style={S.docWrap}>
                  <h1 style={S.docH1}>Cookie & Storage Notice</h1>
                  <p style={S.docMeta}>Last updated: 7 May 2026</p>

                  <p style={S.docP}>Community Question does not use cookies for tracking, advertising, or analytics.</p>
                  <p style={S.docP}>The only client-side storage we use is a single anonymous session identifier stored in your browser's local storage. This identifier is not linked to your name, email, or any identifying information. It exists solely to allow the platform to record which questions you have voted on or submitted, and to prevent duplicate voting.</p>
                  <p style={S.docP}>This storage is considered "strictly necessary" for the operation of the platform under the Privacy and Electronic Communications Regulations (PECR). Without it, voting and submission features would not function correctly.</p>
                  <p style={S.docP}>You may clear this identifier at any time by clearing your browser's local storage for this site. Doing so will not delete any questions you have submitted or votes you have cast — those remain in the public record of the platform — but it will sever the link between your current browser and those records.</p>
                  <p style={S.docP}>We do not set any other cookies or storage on your device. We do not use Google Analytics, Facebook Pixel, or any other tracking technologies.</p>
                  <p style={S.docP}>If you have questions about how data is handled, please see our <a style={S.docLink} onClick={(e) => { e.preventDefault(); setView("privacy"); window.history.pushState({}, "", "/privacy"); window.scrollTo(0, 0); }} href="/privacy">Privacy Policy</a> or contact us at privacy@communityquestion.uk.</p>
                </div>
              </div>
            )}

            {/* ── FOOTER (always visible) ────────────────────────────── */}
            <footer style={S.footer}>
              <button style={S.footerLink} onClick={() => { setView("privacy"); window.history.pushState({}, "", "/privacy"); window.scrollTo(0, 0); }}>// Privacy</button>
              <button style={S.footerLink} onClick={() => { setView("terms"); window.history.pushState({}, "", "/terms"); window.scrollTo(0, 0); }}>// Terms</button>
              <button style={S.footerLink} onClick={() => { setView("cookies"); window.history.pushState({}, "", "/cookies"); window.scrollTo(0, 0); }}>// Cookies</button>
            </footer>

            {/* ── COOKIE BANNER (first visit only) ───────────────────── */}
            {!cookieAccepted && (
              <div style={S.cookieBanner}>
                <span>This site uses a single anonymous identifier in your browser's local storage to make voting work. No tracking, no analytics. <a style={S.docLink} onClick={(e) => { e.preventDefault(); setView("cookies"); window.history.pushState({}, "", "/cookies"); window.scrollTo(0, 0); }} href="/cookies">Learn more</a>.</span>
                <button style={S.cookieBtn} onClick={() => { localStorage.setItem("cq_cookie_accepted", "true"); setCookieAccepted(true); }}>OK</button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
