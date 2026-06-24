import React, { useState, useMemo, useCallback } from "react";

// ============================================================================
// CONFIG
// Point this at your deployed backend. Leave as "/api" if the frontend and
// backend live on the same Vercel deployment (relative path just works).
// In this Claude preview there is no backend, so auto-fetch falls back to
// manual entry — that's expected.
// ============================================================================
const API_BASE = "/api";

// ---- Benchmark logic (Instagram, tier-aware) ------------------------------
const IG_TIERS = [
  { id: "nano",  label: "Nano",  range: "< 10K",      max: 10000,    weak: 2.0, strong: 6.0 },
  { id: "micro", label: "Micro", range: "10K – 50K",  max: 50000,    weak: 1.5, strong: 4.0 },
  { id: "mid",   label: "Mid",   range: "50K – 250K", max: 250000,   weak: 1.0, strong: 3.0 },
  { id: "macro", label: "Macro", range: "250K – 1M",  max: 1000000,  weak: 0.8, strong: 2.0 },
  { id: "mega",  label: "Mega",  range: "1M +",       max: Infinity, weak: 0.6, strong: 1.5 },
];
const igTier = (f) => IG_TIERS.find((t) => f <= t.max) || IG_TIERS[IG_TIERS.length - 1];

function detectHandle(url) {
  try {
    const path = new URL(url.startsWith("http") ? url : "https://" + url).pathname;
    const seg = path.split("/").filter(Boolean);
    if (!seg.length) return null;
    const h = seg[0];
    return h.startsWith("@") ? h : "@" + h;
  } catch { return null; }
}

const C = {
  bg: "#EEEEEA", card: "#FFFFFF", ink: "#17171C", muted: "#86867E",
  line: "#DEDED7", accent: "#5B4BFF", strong: "#138A5E", ok: "#C07A0A", weak: "#CC3B3B",
};
const VERDICTS = {
  strong: { word: "Strong fit", color: C.strong, sub: "Above bar for their tier — shortlist." },
  ok:     { word: "Worth a look", color: C.ok, sub: "Solid but not standout. Weigh against fit & cost." },
  weak:   { word: "Below the bar", color: C.weak, sub: "Engagement under tier benchmark. Pass unless fit is exceptional." },
};

