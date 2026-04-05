import React, { useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import DashboardNavbar from "../../components/DashboardNavbar";
import { submitPrediction } from "../../Api/Api";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const SAMPLE_DATA = `[
  { "date": "2024-01-01", "sku_id": "SKU001", "sales": 10 },
  { "date": "2024-01-08", "sku_id": "SKU001", "sales": 12 },
  { "date": "2024-01-15", "sku_id": "SKU001", "sales": 9 },
  { "date": "2024-01-22", "sku_id": "SKU001", "sales": 14 },
  { "date": "2024-01-29", "sku_id": "SKU001", "sales": 11 },
  { "date": "2024-02-05", "sku_id": "SKU001", "sales": 13 },
  { "date": "2024-02-12", "sku_id": "SKU001", "sales": 15 },
  { "date": "2024-02-19", "sku_id": "SKU001", "sales": 10 },
  { "date": "2024-02-26", "sku_id": "SKU001", "sales": 16 },
  { "date": "2024-03-04", "sku_id": "SKU001", "sales": 12 }
]`;

function formatInr(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

/** Plain-language guidance for shop owners (uses API numbers only). */
function getRetailerGuidance(prediction, insights, skuDisplay) {
  const fin = insights?.illustrative_impact;
  const eoq = insights?.eoq;
  const t = prediction?.comparison?.totals_four_week;
  const totalSmart = prediction?.eoq_hint?.total_4_week_demand;
  const avgWeek =
    prediction?.eoq_hint?.avg_weekly_demand != null
      ? Math.round(Number(prediction.eoq_hint.avg_weekly_demand) * 10) / 10
      : null;
  const over = Number(fin?.naive_over_forecasts_vs_ml_units) || 0;
  const under = Number(fin?.naive_under_forecasts_vs_ml_units) || 0;
  const eoqSmart = eoq?.eoq_units_aligned_with_ml;
  const eoqSimple = eoq?.eoq_units_aligned_with_naive_plan;
  const diff = t?.difference_ml_minus_naive;
  const usesFallback =
    Array.isArray(prediction?.forecast) &&
    prediction.forecast.some((p) => p?.method === "moving_average_fallback");

  const actions = [];
  if (eoqSmart != null) {
    actions.push({
      title: "How much to order at once",
      text: `Place supplier orders of about ${eoqSmart} units per order when you restock. That balances how often you order with how much cash sits on the shelf.`,
    });
  }
  if (eoqSimple != null && eoqSmart != null && eoqSimple !== eoqSmart) {
    const cmp =
      eoqSmart > eoqSimple
        ? `larger (${eoqSmart} vs ${eoqSimple} units per order)`
        : `smaller (${eoqSmart} vs ${eoqSimple} units per order)`;
    actions.push({
      title: "If you only copy last week’s sales",
      text: `You might order ${cmp}. Use the first number unless you know last week was a normal week.`,
    });
  }
  if (under >= 3) {
    actions.push({
      title: "Avoid empty shelves",
      text: `The “copy last week” plan is ${under} units light over 4 weeks vs this forecast. Check stock now and order a bit sooner or slightly more if supply is slow.`,
    });
  }
  if (over >= 3) {
    actions.push({
      title: "Avoid extra stock you can’t sell",
      text: `Only repeating last week could mean ${over} extra units over 4 weeks. Don’t stack a second big order unless sales really stay that strong.`,
    });
  }
  const roughMiss = fin?.rough_missed_profit_if_understocked_inr;
  const roughHold = fin?.rough_extra_holding_exposure_4w_inr;
  if (roughMiss > 0 || roughHold > 0) {
    actions.push({
      title: "Ballpark money (not exact)",
      text:
        roughMiss > roughHold
          ? `If you stock too little, missed sales might be around ${formatInr(roughMiss)} at the margin you entered — rough demo only.`
          : `If you stock too much, extra carrying cost over ~4 weeks might be around ${formatInr(roughHold)} — rough demo only.`,
    });
  }
  if (usesFallback) {
    actions.push({
      title: "Get a sharper forecast later",
      text: `The main line is still a simple average (no trained model file). Add more sales history and train the model for this store and SKU for tighter planning.`,
    });
  }

  if (actions.length === 0 && skuDisplay) {
    actions.push({
      title: "Keep reviewing",
      text: `After festivals, price changes, or new competition, paste fresh sales here and run again.`,
    });
  }

  return {
    skuDisplay,
    totalSmart,
    avgWeek,
    diff,
    diffAbs: diff != null ? Math.abs(diff) : null,
    usesFallback,
    actions,
  };
}

/**
 * Admin-only (RequireAdmin): prediction + EOQ insights + charts.
 * Logged in MongoDB PredictionLog (storeId, sku, product ref — see DATABASE_SCHEMA.md).
 */
function Predict({ toggleTheme, theme = "dark" }) {
  const [storeId, setStoreId] = useState("store_1");
  const [skuId, setSkuId] = useState("SKU001");
  const [dataJson, setDataJson] = useState(SAMPLE_DATA);
  const [orderingCost, setOrderingCost] = useState("50");
  const [holdingCost, setHoldingCost] = useState("");
  const [unitMargin, setUnitMargin] = useState("15");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  const isLight = theme === "light";
  const textMuted = isLight ? "#64748b" : "#94a3b8";
  const textMain = isLight ? "#0f172a" : "#e5e7eb";
  const gridColor = isLight ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.06)";

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          labels: { color: textMain, font: { family: "'Poppins', sans-serif" } },
        },
        title: {
          display: true,
          text: "Next 4 weeks — units you may sell",
          color: textMain,
          font: { size: 16, family: "'Poppins', sans-serif" },
        },
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        x: { ticks: { color: textMuted }, grid: { color: gridColor } },
        y: {
          ticks: { color: textMuted },
          grid: { color: gridColor },
          beginAtZero: true,
        },
      },
    }),
    [textMain, textMuted, gridColor]
  );

  const barOptions = useMemo(
    () => ({
      ...chartOptions,
      plugins: {
        ...chartOptions.plugins,
        title: {
          display: true,
          text: "Four-week total — smart plan vs copy-last-week",
          color: textMain,
          font: { size: 16, family: "'Poppins', sans-serif" },
        },
      },
    }),
    [chartOptions, textMain]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setPayload(null);

    let data;
    try {
      data = JSON.parse(dataJson);
    } catch {
      setError("Sales data must be valid JSON array.");
      return;
    }
    if (!Array.isArray(data) || data.length === 0) {
      setError("Sales data must be a non-empty JSON array.");
      return;
    }

    setLoading(true);
    try {
      const body = await submitPrediction({
        store_id: storeId.trim(),
        sku_id: skuId.trim(),
        data,
        ordering_cost: orderingCost ? Number(orderingCost) : undefined,
        holding_cost: holdingCost ? Number(holdingCost) : undefined,
        unit_margin: unitMargin ? Number(unitMargin) : undefined,
      });
      setPayload(body);
    } catch (err) {
      setError(err.message || "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const lineData = useMemo(() => {
    if (!payload?.prediction?.forecast) return null;
    const ml = payload.prediction.forecast;
    const base = payload.prediction.comparison?.baseline_forecast;
    const labels = ml.map((p) => p.week_start);
    const datasets = [
      {
        label: "Smarter forecast (AI or trend)",
        data: ml.map((p) => p.forecast),
        borderColor: "#2ec4b6",
        backgroundColor: "rgba(46, 196, 182, 0.15)",
        borderWidth: 3,
        tension: 0.35,
        fill: true,
        pointRadius: 5,
        pointHoverRadius: 7,
      },
    ];
    if (base?.length) {
      datasets.push({
        label: "Simple guess (repeat last week)",
        data: base.map((p) => p.forecast),
        borderColor: "#fb923c",
        backgroundColor: "rgba(251, 146, 60, 0.08)",
        borderWidth: 3,
        borderDash: [8, 4],
        tension: 0.2,
        fill: false,
        pointRadius: 4,
      });
    }
    return { labels, datasets };
  }, [payload]);

  const barData = useMemo(() => {
    const t = payload?.prediction?.comparison?.totals_four_week;
    if (!t) return null;
    return {
      labels: ["4-week total demand"],
      datasets: [
        {
          label: "Smarter forecast total",
          data: [t.with_ml],
          backgroundColor: "rgba(46, 196, 182, 0.75)",
          borderRadius: 8,
        },
        {
          label: "Copy-last-week total",
          data: [t.without_ml_naive],
          backgroundColor: "rgba(251, 146, 60, 0.75)",
          borderRadius: 8,
        },
      ],
    };
  }, [payload]);

  const ins = payload?.insights;
  const fin = ins?.illustrative_impact;
  const skuLabel = payload?.prediction?.sku_id || skuId;
  const retailer = useMemo(() => {
    if (!payload?.prediction) return null;
    return getRetailerGuidance(payload.prediction, payload.insights, skuLabel);
  }, [payload, skuLabel]);

  const sameCurve =
    payload?.prediction?.comparison?.baseline_forecast &&
    payload.prediction.forecast?.every(
      (p, i) =>
        Math.abs(
          p.forecast -
            (payload.prediction.comparison.baseline_forecast[i]?.forecast ?? 0)
        ) < 0.01
    );

  return (
    <>
      <DashboardNavbar toggleTheme={toggleTheme} />

      <div className="container presentation-wrap">
        <header className="presentation-hero card">
          <p className="presentation-kicker">Admin · for store owners</p>
          <h1 className="presentation-title">Demand forecast &amp; shop advice</h1>
          <p className="presentation-sub">
            Paste or load sales, then read the <strong>plain-English summary</strong> and <strong>do this next</strong>{" "}
            list. Charts show teal = smarter plan, orange = &quot;same as last week.&quot; Technical costs and JSON
            stay tucked under &quot;Technical details&quot;. <em>Staff cannot open this page.</em>
          </p>
        </header>

        <div className="card presentation-form-card">
          <h3>Inputs</h3>
          <form onSubmit={handleSubmit} className="presentation-form">
            <div className="presentation-grid">
              <label>
                Store ID <small style={{ opacity: 0.7 }}>(matches Sale.storeId)</small>
                <input
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  disabled={loading}
                />
              </label>
              <label>
                SKU <small style={{ opacity: 0.7 }}>(matches Product.sku)</small>
                <input
                  value={skuId}
                  onChange={(e) => setSkuId(e.target.value)}
                  disabled={loading}
                />
              </label>
              <label>
                Ordering cost (₹ / order)
                <input
                  value={orderingCost}
                  onChange={(e) => setOrderingCost(e.target.value)}
                  disabled={loading}
                  placeholder="50"
                />
              </label>
              <label>
                Holding cost (₹ / unit / year) — optional
                <input
                  value={holdingCost}
                  onChange={(e) => setHoldingCost(e.target.value)}
                  disabled={loading}
                  placeholder="from Product or default"
                />
              </label>
              <label>
                Unit margin (₹) — illustrative understock
                <input
                  value={unitMargin}
                  onChange={(e) => setUnitMargin(e.target.value)}
                  disabled={loading}
                  placeholder="15"
                />
              </label>
            </div>
            <label className="presentation-json-label">
              Sales history JSON <small>(date, sku_id, sales)</small>
              <textarea
                value={dataJson}
                onChange={(e) => setDataJson(e.target.value)}
                disabled={loading}
                rows={8}
              />
            </label>
            <button type="submit" className="approve-btn presentation-cta" disabled={loading}>
              {loading ? "Running prediction…" : "Get forecast &amp; shop advice"}
            </button>
          </form>
        </div>

        {error && (
          <div className="card presentation-error">
            <strong>Error</strong>
            <p>{error}</p>
          </div>
        )}

        {payload && retailer && (
          <>
            <div className="card retailer-plain-card">
              <h2 className="retailer-plain-title">What this means for your shop</h2>
              <p className="retailer-plain-lead">
                Short read — no jargon. Orange line = &quot;I&apos;ll sell what I sold last week again.&quot;
                Teal = smarter pattern (AI if trained, otherwise a fair average).
              </p>

              {retailer.totalSmart != null && (
                <p className="retailer-plain-p">
                  For <strong>{retailer.skuDisplay}</strong>, plan for about{" "}
                  <strong>{retailer.totalSmart} units</strong> to move in the <strong>next 4 weeks</strong>
                  {retailer.avgWeek != null && (
                    <>
                      {" "}
                      (roughly <strong>{retailer.avgWeek} units per week</strong> on average)
                    </>
                  )}
                  .
                </p>
              )}

              {retailer.diff != null &&
                retailer.diffAbs != null &&
                retailer.diffAbs >= 0.5 &&
                (retailer.diff > 0 ? (
                  <p className="retailer-plain-p retailer-plain-highlight">
                    That is <strong>{retailer.diff} more units</strong> than only copying last week.{" "}
                    <strong>Don&apos;t understock</strong> — you could lose sales if you order too little.
                  </p>
                ) : (
                  <p className="retailer-plain-p retailer-plain-highlight">
                    That is <strong>{retailer.diffAbs} fewer units</strong> than copying last week every week.{" "}
                    <strong>Don&apos;t over-order</strong> if last week was unusually busy.
                  </p>
                ))}

              {retailer.diff != null && retailer.diffAbs != null && retailer.diffAbs < 0.5 && (
                <p className="retailer-plain-p">
                  The two plans agree on total 4-week demand — your risk is balanced if last week was typical.
                </p>
              )}

              <h3 className="retailer-actions-heading">Do this next</h3>
              <ol className="retailer-action-list">
                {retailer.actions.map((a, idx) => (
                  <li key={idx}>
                    <strong>{a.title}:</strong> {a.text}
                  </li>
                ))}
              </ol>
              <p className="retailer-mini-note">
                Numbers are estimates from your pasted sales. For exact accounts, use your books — this page helps
                you decide <em>how much to stock and when to reorder</em>.
              </p>
            </div>

            {sameCurve && (
              <div className="card presentation-banner">
                Both lines sit on top of each other: last week matches the main forecast each week (or you&apos;re
                still on the simple average until the model is trained). Add more varied weeks of sales or{" "}
                <strong>train the model</strong> to separate the curves.
              </div>
            )}

            <div className="presentation-kpi-row">
              <div className="card presentation-kpi">
                <span className="kpi-label">Balanced order size</span>
                <span className="kpi-value">{ins?.eoq?.eoq_units_aligned_with_ml ?? "—"}</span>
                <span className="kpi-hint">units per supplier order (recommended)</span>
              </div>
              <div className="card presentation-kpi">
                <span className="kpi-label">Order size if you only use last week</span>
                <span className="kpi-value">
                  {ins?.eoq?.eoq_units_aligned_with_naive_plan ?? "—"}
                </span>
                <span className="kpi-hint">units per order (simple rule)</span>
              </div>
              <div className="card presentation-kpi kpi-accent">
                <span className="kpi-label">Rough win or cost (demo)</span>
                <span className="kpi-value">{formatInr(fin?.net_illustrative_signal_inr)}</span>
                <span className="kpi-hint">
                  {Number(fin?.net_illustrative_signal_inr) > 0
                    ? "leaning toward missed sales if you plan too tight"
                    : Number(fin?.net_illustrative_signal_inr) < 0
                      ? "leaning toward extra shelf cost if you plan too loose"
                      : "balanced either way"}
                </span>
              </div>
            </div>

            <div className="presentation-chart-grid">
              {lineData && (
                <div className="card presentation-chart-card">
                  <div className="chart-inner">
                    <Line data={lineData} options={chartOptions} />
                  </div>
                </div>
              )}
              {barData && (
                <div className="card presentation-chart-card">
                  <div className="chart-inner chart-inner-bar">
                    <Bar data={barData} options={barOptions} />
                  </div>
                </div>
              )}
            </div>

            <details className="card" style={{ marginTop: "1rem" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                Technical details (costs, yearly demand, disclaimers)
              </summary>
              <div className="presentation-insight-grid" style={{ marginTop: "1rem" }}>
                <div>
                  <h4>Behind the money hints</h4>
                  <ul className="presentation-list">
                    <li>
                      If you plan too high vs this forecast: about{" "}
                      <strong>{fin?.naive_over_forecasts_vs_ml_units ?? 0}</strong> extra units over 4 weeks →
                      rough extra shelf cost ~ <strong>{formatInr(fin?.rough_extra_holding_exposure_4w_inr)}</strong>
                    </li>
                    <li>
                      If you plan too low: about <strong>{fin?.naive_under_forecasts_vs_ml_units ?? 0}</strong>{" "}
                      units short → rough missed profit ~{" "}
                      <strong>{formatInr(fin?.rough_missed_profit_if_understocked_inr)}</strong> (assumed ₹
                      {fin?.unit_margin_assumption_inr}/unit margin)
                    </li>
                  </ul>
                  <p className="presentation-disclaimer">{fin?.disclaimer}</p>
                </div>
                <div>
                  <h4>Numbers used for order-size math</h4>
                  <table className="presentation-table">
                    <tbody>
                      <tr>
                        <td>Cost each time you place an order</td>
                        <td>{formatInr(ins?.eoq?.ordering_cost_per_order)}</td>
                      </tr>
                      <tr>
                        <td>Cost to hold 1 unit for a year</td>
                        <td>{formatInr(ins?.eoq?.holding_cost_per_unit_year)}</td>
                      </tr>
                      <tr>
                        <td>Year demand (smart forecast)</td>
                        <td>{ins?.eoq?.annualized_demand_from_ml ?? "—"} units</td>
                      </tr>
                      <tr>
                        <td>Year demand (copy last week)</td>
                        <td>{ins?.eoq?.annualized_demand_from_naive_plan ?? "—"} units</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </details>

            <details className="card" style={{ marginTop: "1rem" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                Saved log (admin) · Log ID: {String(payload.logId)}
              </summary>
              <p style={{ marginTop: 8, fontSize: 13, color: "var(--text-muted)" }}>
                Stored in MongoDB collection <code>predictionlogs</code> for audit.
              </p>
            </details>

            <details className="card" style={{ marginTop: "1rem" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>Raw API response (JSON)</summary>
              <pre
                style={{
                  marginTop: 12,
                  padding: 12,
                  overflow: "auto",
                  maxHeight: 360,
                  fontSize: 12,
                  background: "var(--glass-bg)",
                  borderRadius: 8,
                }}
              >
                {JSON.stringify(payload, null, 2)}
              </pre>
            </details>
          </>
        )}
      </div>
    </>
  );
}

export default Predict;
