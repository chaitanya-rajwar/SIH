import React, { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import {
  Upload,
  FileText,
  Search,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  Radio,
  Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Mock dataset — stands in for the AI/backend response during independent
// frontend development. Swap `COMPONENTS` for the live API payload later.
// ---------------------------------------------------------------------------

const HOURS = [0, 24, 48, 96, 144, 168];
const BATCH_SERIES = [8.5, 8.7, 8.9, 9.1, 9.3, 9.5];
const BATCH_AVG_168 = BATCH_SERIES[BATCH_SERIES.length - 1];

const RAW_COMPONENTS = [
  { id: "C1002", values: [8.1, 8.3, 8.4, 8.6, 8.7, 8.8], score: 6 },
  { id: "C1007", values: [7.5, 7.6, 7.8, 7.9, 8.0, 8.1], score: 4 },
  { id: "C1013", values: [9.0, 9.2, 9.1, 9.4, 9.5, 9.6], score: 12 },
  { id: "C1019", values: [8.8, 8.9, 9.0, 9.0, 9.1, 9.2], score: 8 },
  { id: "C1024", values: [9.5, 9.6, 9.8, 9.9, 10.0, 10.1], score: 15 },
  { id: "C1031", values: [8.2, 8.4, 8.5, 8.6, 8.6, 8.7], score: 5 },
  { id: "C1083", values: [8.0, 8.1, 8.3, 8.4, 8.5, 8.6], score: 3 },
  { id: "C1094", values: [8.6, 8.7, 8.9, 9.0, 9.1, 9.2], score: 7 },
  {
    id: "C1036",
    values: [9.0, 10.2, 11.5, 13.8, 16.0, 18.2],
    score: 58,
    reasons: [
      "Current is trending above batch average with a consistent upward slope",
      "Rate of drift is increasing across the later measurement windows",
    ],
  },
  {
    id: "C1042",
    values: [8.5, 9.8, 8.9, 11.2, 10.5, 13.4],
    score: 52,
    reasons: [
      "Fluctuations are inconsistent with a stable burn-in profile",
      "Component is beginning to diverge from the healthy population cluster",
    ],
  },
  {
    id: "C1048",
    values: [9.2, 10.5, 12.0, 14.5, 16.8, 19.1],
    score: 61,
    reasons: [
      "Sustained upward drift detected from 24h onward",
      "Predicted 168h value is approaching the unsafe threshold",
    ],
  },
  {
    id: "C1053",
    values: [9.8, 10.9, 11.8, 13.2, 14.6, 16.0],
    score: 55,
    reasons: [
      "Current is moderately above batch average at every checkpoint",
      "Drift trend is linear and has not stabilized",
    ],
  },
  {
    id: "C1088",
    values: [9.5, 10.8, 12.2, 14.0, 15.9, 17.6],
    score: 59,
    reasons: [
      "Drift rate exceeds 90% of the batch population",
      "Component warrants a manual inspection before clearance",
    ],
  },
  {
    id: "C1047",
    values: [10.2, 15.6, 22.4, 31.8, 40.2, 47.8],
    score: 94,
    reasons: [
      "Current is significantly above batch average",
      "Abnormal upward drift detected from the first 24h window",
      "Predicted 168h value is unsafe for flight qualification",
      "Component differs significantly from healthy peers",
    ],
  },
  {
    id: "C1059",
    values: [9.9, 14.2, 20.1, 28.5, 36.7, 44.9],
    score: 91,
    reasons: [
      "Predicted 168h current is more than 4x the batch average",
      "Drift accelerates sharply after the 48h checkpoint",
      "Failure signature matches known thermal runaway pattern",
    ],
  },
  {
    id: "C1064",
    values: [8.8, 9.1, 9.5, 18.7, 29.4, 38.6],
    score: 88,
    reasons: [
      "Stable through 48h, then a sharp onset of drift",
      "Late-stage divergence is characteristic of latent defects",
      "Predicted 168h value is unsafe for deployment",
    ],
  },
  {
    id: "C1071",
    values: [10.5, 16.8, 24.3, 33.1, 41.5, 49.2],
    score: 96,
    reasons: [
      "Highest anomaly score in the current batch",
      "Current exceeds batch average by more than 5x at 168h",
      "Drift trajectory shows no sign of stabilizing",
    ],
  },
  {
    id: "C1077",
    values: [9.4, 13.2, 19.8, 25.6, 33.9, 42.1],
    score: 87,
    reasons: [
      "Erratic early readings followed by sustained runaway drift",
      "Component differs significantly from healthy peers",
      "Predicted 168h value is unsafe",
    ],
  },
];

function classify(score) {
  if (score >= 76) return { level: "HIGH", decision: "FAIL" };
  if (score >= 40) return { level: "MEDIUM", decision: "REVIEW" };
  return { level: "LOW", decision: "PASS" };
}

const COMPONENTS = RAW_COMPONENTS.map((c) => {
  const { level, decision } = classify(c.score);
  const predicted168 = c.values[c.values.length - 1];
  const deltaPct = Math.round(
    ((predicted168 - BATCH_AVG_168) / BATCH_AVG_168) * 100
  );
  const reasons =
    c.reasons ||
    (decision === "PASS"
      ? [
          "Current remains within batch tolerance at every checkpoint",
          "No significant drift detected across the burn-in window",
          "Consistent with the healthy population baseline",
        ]
      : []);
  const chart = HOURS.map((h, i) => ({
    hour: `${h}h`,
    component: c.values[i],
    batch: BATCH_SERIES[i],
  }));
  return {
    ...c,
    level,
    decision,
    predicted168,
    deltaPct,
    reasons,
    chart,
  };
}).sort((a, b) => b.score - a.score);

const STATUS_STYLE = {
  PASS: { fg: "#4ADE9C", bg: "rgba(74,222,156,0.12)", border: "rgba(74,222,156,0.35)", Icon: CheckCircle2 },
  REVIEW: { fg: "#E6B34D", bg: "rgba(230,179,77,0.12)", border: "rgba(230,179,77,0.35)", Icon: AlertTriangle },
  FAIL: { fg: "#E85B49", bg: "rgba(232,91,73,0.12)", border: "rgba(232,91,73,0.35)", Icon: XCircle },
};

// ---------------------------------------------------------------------------
// Signature element — analog risk gauge
// ---------------------------------------------------------------------------

function RiskGauge({ score, decision }) {
  const clamped = Math.max(0, Math.min(100, score));
  const angle = -90 + (clamped / 100) * 180; // -90..90
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
        strokeLinecap="butt"
      />
    );
  };

  return (
    <svg viewBox="0 0 200 128" width="100%" height="140">
      {arc(-90, -18, "#4ADE9C")}
      {arc(-18, 45, "#E6B34D")}
      {arc(45, 90, "#E85B49")}
      <line
        x1={cx}
        y1={cy}
        x2={needleX}
        y2={needleY}
        stroke="#EAF0FA"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r="5" fill="#EAF0FA" />
      <text
        x={cx}
        y={cy - 26}
        textAnchor="middle"
        fontFamily="'IBM Plex Mono', monospace"
        fontSize="30"
        fontWeight="600"
        fill={color}
      >
        {clamped}
      </text>
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        fontFamily="'Inter', sans-serif"
        fontSize="10"
        letterSpacing="2"
        fill="#6C7889"
      >
        RISK SCORE
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function BurnInDashboard() {
  const [appState, setAppState] = useState("idle"); // idle | analyzing | ready
  const [fileName, setFileName] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const summary = useMemo(() => {
    const total = COMPONENTS.length;
    const pass = COMPONENTS.filter((c) => c.decision === "PASS").length;
    const review = COMPONENTS.filter((c) => c.decision === "REVIEW").length;
    const fail = COMPONENTS.filter((c) => c.decision === "FAIL").length;
    return { total, pass, review, fail };
  }, []);

  const filtered = useMemo(() => {
    return COMPONENTS.filter((c) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "pass" && c.decision === "PASS") ||
        (filter === "review" && c.decision === "REVIEW") ||
        (filter === "fail" && c.decision === "FAIL");
      const matchesQuery = c.id.toLowerCase().includes(query.toLowerCase());
      return matchesFilter && matchesQuery;
    });
  }, [filter, query]);

  const selected =
    COMPONENTS.find((c) => c.id === selectedId) || filtered[0] || COMPONENTS[0];

  function handleAnalyze() {
    setAppState("analyzing");
    setTimeout(() => {
      setAppState("ready");
      setSelectedId(COMPONENTS[0].id);
    }, 1100);
  }

  return (
    <div
      style={{
        fontFamily: "'Inter', sans-serif",
        background: "#0A0D12",
        color: "#EAF0FA",
        minHeight: "100vh",
        padding: "28px 24px 60px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .display { font-family: 'Space Grotesk', sans-serif; }
        .panel {
          background: #12161D;
          border: 1px solid #232B38;
          border-radius: 10px;
        }
        .row-btn { transition: background 120ms ease, border-color 120ms ease; cursor: pointer; }
        .row-btn:hover { background: #171C24; }
        .scan-grid {
          background-image: linear-gradient(#1A2029 1px, transparent 1px), linear-gradient(90deg, #1A2029 1px, transparent 1px);
          background-size: 28px 28px;
        }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #232B38; border-radius: 8px; }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-6" style={{ maxWidth: 1180, margin: "0 auto 24px" }}>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center"
            style={{ width: 38, height: 38, borderRadius: 8, background: "#171C24", border: "1px solid #232B38" }}
          >
            <Radio size={18} color="#4C8DFF" />
          </div>
          <div>
            <div className="mono" style={{ fontSize: 11, letterSpacing: 3, color: "#6C7889" }}>
              QA · BURN-IN SCREENING
            </div>
            <div className="display" style={{ fontSize: 19, fontWeight: 600, color: "#EAF0FA" }}>
              Component Screening Console
            </div>
          </div>
        </div>
        <div className="mono flex items-center gap-2" style={{ fontSize: 12, color: "#4ADE9C" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ADE9C", display: "inline-block" }} />
          SYSTEM NOMINAL
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        {/* Upload panel */}
        {appState !== "ready" && (
          <div className="panel scan-grid" style={{ padding: 32, marginBottom: 24 }}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: 2, color: "#6C7889", marginBottom: 6 }}>
              BURN-IN DATASET
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <label
                className="row-btn flex items-center gap-2"
                style={{
                  border: "1px dashed #2E3746",
                  borderRadius: 8,
                  padding: "12px 18px",
                  color: fileName ? "#EAF0FA" : "#6C7889",
                  fontSize: 14,
                }}
              >
                <Upload size={16} />
                {fileName || "Choose burn-in CSV"}
                <input
                  type="file"
                  accept=".csv"
                  style={{ display: "none" }}
                  onChange={(e) =>
                    setFileName(e.target.files?.[0]?.name || "burnin_batch_204.csv")
                  }
                />
              </label>
              <button
                disabled={appState === "analyzing"}
                onClick={() => {
                  if (!fileName) setFileName("burnin_batch_204.csv");
                  handleAnalyze();
                }}
                style={{
                  background: appState === "analyzing" ? "#1B2230" : "#4C8DFF",
                  color: appState === "analyzing" ? "#6C7889" : "#08101F",
                  border: "none",
                  borderRadius: 8,
                  padding: "12px 22px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: appState === "analyzing" ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {appState === "analyzing" ? (
                  <>
                    <Loader2 size={16} className="spin" style={{ animation: "spin 1s linear infinite" }} />
                    Analyzing components…
                  </>
                ) : (
                  <>
                    <Activity size={16} />
                    Analyze components
                  </>
                )}
              </button>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
            <div style={{ fontSize: 12, color: "#586172", marginTop: 14 }}>
              Runs the burn-in dataset through the anomaly-detection model — current, voltage, and
              temperature over time — to flag components drifting toward failure.
            </div>
          </div>
        )}

        {appState === "ready" && (
          <>
            {/* Summary cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0,1fr))",
                gap: 14,
                marginBottom: 22,
              }}
            >
              {[
                { label: "TOTAL COMPONENTS", value: summary.total, color: "#EAF0FA", border: "#232B38" },
                { label: "HEALTHY", value: summary.pass, color: "#4ADE9C", border: "#2A4B3D" },
                { label: "UNDER REVIEW", value: summary.review, color: "#E6B34D", border: "#4B3F22" },
                { label: "HIGH RISK", value: summary.fail, color: "#E85B49", border: "#4B2A25" },
              ].map((s) => (
                <div key={s.label} className="panel" style={{ padding: "16px 18px", borderLeft: `3px solid ${s.color}` }}>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: 1.5, color: "#6C7889", marginBottom: 8 }}>
                    {s.label}
                  </div>
                  <div className="display" style={{ fontSize: 30, fontWeight: 600, color: s.color }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 18 }}>
              {/* Component list */}
              <div className="panel" style={{ padding: 16, height: "fit-content" }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                  <Search size={14} color="#6C7889" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search component ID"
                    style={{
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: "#EAF0FA",
                      fontSize: 13,
                      width: "100%",
                    }}
                  />
                </div>
                <div className="flex gap-1" style={{ marginBottom: 12 }}>
                  {[
                    { key: "all", label: "All" },
                    { key: "pass", label: "Healthy" },
                    { key: "review", label: "Review" },
                    { key: "fail", label: "High risk" },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setFilter(t.key)}
                      className="mono"
                      style={{
                        fontSize: 11,
                        padding: "5px 9px",
                        borderRadius: 6,
                        border: "1px solid " + (filter === t.key ? "#4C8DFF" : "#232B38"),
                        background: filter === t.key ? "rgba(76,141,255,0.12)" : "transparent",
                        color: filter === t.key ? "#4C8DFF" : "#6C7889",
                        cursor: "pointer",
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div style={{ maxHeight: 520, overflowY: "auto" }}>
                  {filtered.map((c) => {
                    const s = STATUS_STYLE[c.decision];
                    const isSelected = selected?.id === c.id;
                    return (
                      <div
                        key={c.id}
                        onClick={() => setSelectedId(c.id)}
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
                          <span className="mono" style={{ fontSize: 13, color: "#EAF0FA" }}>
                            {c.id}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="mono"
                            style={{
                              fontSize: 11,
                              padding: "2px 7px",
                              borderRadius: 5,
                              color: s.fg,
                              background: s.bg,
                            }}
                          >
                            {c.decision}
                          </span>
                          <ChevronRight size={13} color="#3A4356" />
                        </div>
                      </div>
                    );
                  })}
                  {filtered.length === 0 && (
                    <div style={{ fontSize: 12, color: "#586172", padding: "20px 8px", textAlign: "center" }}>
                      No components match this filter.
                    </div>
                  )}
                </div>
              </div>

              {/* Detail panel */}
              {selected && (
                <div className="panel" style={{ padding: 24 }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 18 }}>
                    <div>
                      <div className="mono" style={{ fontSize: 11, letterSpacing: 2, color: "#6C7889" }}>
                        COMPONENT
                      </div>
                      <div className="display" style={{ fontSize: 22, fontWeight: 600 }}>
                        {selected.id}
                      </div>
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
                      <RiskGauge score={selected.score} decision={selected.decision} />
                      <div
                        className="mono"
                        style={{ fontSize: 11, letterSpacing: 1, color: STATUS_STYLE[selected.decision].fg, marginTop: -6 }}
                      >
                        {selected.level} RISK
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                      {[
                        { label: "PREDICTED 168H", value: `${selected.predicted168.toFixed(1)} µA` },
                        { label: "BATCH AVERAGE", value: `${BATCH_AVG_168.toFixed(1)} µA` },
                        {
                          label: "DEVIATION",
                          value: `${selected.deltaPct > 0 ? "+" : ""}${selected.deltaPct}%`,
                          color: selected.deltaPct > 20 ? "#E85B49" : selected.deltaPct > 0 ? "#E6B34D" : "#4ADE9C",
                        },
                        { label: "ANOMALY SCORE", value: `${selected.score}/100` },
                      ].map((m) => (
                        <div key={m.label} style={{ background: "#0E1218", border: "1px solid #1E2530", borderRadius: 8, padding: "12px 14px" }}>
                          <div className="mono" style={{ fontSize: 10, letterSpacing: 1, color: "#6C7889", marginBottom: 6 }}>
                            {m.label}
                          </div>
                          <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: m.color || "#EAF0FA" }}>
                            {m.value}
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
                          <XAxis
                            dataKey="hour"
                            tick={{ fill: "#6C7889", fontSize: 11, fontFamily: "IBM Plex Mono" }}
                            axisLine={{ stroke: "#232B38" }}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: "#6C7889", fontSize: 11, fontFamily: "IBM Plex Mono" }}
                            axisLine={{ stroke: "#232B38" }}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{ background: "#171C24", border: "1px solid #232B38", borderRadius: 8, fontSize: 12 }}
                            labelStyle={{ color: "#EAF0FA" }}
                          />
                          <Line
                            type="monotone"
                            dataKey="batch"
                            name="Batch average"
                            stroke="#3A4356"
                            strokeWidth={1.5}
                            strokeDasharray="4 3"
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="component"
                            name={selected.id}
                            stroke={STATUS_STYLE[selected.decision].fg}
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: STATUS_STYLE[selected.decision].fg }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
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
          </>
        )}
      </div>
    </div>
  );
}
