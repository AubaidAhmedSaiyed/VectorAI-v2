import React, { useState, useEffect } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend
);

ChartJS.defaults.font.family = "'Outfit', sans-serif";

function SalesPredictionChart({ theme = "dark", isStatic = false }) {
  const [dataPoints, setDataPoints] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(!isStatic);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (isStatic) {
      const dummyData = [
        { week: "Week 1", sales: 1000, predicted: null },
        { week: "Week 2", sales: 1200, predicted: null },
        { week: "Week 3", sales: 1100, predicted: null },
        { week: "Week 4", sales: 1300, predicted: 1300 },
        { week: "Week 5", sales: null, predicted: 1400 },
        { week: "Week 6", sales: null, predicted: 1500 },
        { week: "Week 7", sales: null, predicted: 1600 },
        { week: "Week 8", sales: null, predicted: 1700 }
      ];
      setDataPoints(dummyData);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setNote("");
      try {
        const response = await fetch("/api/dashboard/sales-chart?storeId=store_1&histWeeks=8");
        const raw = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(raw.message || "Chart request failed");
        }
        const pts = Array.isArray(raw) ? raw : raw.points;
        if (!Array.isArray(pts)) {
          setDataPoints([]);
          setMeta(raw.forecastMeta || null);
          setNote(raw.message || "Unexpected response shape");
          return;
        }
        setDataPoints(pts);
        setMeta(raw.forecastMeta || null);
        if (raw.sku && raw.productName) {
          setNote(`${raw.productName} (${raw.sku})`);
        } else if (raw.message) {
          setNote(raw.message);
        }
      } catch (error) {
        console.error("Sales chart API error:", error);
        setDataPoints([]);
        setNote(error.message || "Could not load chart");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isStatic]);

  const hasLight = theme === "light";
  const textColor = hasLight ? "#7a7385" : "#9d948a";
  const gridColor = hasLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)";
  const legendColor = hasLight ? "#16131a" : "#f4f1ea";
  const actualColor = hasLight ? "#4a6679" : "#8fa3b8";
  const predictedColor = hasLight ? "#a86056" : "#c9867a";

  const labels = dataPoints.map(d => d.week);
  const actualSales = dataPoints.map(d => (d.sales != null ? Number(d.sales) : null));
  const predictedSales = dataPoints.map(d => (d.predicted != null ? Number(d.predicted) : null));

  const data = {
    labels,
    datasets: [
      {
        label: "Actual revenue (₹)",
        data: actualSales,
        borderColor: actualColor,
        backgroundColor: hasLight ? "rgba(74, 102, 121, 0.1)" : "rgba(143, 163, 184, 0.12)",
        borderWidth: 2.5,
        tension: 0.4,
        pointRadius: 3,
        fill: true,
        spanGaps: false,
      },
      {
        label: "Forecast revenue (₹)",
        data: predictedSales,
        borderColor: predictedColor,
        backgroundColor: hasLight ? "rgba(168, 96, 86, 0.1)" : "rgba(201, 134, 122, 0.1)",
        borderWidth: 2.5,
        borderDash: [5, 5],
        tension: 0.4,
        pointRadius: 3,
        fill: true,
        spanGaps: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
        duration: isStatic ? 2000 : 1000,
        easing: 'easeOutQuart'
    },
    plugins: {
      legend: {
        display: true,
        labels: {
          color: legendColor,
          usePointStyle: true,
          pointStyle: "line",
          font: {
            family: "'Outfit', sans-serif",
          },
        },
      },
      tooltip: {
        backgroundColor: hasLight ? "#fffcf7" : "#100e16",
        titleColor: hasLight ? "#16131a" : "#f4f1ea",
        bodyColor: hasLight ? "#4a4456" : "#c9c2b6",
        borderColor: hasLight ? "#ddd2c6" : "rgba(255,255,255,0.1)",
        borderWidth: 1,
        titleFont: { family: "'Outfit', sans-serif", size: 12 },
        bodyFont: { family: "'JetBrains Mono', monospace", size: 13 },
        callbacks: {
          label: (ctx) => {
            const v = ctx.raw;
            if (v == null || Number.isNaN(v)) return `${ctx.dataset.label}: —`;
            return `${ctx.dataset.label}: ₹ ${Math.round(v).toLocaleString()}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: textColor,
          font: { family: "'Outfit', sans-serif", size: 10 },
          maxRotation: 45,
        },
        grid: { display: false },
      },
      y: {
        ticks: {
          color: textColor,
          font: { family: "'JetBrains Mono', monospace", size: 11 },
          callback: (value) => `₹${Number(value).toLocaleString()}`,
        },
        grid: { color: gridColor },
      },
    },
  };

  if (loading) {
    return (
      <div style={{ height: "100%", minHeight: "200px", display: "flex", alignItems: "center", justifyContent: "center", color: textColor }}>
        Loading chart from database…
      </div>
    );
  }

  if (!dataPoints.length) {
    return (
      <div style={{ minHeight: "200px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: textColor, gap: 8, padding: 12, textAlign: "center" }}>
        <div>{note || "No sales data for charts yet."}</div>
        {meta?.detail && (
          <div style={{ fontSize: 12, opacity: 0.85 }}>{meta.detail}</div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height: "220px", width: "100%" }}>
      {(note || meta?.detail) && (
        <div style={{ fontSize: 11, color: textColor, marginBottom: 6, opacity: 0.9 }}>
          {note}
          {meta?.source === "forecast_unavailable" && meta.detail && ` — ${meta.detail}`}
          {meta?.source === "ml_offline" && ` — ${meta.detail || "ML engine offline"}`}
        </div>
      )}
      <div style={{ height: "200px" }}>
        <Line data={data} options={options} />
      </div>
    </div>
  );
}

export default SalesPredictionChart;
