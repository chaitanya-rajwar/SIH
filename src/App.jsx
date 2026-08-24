import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Upload,
  Search,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  Radio,
  Loader2,
  ArrowRight,
  Gauge,
  Waypoints,
  ShieldCheck,
  Satellite,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Mock dataset — shaped to match the real backend contract exactly:
//   POST /batch/analyze-component  (multipart/form-data: file, component_id)
// Swap `fetchAnalysis()` below for a real fetch() call once the backend
// (http://127.0.0.1:8000) is live. Everything downstream stays the same.
// ---------------------------------------------------------------------------

const HOURS = [0, 24, 96, 168];

const BATCH_SIZE = 500;
const BATCH_AVERAGE_168H = 10.2;
const BATCH_MEDIAN_168H = 10.1;
const BATCH_STD_168H = 2.4;
const BATCH_SERIES = [8.6, 8.9, 9.6, BATCH_AVERAGE_168H];

// component_id -> current (µA) at 0h, 24h, 96h, 168h
const MOCK_DB = {
  C1002: [8.1, 8.3, 8.6, 8.8],
  C1007: [7.5, 7.6, 7.9, 8.1],
  C1013: [9.0, 9.2, 9.4, 9.6],
  C1019: [8.8, 8.9, 9.0, 9.2],
  C1024: [9.5, 9.6, 9.9, 10.1],
  C1031: [8.2, 8.4, 8.6, 8.7],
  C1083: [8.0, 8.1, 8.4, 8.6],
  C1094: [8.6, 8.7, 9.0, 9.2],
  C1036: [9.0, 10.2, 13.8, 18.2],
  C1042: [8.5, 9.8, 11.2, 13.4],
  C1048: [9.2, 10.5, 14.5, 19.1],
  C1053: [9.8, 10.9, 13.2, 16.0],
  C1088: [9.5, 10.8, 14.0, 17.6],
  C1047: [10.2, 15.6, 31.8, 47.8],
  C1059: [9.9, 14.2, 28.5, 44.9],
  C1064: [8.8, 9.1, 18.7, 38.6],
  C1071: [10.5, 16.8, 33.1, 49.2],
  C1077: [9.4, 13.2, 25.6, 42.1],
};

const MOCK_IDS = Object.keys(MOCK_DB);

function round(n, d = 1) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function buildReasons(riskLevel, deviationPercent, driftLate) {
  if (riskLevel === "HIGH") {
    return [
      `168h current is significantly different from the batch average (${deviationPercent > 0 ? "+" : ""}${deviationPercent.toFixed(1)}% deviation)`,
      driftLate > 0.3
        ? "Strong positive current drift detected in the final burn-in window"
        : "Strong positive current drift detected over the full burn-in window",
      "Predicted 168h value indicates continued upward drift",
      "Z-score places this component far outside the healthy population distribution",
    ];
  }
  if (riskLevel === "MEDIUM") {
    return [
      `Current is moderately above the batch average (${deviationPercent > 0 ? "+" : ""}${deviationPercent.toFixed(1)}% deviation)`,
      "Drift rate has not stabilized across the burn-in window",
      "Recommend manual inspection before clearance",
    ];
  }
  return [
    "168h current is within normal batch tolerance",
    "No significant drift detected across the burn-in window",
    "Consistent with the healthy population baseline",
  ];
}

