import React, { useState, useEffect, useCallback } from "react";
import DashboardNavbar from "../../components/DashboardNavbar";
import { getDashboardSuggestions, getBatchesList } from "../../Api/Api";

function StaffIntelligence({ toggleTheme }) {
  const [suggestions, setSuggestions] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, b] = await Promise.all([
        getDashboardSuggestions("store_1"),
        getBatchesList({ expiring: 14, status: "Active", limit: 50 }),
      ]);
      setSuggestions(Array.isArray(s) ? s : []);
      setBatches(b.batches || []);
    } catch (e) {
      setError(e.message || "Could not load alerts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <DashboardNavbar toggleTheme={toggleTheme} />
      <div className="container">
        <div className="card">
          <h2>Staff — Alerts &amp; expiries</h2>
          {loading && <p>Loading…</p>}
          {error && <p style={{ color: "var(--danger, #c94c4c)" }}>{error}</p>}

          <h3 style={{ marginTop: 8 }}>Suggestions</h3>
          {!loading && !suggestions.length && <p className="note">No active suggestions.</p>}
          <div className="suggestion-list">
            {suggestions.map((x, i) => (
              <div key={i} className="suggestion-item">
                <h4 className="suggestion-title">{x.title}</h4>
                <p className="suggestion-text">{x.text}</p>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: 20 }}>Batches expiring within 14 days</h3>
          {!loading && !batches.length && <p className="note">None flagged.</p>}
          {!!batches.length && (
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Expiry</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b._id}>
                    <td>{b.product?.name || b.product?.sku || "—"}</td>
                    <td className="numeric">{b.currentQty}</td>
                    <td>{b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button type="button" className="ghost-btn" style={{ marginTop: 12 }} onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>
    </>
  );
}

export default StaffIntelligence;
