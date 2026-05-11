import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import DashboardNavbar from "../../components/DashboardNavbar";
import { getBatchesList, getProductsList } from "../../Api/Api";

function Intelligence({ toggleTheme }) {
  const [batches, setBatches] = useState([]);
  const [topStock, setTopStock] = useState([]);
  const [expiryValue, setExpiryValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [bRes, pRes] = await Promise.all([
        getBatchesList({ expiring: 7, status: "Active", limit: 100 }),
        getProductsList({ limit: 200 }),
      ]);
      const list = bRes.batches || [];
      setBatches(list);
      let rupee = 0;
      for (const b of list) {
        const cost = Number(b.product?.costPrice ?? b.product?.sellingPrice ?? 0) || 0;
        rupee += (Number(b.currentQty) || 0) * cost;
      }
      setExpiryValue(Math.round(rupee));
      const prods = (pRes.products || []).slice().sort((a, b) => (b.totalStock || 0) - (a.totalStock || 0));
      setTopStock(prods.slice(0, 8));
    } catch (e) {
      setError(e.message || "Could not load intelligence data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleMarkClearance = () => {
    setToastMsg("Flagged in UI — use procurement or in-store markdown for clearance.");
    setTimeout(() => setToastMsg(""), 4000);
  };

  return (
    <>
      <DashboardNavbar toggleTheme={toggleTheme} />

      <div className="container">
        <div className="card">
          <h3>Demand forecast &amp; shop advice (admin)</h3>
          <p style={{ marginBottom: 12, color: "var(--text-muted)" }}>
            Open the full predictor for charts and logged runs.
          </p>
          <Link className="approve-btn" to="/admin/predict" style={{ display: "inline-block", textDecoration: "none" }}>
            Open forecast &amp; advice
          </Link>
        </div>

        <div className="card">
          <h3>Expiry exposure (next 7 days)</h3>
          {loading && <p>Loading batches…</p>}
          {error && <p style={{ color: "var(--danger, #c94c4c)" }}>{error}</p>}
          {!loading && (
            <p>
              Rough value at cost (catalog):{" "}
              <strong>₹ {expiryValue.toLocaleString("en-IN")}</strong> across{" "}
              <strong>{batches.length}</strong> active batch line(s) with expiry within 7 days.
            </p>
          )}
          {!!batches.length && (
            <table style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Qty</th>
                  <th>Expiry</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b._id}>
                    <td>{b.product?.name || "—"}</td>
                    <td>{b.product?.sku || "—"}</td>
                    <td className="numeric">{b.currentQty}</td>
                    <td>{b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3>High on-hand SKUs (catalog)</h3>
          <p className="note" style={{ marginBottom: 8 }}>
            Sorted by <code>totalStock</code> — use with sales velocity in Forecast.
          </p>
          {!loading && !!topStock.length && (
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Stock</th>
                  <th>Reorder</th>
                </tr>
              </thead>
              <tbody>
                {topStock.map((p) => (
                  <tr key={p.sku}>
                    <td>{p.name}</td>
                    <td>{p.sku}</td>
                    <td className="numeric">{p.totalStock ?? 0}</td>
                    <td className="numeric">{p.reorderPoint ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ marginTop: 16 }}>
            <button type="button" className="approve-btn" onClick={handleMarkClearance}>
              Mark selection for clearance (note)
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

export default Intelligence;