// Mirrors the exact response shape the real /batch/analyze-component
// endpoint will return.
function computeAnalysis(componentId) {
  const values = MOCK_DB[componentId];
  if (!values) return null;

  const component_value_168h = values[3];
  const deviation_percent =
    ((component_value_168h - BATCH_AVERAGE_168H) / BATCH_AVERAGE_168H) * 100;
  const median_deviation_percent =
    ((component_value_168h - BATCH_MEDIAN_168H) / BATCH_MEDIAN_168H) * 100;
  const z_score = (component_value_168h - BATCH_AVERAGE_168H) / BATCH_STD_168H;

  const drift_0_24 = (values[1] - values[0]) / values[0];
  const drift_24_96 = (values[2] - values[1]) / values[1];
  const drift_96_168 = (values[3] - values[2]) / values[2];
  const total_drift = (values[3] - values[0]) / values[0];

  const raw = Math.abs(z_score) * 8 + Math.max(0, total_drift) * 25;
  const anomaly_score = round(clamp(raw, 0, 100), 1);

  const risk_level = raw >= 65 ? "HIGH" : raw >= 30 ? "MEDIUM" : "LOW";
  const decision = risk_level === "HIGH" ? "FAIL" : risk_level === "MEDIUM" ? "REVIEW" : "PASS";

  const predicted_168h = round(
    component_value_168h * (1 + clamp(total_drift, 0, 3) * 0.05),
    1
  );
  const prediction_source = Math.abs(total_drift) > 0.3 ? "ML_MODEL" : "STATISTICAL_FALLBACK";

  return {
    component_id: componentId,
    batch_size: BATCH_SIZE,
    batch_average_168h: BATCH_AVERAGE_168H,
    batch_median_168h: BATCH_MEDIAN_168H,
    batch_std_168h: BATCH_STD_168H,
    component_value_168h,
    deviation_percent: round(deviation_percent, 1),
    median_deviation_percent: round(median_deviation_percent, 1),
    z_score: round(z_score, 2),
    drift_0_24: round(drift_0_24, 2),
    drift_24_96: round(drift_24_96, 2),
    drift_96_168: round(drift_96_168, 2),
    total_drift: round(total_drift, 2),
    predicted_168h,
    prediction_source,
    anomaly_score,
    risk_level,
    decision,
    reasons: buildReasons(risk_level, deviation_percent, drift_96_168),
    chart: HOURS.map((h, i) => ({ hour: `${h}h`, component: values[i], batch: BATCH_SERIES[i] })),
  };
}

// Simulated network call — same signature a real fetch() to
// POST http://127.0.0.1:8000/batch/analyze-component would have.
// Replace the body of this function with a real fetch(...) later.
function fetchAnalysis(componentId) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const result = computeAnalysis(componentId);
      if (result) resolve(result);
      else reject(new Error("Component not found in this batch"));
    }, 700);
  });
}

const STATUS_STYLE = {
  PASS: { fg: "#4ADE9C", bg: "rgba(74,222,156,0.12)", border: "rgba(74,222,156,0.35)", Icon: CheckCircle2 },
  REVIEW: { fg: "#E6B34D", bg: "rgba(230,179,77,0.12)", border: "rgba(230,179,77,0.35)", Icon: AlertTriangle },
  FAIL: { fg: "#E85B49", bg: "rgba(232,91,73,0.12)", border: "rgba(232,91,73,0.35)", Icon: XCircle },
};

// ---------------------------------------------------------------------------
// Signature element — analog risk gauge
// ---------------------------------------------------------------------------

