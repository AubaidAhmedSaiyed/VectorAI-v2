import React, { useState, useEffect, useCallback } from "react";
import DashboardNavbar from "../../components/DashboardNavbar";
import { getInventoryList } from "../../Api/Api";

function StaffReports({ toggleTheme }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getInventoryList({ limit: 200 });
      setRows(res.items || []);
    } catch (e) {
      setError(e.message || "Could not load data");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const downloadCsv = () => {
    const header = ["name", "sku", "quantity", "price", "category"];
    const lines = [header.join(",")].concat(
      rows.map((r) =>
        [
          JSON.stringify(r.name || ""),
          JSON.stringify(r.sku || ""),
          r.quantity ?? 0,
          r.price ?? 0,
          JSON.stringify(r.category || ""),
        ].join(",")
      )
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shift-stock-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToastMsg("CSV downloaded.");
    setTimeout(() => setToastMsg(""), 3000);
  };

  return (
    <>
      <DashboardNavbar toggleTheme={toggleTheme} />
      <div className="container">
        <div className="card">
          <h3>End of shift — stock snapshot</h3>
          <p className="note" style={{ marginBottom: 12 }}>
            Current shelf file from <code>GET /api/inventory</code>. Export as CSV for your records.
          </p>

          {loading && <p>Loading…</p>}
          {error && <p style={{ color: "var(--danger, #c94c4c)" }}>{error}</p>}

          {!loading && !!rows.length && (
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Qty</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id}>
                    <td>{r.name}</td>
                    <td>{r.sku}</td>
                    <td className="numeric">{r.quantity}</td>
                    <td className="numeric">{r.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: 20 }}>
            <button type="button" className="approve-btn" onClick={downloadCsv} disabled={loading || !rows.length}>
              Download CSV report
            </button>
            <button type="button" className="ghost-btn" style={{ marginLeft: 10 }} onClick={load} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>
      </div>
      {toastMsg && <div className="toast-notification">{toastMsg}</div>}
    </>
  );
}

export default StaffReports;