export default function EngagementVet() {
  const [url, setUrl] = useState("");
  const [followers, setFollowers] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | manual | fetched | error
  const [note, setNote] = useState("");

  const handle = useMemo(() => detectHandle(url), [url]);

  const autoFetch = useCallback(async () => {
    if (!handle) { setNote("Paste a valid Instagram profile URL first."); return; }
    setStatus("loading"); setNote("");
    try {
      const res = await fetch(`${API_BASE}/profile?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`Backend returned ${res.status}`);
      const d = await res.json();
      setFollowers(String(d.followers));
      setLikes(String(d.avgLikes));
      setComments(String(d.avgComments));
      setStatus("fetched");
      setNote(d.cached ? "Loaded from cache (no credits spent)." : "Scraped live via your backend.");
    } catch (e) {
      setStatus("manual");
      setNote("No backend connected — enter the numbers manually for now.");
    }
  }, [url, handle]);

  const result = useMemo(() => {
    const L = parseFloat(likes), Cm = parseFloat(comments), base = parseFloat(followers);
    if (!base || base <= 0 || isNaN(L) || isNaN(Cm)) return null;
    const er = ((L + Cm) / base) * 100;
    const tier = igTier(base);
    const band = er < tier.weak ? "weak" : er >= tier.strong ? "strong" : "ok";
    const commentPct = L > 0 ? (Cm / L) * 100 : 0;
    const lowComments = L > 5000 && commentPct < 0.4;
    return { er, tier, band, gaugeMax: tier.strong * 1.8, commentPct, lowComments };
  }, [likes, comments, followers]);

  const pos = result ? Math.min(100, (result.er / result.gaugeMax) * 100) : 0;
  const weakPct = result ? (result.tier.weak / result.gaugeMax) * 100 : 0;
  const strongPct = result ? (result.tier.strong / result.gaugeMax) * 100 : 0;
  const verdict = result ? VERDICTS[result.band] : null;

  const inputStyle = {
    width: "100%", padding: "11px 13px", borderRadius: 10, border: `1px solid ${C.line}`,
    background: "#FCFCFB", color: C.ink, fontSize: 15,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace", outline: "none", boxSizing: "border-box",
  };
  const labelStyle = {
    display: "block", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase",
    color: C.muted, marginBottom: 6, fontWeight: 600,
  };

  return (
    <div style={{ minHeight: "100%", background: C.bg, padding: "28px 18px", boxSizing: "border-box" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 760, margin: "0 auto", fontFamily: "'Space Grotesk', system-ui, sans-serif", color: C.ink }}>

        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: C.accent, fontWeight: 700 }}>
            Top-of-funnel vetting · Instagram
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 700, margin: "6px 0 4px", letterSpacing: "-0.02em" }}>Engagement Check</h1>
          <p style={{ color: C.muted, fontSize: 14, margin: 0, maxWidth: 520, lineHeight: 1.5 }}>
            Paste a profile and fetch automatically. The verdict is benchmarked to the creator&rsquo;s
            tier, so the bar shifts with audience size.
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
          {/* Input panel */}
          <div style={{ flex: "1 1 300px", background: C.card, borderRadius: 16, padding: 20, border: `1px solid ${C.line}` }}>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Instagram profile URL</label>
              <input style={inputStyle} placeholder="instagram.com/handle" value={url} onChange={(e) => setUrl(e.target.value)} />
              {handle && (
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 12, padding: "3px 9px", borderRadius: 999, background: "#F0EFFF", color: C.accent, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{handle}</span>
                </div>
              )}
            </div>

            <button
              onClick={autoFetch}
              disabled={status === "loading"}
              style={{
                width: "100%", padding: "11px 0", borderRadius: 10, cursor: "pointer", marginBottom: 14,
                border: "none", background: status === "loading" ? C.muted : C.accent, color: "#fff",
                fontSize: 14, fontWeight: 600, fontFamily: "inherit",
              }}
            >
              {status === "loading" ? "Fetching…" : "Fetch automatically"}
            </button>

            {note && (
              <div style={{ fontSize: 12, color: status === "error" ? C.weak : C.muted, marginBottom: 14, lineHeight: 1.45 }}>{note}</div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 14px" }}>
              <div style={{ flex: 1, height: 1, background: C.line }} />
              <span style={{ fontSize: 10.5, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>or enter manually</span>
              <div style={{ flex: 1, height: 1, background: C.line }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Followers</label>
              <input style={inputStyle} type="number" placeholder="48000" value={followers} onChange={(e) => setFollowers(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Avg. likes</label>
                <input style={inputStyle} type="number" placeholder="2400" value={likes} onChange={(e) => setLikes(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Avg. comments</label>
                <input style={inputStyle} type="number" placeholder="60" value={comments} onChange={(e) => setComments(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Verdict panel */}
          <div style={{ flex: "1 1 300px", background: C.card, borderRadius: 16, padding: 20, border: `1px solid ${C.line}`, display: "flex", flexDirection: "column" }}>
            {!result ? (
              <div style={{ margin: "auto", textAlign: "center", color: C.muted, padding: "30px 10px", fontSize: 13, lineHeight: 1.5 }}>
                Fetch a profile or enter numbers.<br />The read-out lands here.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div>
                    <div style={labelStyle}>Engagement rate</div>
                    <div style={{ fontSize: 44, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1, color: verdict.color }}>
                      {result.er.toFixed(2)}<span style={{ fontSize: 22 }}>%</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={labelStyle}>Tier</div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{result.tier.label}</div>
                    <div style={{ fontSize: 11, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>{result.tier.range}</div>
                  </div>
                </div>

                <div style={{ margin: "22px 0 6px" }}>
                  <div style={{ position: "relative", height: 12, borderRadius: 6, overflow: "hidden", display: "flex" }}>
                    <div style={{ width: `${weakPct}%`, background: "#F0D2D2" }} />
                    <div style={{ width: `${strongPct - weakPct}%`, background: "#F3E2BE" }} />
                    <div style={{ flex: 1, background: "#C6E8D8" }} />
                  </div>
                  <div style={{ position: "relative", height: 0 }}>
                    <div style={{ position: "absolute", left: `${pos}%`, top: -19, transform: "translateX(-50%)", width: 3, height: 18, background: C.ink, borderRadius: 2 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10.5, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>
                    <span>below {result.tier.weak}%</span>
                    <span>strong {result.tier.strong}%+</span>
                  </div>
                </div>

                <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 12, background: verdict.color + "12", border: `1px solid ${verdict.color}33` }}>
                  <div style={{ fontSize: 19, fontWeight: 700, color: verdict.color }}>{verdict.word}</div>
                  <div style={{ fontSize: 13, color: C.ink, marginTop: 2, lineHeight: 1.45 }}>{verdict.sub}</div>
                </div>

                <div style={{ marginTop: 16, fontSize: 13, lineHeight: 1.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, borderBottom: `1px solid ${C.line}` }}>
                    <span style={{ color: C.muted }}>Comments per 100 likes</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{result.commentPct.toFixed(1)}</span>
                  </div>
                  {result.lowComments ? (
                    <div style={{ marginTop: 10, fontSize: 12.5, color: C.weak, lineHeight: 1.45 }}>
                      ⚠ Very few comments relative to likes — a common signature of bought or bot likes. Scan the comment section before proceeding.
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>
                      Comment-to-like ratio looks within a normal range — no obvious bought-engagement flag from this signal alone.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 16, lineHeight: 1.5, maxWidth: 600 }}>
          One top-of-funnel filter, not the whole call. Says nothing about audience geography, brand-safety, or content fit — keep those as separate gates.
        </p>
      </div>
    </div>
  );
}