function RiskGauge({ score, decision }) {
  const clamped = clamp(score, 0, 100);
  const angle = -90 + (clamped / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const cx = 100;
  const cy = 100;
  const r = 78;
  const needleX = cx + r * Math.sin(rad);
  const needleY = cy - r * Math.cos(rad);
  const color = STATUS_STYLE[decision].fg;

  const arc = (startDeg, endDeg, colorStop) => {
    const s = (Math.PI / 180) * startDeg;
    const e = (Math.PI / 180) * endDeg;
    const x1 = cx + r * Math.sin(s);
    const y1 = cy - r * Math.cos(s);
    const x2 = cx + r * Math.sin(e);
    const y2 = cy - r * Math.cos(e);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return (
      <path
        d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
        stroke={colorStop}
        strokeWidth="12"
        fill="none"
      />
    );
  };

  return (
    <svg viewBox="0 0 200 128" width="100%" height="140">
      {arc(-90, -18, "#4ADE9C")}
      {arc(-18, 45, "#E6B34D")}
      {arc(45, 90, "#E85B49")}
      <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#EAF0FA" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5" fill="#EAF0FA" />
      <text x={cx} y={cy - 26} textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="28" fontWeight="600" fill={color}>
        {clamped.toFixed(0)}
      </text>
      <text x={cx} y={cy - 8} textAnchor="middle" fontFamily="'Inter', sans-serif" fontSize="10" letterSpacing="2" fill="#6C7889">
        RISK SCORE
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Shared styles / fonts (injected once)
// ---------------------------------------------------------------------------

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
      * { box-sizing: border-box; }
      .mono { font-family: 'IBM Plex Mono', monospace; }
      .display { font-family: 'Space Grotesk', sans-serif; }
      .panel { background: #12161D; border: 1px solid #232B38; border-radius: 10px; }
      .row-btn { transition: background 120ms ease, border-color 120ms ease; cursor: pointer; }
      .row-btn:hover { background: #171C24; }
      .scan-grid {
        background-image: linear-gradient(#1A2029 1px, transparent 1px), linear-gradient(90deg, #1A2029 1px, transparent 1px);
        background-size: 28px 28px;
      }
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-thumb { background: #232B38; border-radius: 8px; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes pulseRing {
        0% { transform: scale(0.9); opacity: 0.55; }
        70% { transform: scale(1.6); opacity: 0; }
        100% { transform: scale(1.6); opacity: 0; }
      }
      @keyframes floatY {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-6px); }
      }
      @keyframes fadeUp {
        from { opacity: 0; transform: translateY(14px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .fade-up { animation: fadeUp 600ms ease both; }
    `}</style>
  );
}

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

function LandingPage({ onLaunch }) {
  const features = [
    { Icon: Waypoints, title: "Drift detection" },
    { Icon: Gauge, title: "168h prediction" },
    { Icon: ShieldCheck, title: "Explainable decisions" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0A0D12",
        color: "#EAF0FA",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <GlobalStyle />

      {/* decorative pulse */}
      <div
        style={{
          position: "absolute",
          top: "-120px",
          right: "-120px",
          width: 420,
          height: 420,
          pointerEvents: "none",
        }}
      >
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1px solid rgba(76,141,255,0.25)" }} />
        <div style={{ position: "absolute", inset: 40, borderRadius: "50%", border: "1px solid rgba(76,141,255,0.18)", animation: "pulseRing 3.5s ease-out infinite" }} />
        <div style={{ position: "absolute", inset: 80, borderRadius: "50%", border: "1px solid rgba(76,141,255,0.18)", animation: "pulseRing 3.5s ease-out infinite 1.2s" }} />
      </div>

      <div className="scan-grid" style={{ position: "absolute", inset: 0, opacity: 0.35, maskImage: "radial-gradient(circle at 30% 20%, black, transparent 70%)" }} />

      {/* header */}
      <div className="flex items-center justify-between" style={{ position: "relative", padding: "26px 40px", maxWidth: 1180, margin: "0 auto", width: "100%" }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 8, background: "#171C24", border: "1px solid #232B38" }}>
            <Radio size={17} color="#4C8DFF" />
          </div>
          <span className="mono" style={{ fontSize: 12, letterSpacing: 2, color: "#6C7889" }}>BURN-IN SCREENING CONSOLE</span>
        </div>
        <div className="mono flex items-center gap-2" style={{ fontSize: 12, color: "#4ADE9C" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ADE9C", display: "inline-block" }} />
          SYSTEM NOMINAL
        </div>
      </div>

      {/* hero */}
      <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 40px 60px", width: "100%" }}>
          <div className="fade-up mono" style={{ fontSize: 12, letterSpacing: 3, color: "#4C8DFF", marginBottom: 18 }}>
            AEROSPACE QA
          </div>
          <h1
            className="display fade-up"
            style={{ fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 600, lineHeight: 1.08, maxWidth: 640, margin: 0, animationDelay: "80ms" }}
          >
            Burn-in screening, made instant.
          </h1>

          <div className="fade-up" style={{ marginTop: 34, animationDelay: "220ms" }}>
            <button
              onClick={onLaunch}
              className="flex items-center gap-2"
              style={{
                background: "#4C8DFF",
                color: "#08101F",
                border: "none",
                borderRadius: 9,
                padding: "14px 26px",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Launch console
              <ArrowRight size={17} />
            </button>
          </div>

          <div
            className="fade-up flex items-center gap-28"
            style={{ marginTop: 56, animationDelay: "300ms" }}
          >
            {features.map((f) => (
              <div key={f.title} className="flex items-center gap-2">
                <f.Icon size={17} color="#4C8DFF" />
                <span className="display" style={{ fontSize: 13.5, color: "#8B96A8" }}>{f.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mono flex items-center justify-center gap-2" style={{ position: "relative", fontSize: 11, color: "#3A4356", paddingBottom: 22 }}>
        <Satellite size={12} style={{ animation: "floatY 3.5s ease-in-out infinite" }} />
        Smart India Hackathon · Component Screening Team
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace (upload → search → analyze → results)
// ---------------------------------------------------------------------------

function Workspace() {
  const [fileName, setFileName] = useState(null);
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [errorMsg, setErrorMsg] = useState("");
  const [results, setResults] = useState({}); // component_id -> analysis
  const [order, setOrder] = useState([]); // ids in order analyzed, most recent first
  const [selectedId, setSelectedId] = useState(null);
  const inputRef = useRef(null);

  const suggestions = useMemo(() => {
    if (!query) return [];
    return MOCK_IDS.filter((id) => id.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  }, [query]);

  function handleAnalyze(idArg) {
    const id = (idArg || query).trim().toUpperCase();
    if (!id) return;
    if (!fileName) {
      setFileName("burnin_batch_204.csv");
    }
    setStatus("loading");
    setErrorMsg("");
    setShowSuggestions(false);
    fetchAnalysis(id)
      .then((res) => {
        setResults((prev) => ({ ...prev, [id]: res }));
        setOrder((prev) => [id, ...prev.filter((x) => x !== id)]);
        setSelectedId(id);
        setStatus("idle");
        setQuery("");
      })
      .catch((err) => {
        setStatus("error");
        setErrorMsg(err.message || "Component not found in this batch");
      });
  }

  const selected = selectedId ? results[selectedId] : null;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#0A0D12", color: "#EAF0FA", minHeight: "100vh", padding: "28px 24px 60px" }}>
      <GlobalStyle />

      {/* Header */}
      <div className="flex items-center justify-between mb-6" style={{ maxWidth: 1180, margin: "0 auto 24px" }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center" style={{ width: 38, height: 38, borderRadius: 8, background: "#171C24", border: "1px solid #232B38" }}>
            <Radio size={18} color="#4C8DFF" />
          </div>
          <div>
            <div className="mono" style={{ fontSize: 11, letterSpacing: 3, color: "#6C7889" }}>QA · BURN-IN SCREENING</div>
            <div className="display" style={{ fontSize: 19, fontWeight: 600, color: "#EAF0FA" }}>Component Screening Console</div>
          </div>
        </div>
        <div className="mono flex items-center gap-2" style={{ fontSize: 12, color: "#4ADE9C" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ADE9C", display: "inline-block" }} />
          SYSTEM NOMINAL
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        {/* Upload + search panel */}
        <div className="panel scan-grid" style={{ padding: 28, marginBottom: 22 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: 2, color: "#6C7889", marginBottom: 12 }}>
            BURN-IN DATASET
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
            <label className="row-btn flex items-center gap-2" style={{ border: "1px dashed #2E3746", borderRadius: 8, padding: "12px 18px", color: fileName ? "#EAF0FA" : "#6C7889", fontSize: 14 }}>
              <Upload size={16} />
              {fileName || "Choose burn-in CSV"}
              <input type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => setFileName(e.target.files?.[0]?.name || "burnin_batch_204.csv")} />
            </label>

            <div style={{ position: "relative", flex: "1 1 280px", minWidth: 240 }}>
              <div className="flex items-center gap-2" style={{ border: "1px solid #232B38", borderRadius: 8, padding: "12px 14px", background: "#0E1218" }}>
                <Search size={15} color="#6C7889" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                  placeholder="Component ID, e.g. C1047"
                  className="mono"
                  style={{ background: "transparent", border: "none", outline: "none", color: "#EAF0FA", fontSize: 13.5, width: "100%" }}
                />
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <div className="panel" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 10, padding: 6, maxHeight: 220, overflowY: "auto" }}>
                  {suggestions.map((id) => (
                    <div
                      key={id}
                      className="row-btn mono"
                      onClick={() => handleAnalyze(id)}
                      style={{ padding: "8px 10px", borderRadius: 6, fontSize: 13 }}
                    >
                      {id}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              disabled={status === "loading" || !query.trim()}
              onClick={() => handleAnalyze()}
              className="flex items-center gap-2"
              style={{
                background: status === "loading" || !query.trim() ? "#1B2230" : "#4C8DFF",
                color: status === "loading" || !query.trim() ? "#6C7889" : "#08101F",
                border: "none",
                borderRadius: 8,
                padding: "12px 22px",
                fontSize: 14,
                fontWeight: 600,
                cursor: status === "loading" || !query.trim() ? "default" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {status === "loading" ? (
                <>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  Analyzing…
                </>
              ) : (
                <>
                  <Activity size={16} />
                  Analyze component
                </>
              )}
            </button>
          </div>
          {status === "error" && (
            <div className="mono" style={{ fontSize: 12, color: "#E85B49", marginTop: 12 }}>
              {errorMsg}. Try one of: {MOCK_IDS.slice(0, 4).join(", ")}…
            </div>
          )}
          <div style={{ fontSize: 12, color: "#586172", marginTop: 14 }}>
            Type a component ID and press Analyze — this calls{" "}
            <span className="mono" style={{ color: "#6C7889" }}>POST /batch/analyze-component</span> once the backend is connected.
          </div>
        </div>

        {order.length === 0 && status !== "loading" && (
          <div className="panel" style={{ padding: 40, textAlign: "center", color: "#586172", fontSize: 13.5 }}>
            No components analyzed yet — search a component ID above to get started.
          </div>
        )}

        {order.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 18 }}>
            {/* Recently analyzed */}
            <div className="panel" style={{ padding: 16, height: "fit-content" }}>
              <div className="mono" style={{ fontSize: 11, letterSpacing: 1.5, color: "#6C7889", marginBottom: 12 }}>
                RECENTLY ANALYZED
              </div>
              <div style={{ maxHeight: 560, overflowY: "auto" }}>
                {order.map((id) => {
                  const c = results[id];
                  const s = STATUS_STYLE[c.decision];
                  const isSelected = selectedId === id;
                  return (
                    <div
                      key={id}
                      onClick={() => setSelectedId(id)}
                      className="row-btn flex items-center justify-between"
                      style={{
                        padding: "10px 10px",
                        borderRadius: 7,
                        background: isSelected ? "#171C24" : "transparent",
                        border: isSelected ? "1px solid #2E3746" : "1px solid transparent",
                        marginBottom: 3,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <s.Icon size={14} color={s.fg} />
                        <span className="mono" style={{ fontSize: 13, color: "#EAF0FA" }}>{id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="mono" style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, color: s.fg, background: s.bg }}>
                          {c.decision}
                        </span>
                        <ChevronRight size={13} color="#3A4356" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detail panel */}
            {selected && (
              <div className="panel" style={{ padding: 24 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 18 }}>
                  <div>
                    <div className="mono" style={{ fontSize: 11, letterSpacing: 2, color: "#6C7889" }}>COMPONENT</div>
                    <div className="display" style={{ fontSize: 22, fontWeight: 600 }}>{selected.component_id}</div>
                  </div>
                  <div
                    className="flex items-center gap-2 mono"
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      padding: "7px 14px",
                      borderRadius: 7,
                      color: STATUS_STYLE[selected.decision].fg,
                      background: STATUS_STYLE[selected.decision].bg,
                      border: `1px solid ${STATUS_STYLE[selected.decision].border}`,
                    }}
                  >
                    {React.createElement(STATUS_STYLE[selected.decision].Icon, { size: 15 })}
                    {selected.decision}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 24, marginBottom: 20 }}>
                  <div style={{ textAlign: "center" }}>
                    <RiskGauge score={selected.anomaly_score} decision={selected.decision} />
                    <div className="mono" style={{ fontSize: 11, letterSpacing: 1, color: STATUS_STYLE[selected.decision].fg, marginTop: -6 }}>
                      {selected.risk_level} RISK
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                    {[
                      { label: "COMPONENT 168H", value: `${selected.component_value_168h.toFixed(1)} µA` },
                      { label: "PREDICTED 168H", value: `${selected.predicted_168h.toFixed(1)} µA` },
                      { label: "BATCH AVERAGE", value: `${selected.batch_average_168h.toFixed(1)} µA` },
                      { label: "BATCH MEDIAN", value: `${selected.batch_median_168h.toFixed(1)} µA` },
                      {
                        label: "DEVIATION",
                        value: `${selected.deviation_percent > 0 ? "+" : ""}${selected.deviation_percent}%`,
                        color: selected.deviation_percent > 20 ? "#E85B49" : selected.deviation_percent > 0 ? "#E6B34D" : "#4ADE9C",
                      },
                      { label: "Z-SCORE", value: selected.z_score },
                    ].map((m) => (
                      <div key={m.label} style={{ background: "#0E1218", border: "1px solid #1E2530", borderRadius: 8, padding: "10px 12px" }}>
                        <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1, color: "#6C7889", marginBottom: 5 }}>{m.label}</div>
                        <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: m.color || "#EAF0FA" }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Drift breakdown */}
                <div style={{ marginBottom: 20 }}>
                  <div className="mono" style={{ fontSize: 11, letterSpacing: 1.5, color: "#6C7889", marginBottom: 10 }}>
                    DRIFT BREAKDOWN
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                    {[
                      { label: "0h → 24h", value: selected.drift_0_24 },
                      { label: "24h → 96h", value: selected.drift_24_96 },
                      { label: "96h → 168h", value: selected.drift_96_168 },
                      { label: "TOTAL DRIFT", value: selected.total_drift, strong: true },
                    ].map((d) => (
                      <div key={d.label} style={{ background: "#0E1218", border: "1px solid #1E2530", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                        <div className="mono" style={{ fontSize: 9.5, letterSpacing: 0.5, color: "#6C7889", marginBottom: 5 }}>{d.label}</div>
                        <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: d.value > 0 ? "#E6B34D" : "#4ADE9C" }}>
                          {d.value > 0 ? "+" : ""}{(d.value * 100).toFixed(0)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Trend chart */}
                <div style={{ marginBottom: 20 }}>
                  <div className="mono" style={{ fontSize: 11, letterSpacing: 1.5, color: "#6C7889", marginBottom: 10 }}>
                    CURRENT OVER TIME (µA)
                  </div>
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={selected.chart} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
                        <CartesianGrid stroke="#1A2029" vertical={false} />
                        <XAxis dataKey="hour" tick={{ fill: "#6C7889", fontSize: 11, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#232B38" }} tickLine={false} />
                        <YAxis tick={{ fill: "#6C7889", fontSize: 11, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#232B38" }} tickLine={false} />
                        <Tooltip contentStyle={{ background: "#171C24", border: "1px solid #232B38", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#EAF0FA" }} />
                        <Line type="monotone" dataKey="batch" name="Batch average" stroke="#3A4356" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                        <Line type="monotone" dataKey="component" name={selected.component_id} stroke={STATUS_STYLE[selected.decision].fg} strokeWidth={2.5} dot={{ r: 3, fill: STATUS_STYLE[selected.decision].fg }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: "#586172", marginTop: 8 }}>
                    Model prediction for 168h: {selected.predicted_168h.toFixed(1)} µA · source: {selected.prediction_source}
                  </div>
                </div>

                {/* Explanation */}
                <div>
                  <div className="mono" style={{ fontSize: 11, letterSpacing: 1.5, color: "#6C7889", marginBottom: 10 }}>
                    WHY WAS THIS FLAGGED?
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {selected.reasons.map((r, i) => (
                      <div key={i} className="flex items-start gap-2" style={{ fontSize: 13.5, color: "#C6CDD9", lineHeight: 1.5 }}>
                        <span style={{ color: STATUS_STYLE[selected.decision].fg, marginTop: 2 }}>
                          {selected.decision === "PASS" ? "✓" : "•"}
                        </span>
                        {r}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [phase, setPhase] = useState("landing"); // landing | workspace
  return phase === "landing" ? <LandingPage onLaunch={() => setPhase("workspace")} /> : <Workspace />;
}
