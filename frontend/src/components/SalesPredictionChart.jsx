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

// ✅ GLOBAL CHART FONT CONFIG
ChartJS.defaults.font.family = "'Poppins', sans-serif";

function SalesPredictionChart({ theme = "dark", isStatic = false }) {
  const [dataPoints, setDataPoints] = useState([]);
  const [loading, setLoading] = useState(!isStatic);

  useEffect(() => {
    if (isStatic) {
      const dummyData = [
        { week: "Week 1", sales: 1000, predicted: null },
        { week: "Week 2", sales: 1200, predicted: null },
        { week: "Week 3", sales: 1100, predicted: null },
        { week: "Week 4", sales: 1300, predicted: 1300 }, // Overlap for continuous line styling visual
        { week: "Week 5", sales: null, predicted: 1400 },
        { week: "Week 6", sales: null, predicted: 1500 },
        { week: "Week 7", sales: null, predicted: 1600 },
        { week: "Week 8", sales: null, predicted: 1700 }
      ];
      setDataPoints(dummyData);
      return;
    }

    const fetchData = async () => {
      try {
        const response = await fetch("/api/ml/forecast/store_1");
        if (response.ok) {
          const result = await response.json();
          // Assume result format or fallback to dummy if it's missing expected properties
          if (Array.isArray(result) && result.length > 0) {
            setDataPoints(result);
          } else {
            throw new Error("Invalid format");
          }
        } else {
          throw new Error("Failed to fetch");
        }
      } catch (error) {
        console.error("Forecast API error, falling back to dummy data:", error);
        setDataPoints([
          { week: "Week 1", sales: 1000, predicted: null },
          { week: "Week 2", sales: 1200, predicted: null },
          { week: "Week 3", sales: 1100, predicted: null },
          { week: "Week 4", sales: 1300, predicted: 1300 }, // Overlap to connect lines
          { week: "Week 5", sales: null, predicted: 1400 },
          { week: "Week 6", sales: null, predicted: 1500 },
          { week: "Week 7", sales: null, predicted: 1600 },
          { week: "Week 8", sales: null, predicted: 1700 }
        ]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isStatic]);

  const hasLight = theme === "light";
  const textColor = hasLight ? "#64748b" : "#9ca3af";
  const gridColor = hasLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)";
  const legendColor = hasLight ? "#0f172a" : "#e5e7eb";

  const labels = dataPoints.map(d => d.week);
  const actualSales = dataPoints.map(d => d.sales);
  const predictedSales = dataPoints.map(d => d.predicted);

  const data = {
    labels,
    datasets: [
      {
        label: "Actual Sales (₹)",
        data: actualSales,
        borderColor: "#06b6d4", // Cyan
        backgroundColor: "rgba(6,182,212,0.15)",
        borderWidth: 2.5,
        tension: 0.4,
        pointRadius: 3,
        fill: true,
      },
      {
        label: "Predicted Sales (₹)",
        data: predictedSales,
        borderColor: "#f59e0b", // Amber/Orange to match dark+teal theme accent
        backgroundColor: "rgba(245,158,11,0.1)",
        borderWidth: 2.5,
        borderDash: [5, 5], // Dashed line for prediction
        tension: 0.4,
        pointRadius: 3,
        fill: true,
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
            family: "'Poppins', sans-serif",
          },
        },
      },
      tooltip: {
        backgroundColor: hasLight ? "#ffffff" : "#0f172a",
        titleColor: hasLight ? "#0f172a" : "#f1f5f9",
        bodyColor: hasLight ? "#334155" : "#cbd5e1",
        borderColor: hasLight ? "#e2e8f0" : "rgba(255,255,255,0.1)",
        borderWidth: 1,
        titleFont: { family: "'Poppins', sans-serif", size: 12 },
        bodyFont: { family: "'Baloo Bhai 2', cursive", size: 13 },
        callbacks: {
          label: (ctx) => `₹ ${ctx.raw ? Math.round(ctx.raw).toLocaleString() : 0}`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: textColor,
          font: { family: "'Poppins', sans-serif", size: 11 },
        },
        grid: { display: false },
      },
      y: {
        ticks: {
          color: textColor,
          font: { family: "'Baloo Bhai 2', cursive", size: 11 },
          callback: (value) => `₹${Number(value).toLocaleString()}`,
        },
        grid: { color: gridColor },
      },
    },
  };

  if (loading) {
    return (
      <div style={{ height: "100%", minHeight: "200px", display: "flex", alignItems: "center", justifyContent: "center", color: textColor }}>
        Loading predictions...
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height: "200px", width: "100%" }}>
      <Line data={data} options={options} />
    </div>
  );
}

export default SalesPredictionChart;
