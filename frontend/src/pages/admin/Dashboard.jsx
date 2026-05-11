import React, { useState, useEffect, useCallback, useRef } from "react";
import DashboardNavbar from "../../components/DashboardNavbar";
import Analytics from "../../components/Analytics";
import SalesPredictionChart from "../../components/SalesPredictionChart";
import { downloadDashboardReportPdf } from "../../Api/Api";

function AdminDashboard({ toggleTheme }) {
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState({
    todayRevenue: 0,
    revenueGrowth: 0,
    lowStockCount: 0,
    pendingOrders: 0,
  });
  const [suggestions, setSuggestions] = useState([]);
  const [uploadMsg, setUploadMsg] = useState("");
  const [pdfMsg, setPdfMsg] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const fileRef = useRef(null);

  const fetchDashboardData = useCallback(async () => {
    const q = "?storeId=store_1";
    try {
      const [summaryRes, suggestionsRes] = await Promise.all([
        fetch(`/api/dashboard/summary${q}`),
        fetch(`/api/dashboard/suggestions${q}`),
      ]);
      if (summaryRes.ok) {
        const summary = await summaryRes.json();
        setSummaryData(summary);
      }
      if (suggestionsRes.ok) {
        const suggs = await suggestionsRes.json();
        setSuggestions(suggs);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const onInventoryFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadMsg("Uploading…");
    const fd = new FormData();
    fd.append("file", file);
    const headers = {};
    const t = localStorage.getItem("token");
    if (t) headers.Authorization = `Bearer ${t}`;
    try {
      const r = await fetch("/api/inventory/upload", { method: "POST", headers, body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || r.statusText);
      setUploadMsg(j.message || "Upload complete.");
      fetchDashboardData();
    } catch (err) {
      setUploadMsg(err.message || "Upload failed");
    }
    e.target.value = "";
  };

  const handlePdf = async () => {
    setPdfMsg("");
    setPdfLoading(true);
    try {
      await downloadDashboardReportPdf("store_1");
      setPdfMsg("Report downloaded.");
    } catch (err) {
      setPdfMsg(err.message || "PDF failed — log in as admin/staff first.");
    } finally {
      setPdfLoading(false);
      setTimeout(() => setPdfMsg(""), 5000);
    }
  };

  return (
    <>
      <DashboardNavbar toggleTheme={toggleTheme} />

      <div className="container">
        <div className="analytics-row">
          <div className="dashboard-header">
            <div className="header-left">
              <h2>Admin Dashboard</h2>
              <p className="header-subtitle">
                Metrics and charts read from MongoDB (store_1). Seed data if empty.
              </p>
            </div>

            <div className="header-right" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="login-btn"
                style={{ padding: "8px 14px", fontSize: 14 }}
                onClick={handlePdf}
                disabled={pdfLoading}
              >
                {pdfLoading ? "Building PDF…" : "Download PDF report"}
              </button>
            </div>
          </div>

          {pdfMsg && (
            <p style={{ fontSize: 13, margin: "0 0 8px 0", opacity: 0.9 }}>{pdfMsg}</p>
          )}

          <div className="card">
            <h3>Pending purchase orders</h3>
            <h2 className="numeric">{loading ? "…" : summaryData.pendingOrders}</h2>
          </div>
          <div className="card">
            <h3>Today revenue</h3>
            <h2 className="numeric">₹ {summaryData.todayRevenue.toLocaleString()}</h2>
            <p className="growth positive">
              {summaryData.revenueGrowth >= 0 ? "+" : ""}
              {summaryData.revenueGrowth}% from yesterday
            </p>
          </div>
          <div className="card">
            <h3>Low stock items</h3>
            <h2 className="numeric">{loading ? "…" : summaryData.lowStockCount}</h2>
          </div>
        </div>

        <div className="card">
          <h3>AI strategic suggestions</h3>

          <div className="suggestion-list">
            {suggestions.map((suggestion, index) => (
              <div key={index} className="suggestion-item">
                <h4 className="suggestion-title">{suggestion.title}</h4>
                <p className="suggestion-text">
                  <span>
                    {suggestion.type === "low_stock"
                      ? "Risk:"
                      : suggestion.type === "expiring"
                        ? "Expiry:"
                        : "Info:"}
                  </span>{" "}
                  {suggestion.text}
                </p>
                {suggestion.type === "expiring" && (
                  <p className="suggestion-offer">Consider a short promotion before expiry.</p>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="analytics-row">
          <div className="card">
            <h3>Revenue trend (database)</h3>
            <Analytics theme="dark" useLiveData />
          </div>
          <div className="card">
            <h3>AI sales prediction (database + ML)</h3>
            <SalesPredictionChart theme="dark" />
          </div>
        </div>
        <div className="card">
          <h3>Bulk inventory upload</h3>
          <p style={{ fontSize: 13, marginBottom: 10, opacity: 0.9 }}>
            CSV / Excel — requires login token. Same as <code>POST /api/inventory/upload</code>.
          </p>
          <label className="csv-upload-box">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={onInventoryFile} />
            <div
              className="csv-upload-content"
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") fileRef.current?.click();
              }}
            >
              <div className="csv-icon">📁</div>
              <div className="csv-title">Click to upload CSV or Excel</div>
            </div>
          </label>
          {uploadMsg && <p style={{ marginTop: 10, fontSize: 13 }}>{uploadMsg}</p>}
        </div>
      </div>
    </>
  );
}

export default AdminDashboard;
