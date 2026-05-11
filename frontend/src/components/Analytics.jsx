import React, { useEffect, useState } from "react";
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

const STATIC_LANDING_TREND = {
  labels: ["W1", "W2", "W3", "W4"],
  revenue: [10000, 12000, 11500, 13200],
  profit: [2000, 2600, 2200, 2800],
};

function Analytics({ theme = "dark", useLiveData = true }) {
  const [trend, setTrend] = useState(() =>
    useLiveData ? { labels: [], revenue: [], profit: [] } : STATIC_LANDING_TREND
  );
  const [loading, setLoading] = useState(() => !!useLiveData);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!useLiveData) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/revenue-trend?weeks=8&storeId=store_1");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Could not load revenue trend");
        if (cancelled) return;
        setTrend({
          labels: data.labels || [],
          revenue: data.revenue || [],
          profit: data.profit || [],
        });
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load chart");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useLiveData]);

  const hasLight = theme === "light";
  const textColor = hasLight ? "#7a7385" : "#9d948a";
  const gridColor = hasLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)";
  const legendColor = hasLight ? "#16131a" : "#f4f1ea";
  const linePrimary = hasLight ? "#4a6679" : "#8fa3b8";
  const lineSecondary = hasLight ? "#a86056" : "#c9867a";

  const data = {
    labels: trend.labels,
    datasets: [
      {
        label: "Revenue (₹)",
        data: trend.revenue,
        borderColor: linePrimary,
        backgroundColor: hasLight ? "rgba(74, 102, 121, 0.1)" : "rgba(143, 163, 184, 0.12)",
        borderWidth: 2.5,
        tension: 0.35,
        pointRadius: 3,
        fill: true,
      },
      {
        label: "Gross profit (₹)",
        data: trend.profit,
        borderColor: lineSecondary,
        backgroundColor: hasLight ? "rgba(168, 96, 86, 0.1)" : "rgba(201, 134, 122, 0.1)",
        borderWidth: 2.5,
        tension: 0.35,
        pointRadius: 3,
        fill: true,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
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
        titleFont: {
          family: "'Outfit', sans-serif",
        },
        bodyFont: {
          family: "'JetBrains Mono', monospace",
          size: 14,
        },
        callbacks: {
          label: (ctx) =>
            `${ctx.dataset.label}: ₹ ${Math.round(
              ctx.raw ?? 0
            ).toLocaleString()}`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: textColor,
          font: {
            family: "'Outfit', sans-serif",
          },
          maxRotation: 45,
          minRotation: 0,
        },
        grid: {
          display: false,
        },
      },
      y: {
        ticks: {
          color: textColor,
          font: {
            family: "'JetBrains Mono', monospace",
            size: 12,
          },
          callback: (value) =>
            `₹${Number(value).toLocaleString()}`,
        },
        grid: {
          color: gridColor,
        },
      },
    },
  };

  if (loading) {
    return (
      <div style={{ height: "200px", display: "flex", alignItems: "center", justifyContent: "center", color: textColor }}>
        Loading revenue from database…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: "200px", display: "flex", alignItems: "center", justifyContent: "center", color: "#c9867a", fontSize: 13 }}>
        {error}
      </div>
    );
  }

  if (!trend.revenue.length) {
    return (
      <div style={{ height: "200px", display: "flex", alignItems: "center", justifyContent: "center", color: textColor, fontSize: 13 }}>
        No weekly sales yet for this store. Seed the database or record sales.
      </div>
    );
  }

  return (
    <div style={{ minHeight: "200px" }}>
      {!useLiveData && (
        <p style={{ fontSize: 11, color: textColor, margin: "0 0 6px 0", opacity: 0.85 }}>
          Example curve — open the admin dashboard for live database data.
        </p>
      )}
      <div style={{ height: "200px" }}>
        <Line data={data} options={options} />
      </div>
    </div>
  );
}

export default Analytics;
