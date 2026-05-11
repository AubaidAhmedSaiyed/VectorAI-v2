import React, { useState, useEffect, useCallback } from "react";
import DashboardNavbar from "../../components/DashboardNavbar";
import { getInventoryList, getBatchesList } from "../../Api/Api";

function nearestExpiryForSku(batches, sku) {
  const hits = batches.filter((b) => b.product?.sku === sku && b.expiryDate);
  if (!hits.length) return null;
  hits.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  return hits[0].expiryDate;
}

function StaffStockManagement({ toggleTheme }) {
  const [rows, setRows] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [inv, bat] = await Promise.all([
        getInventoryList({ limit: 200 }),
        getBatchesList({ status: "Active", limit: 200 }),
      ]);
      const list = inv.items || [];
      const bl = bat.batches || [];
      setBatches(bl);
      setRows(
        list.map((it) => ({
          ...it,
          expiry: nearestExpiryForSku(bl, it.sku),
        }))
      );
    } catch (e) {
      setError(e.message || "Could not load stock");
      setRows([]);
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
          <h2>Staff — Stock overview</h2>
          <p className="note">Live inventory with nearest batch expiry per SKU when available.</p>
        </div>

        <div className="card">
          <h3>Available stock</h3>
          {loading && <p>Loading…</p>}
          {error && <p style={{ color: "var(--danger, #c94c4c)" }}>{error}</p>}
          {!loading && !rows.length && !error && <p>No inventory rows.</p>}
          {!!rows.length && (
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Quantity</th>
                  <th>Nearest expiry</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item._id || item.sku}>
                    <td>{item.name}</td>
                    <td>{item.sku}</td>
                    <td className="numeric">{item.quantity}</td>
                    <td>
                      {item.expiry ? new Date(item.expiry).toLocaleDateString() : "—"}
                    </td>
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

export default StaffStockManagement;
