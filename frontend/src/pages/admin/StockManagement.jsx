import React, { useState, useEffect, useCallback } from "react";
import DashboardNavbar from "../../components/DashboardNavbar";
import { getInventoryList, getProductsList, updateInventoryItem } from "../../Api/Api";

function StockManagement({ toggleTheme }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [invRes, prodRes] = await Promise.all([
        getInventoryList({ limit: 200 }),
        getProductsList({ limit: 200 }),
      ]);
      const items = invRes.items || [];
      const products = prodRes.products || [];
      const bySku = Object.fromEntries(products.map((p) => [p.sku, p]));
      setRows(
        items.map((inv) => {
          const cat = bySku[inv.sku];
          const systemQty = Number(inv.quantity) || 0;
          const catalog = cat != null ? Number(cat.totalStock) : null;
          return {
            _id: inv._id,
            name: inv.name,
            sku: inv.sku,
            systemQty,
            catalogStock: catalog,
            counted: systemQty,
          };
        })
      );
    } catch (e) {
      setError(e.message || "Could not load inventory");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setCounted = (id, val) => {
    const n = val === "" ? NaN : Number(val);
    setRows((prev) =>
      prev.map((r) =>
        r._id === id ? { ...r, counted: Number.isFinite(n) ? n : r.counted } : r
      )
    );
  };

  const handleApproveAudit = async () => {
    setSaving(true);
    setToastMsg("");
    setError("");
    try {
      const updates = rows.filter((r) => Number(r.counted) !== Number(r.systemQty));
      for (const r of updates) {
        await updateInventoryItem(r._id, { quantity: Math.max(0, Math.round(Number(r.counted))) });
      }
      setToastMsg(
        updates.length
          ? `Reconciled ${updates.length} line(s). Inventory counts updated in the database.`
          : "No variances — counts already match the system."
      );
      await load();
    } catch (e) {
      setError(e.message || "Update failed — are you logged in?");
    } finally {
      setSaving(false);
      setTimeout(() => setToastMsg(""), 5000);
    }
  };

  return (
    <>
      <DashboardNavbar toggleTheme={toggleTheme} />

      <div className="container">
        <div className="card">
          <h3>Stock audit — reconcile shelf vs system</h3>
          <p className="note" style={{ marginBottom: 12 }}>
            <strong>System Qty</strong> is from <code>Inventory</code>. Edit <strong>Counted</strong> after a physical
            count, then approve to write counts to the API (same as PUT <code>/api/inventory/:id</code>).{" "}
            <strong>Catalog</strong> is <code>Product.totalStock</code> for a quick cross-check.
          </p>

          {loading && <p>Loading inventory…</p>}
          {error && (
            <p style={{ color: "var(--danger, #c94c4c)", marginBottom: 8 }}>{error}</p>
          )}

          {!loading && !rows.length && !error && (
            <p>No inventory rows yet. Seed the database or add stock from the admin dashboard.</p>
          )}

          {!!rows.length && (
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>System Qty</th>
                  <th>Catalog stock</th>
                  <th>Counted</th>
                  <th>Variance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const v = Number(r.counted) - Number(r.systemQty);
                  return (
                    <tr key={r._id}>
                      <td>{r.name}</td>
                      <td>{r.sku}</td>
                      <td className="numeric">{r.systemQty}</td>
                      <td className="numeric">{r.catalogStock ?? "—"}</td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={r.counted}
                          onChange={(e) => setCounted(r._id, e.target.value)}
                          style={{ width: 90 }}
                        />
                      </td>
                      <td className="numeric">{Number.isFinite(v) ? v : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: 20 }}>
            <button
              type="button"
              className={`approve-btn ${saving ? "btn-processing" : ""}`}
              onClick={handleApproveAudit}
              disabled={saving || loading}
            >
              {saving ? "Saving…" : "Approve audit & update inventory"}
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

export default StockManagement;
