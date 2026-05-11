import React, { useState, useEffect, useCallback } from "react";
import DashboardNavbar from "../../components/DashboardNavbar";
import { getInventoryList, updateInventoryItem } from "../../Api/Api";

function StaffOrders({ toggleTheme }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getInventoryList({ limit: 200 });
      const items = res.items || [];
      setRows(
        items.map((inv) => ({
          _id: inv._id,
          name: inv.name,
          sku: inv.sku,
          systemQty: Number(inv.quantity) || 0,
          physical: String(Number(inv.quantity) || 0),
        }))
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

  const setPhysical = (id, val) => {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, physical: val } : r)));
  };

  const handleSubmitAudit = async () => {
    setSaving(true);
    setToastMsg("");
    setError("");
    const changes = rows.filter((r) => {
      const p = Number(r.physical);
      return Number.isFinite(p) && Math.round(p) !== Number(r.systemQty);
    });
    try {
      for (const r of changes) {
        const qty = Math.max(0, Math.round(Number(r.physical)));
        await updateInventoryItem(r._id, { quantity: qty });
      }
      setToastMsg(
        changes.length
          ? `Submitted ${changes.length} count update(s) to the server.`
          : "No changes — physical counts match the system."
      );
      await load();
    } catch (e) {
      setError(e.message || "Submit failed — log in as staff?");
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
          <h3>Physical audit</h3>
          <p className="note" style={{ marginBottom: 12 }}>
            Enter shelf counts. Submitting writes <code>PUT /api/inventory/:id</code> for each changed row (requires
            login).
          </p>

          {loading && <p>Loading…</p>}
          {error && <p style={{ color: "var(--danger, #c94c4c)", marginBottom: 8 }}>{error}</p>}

          {!loading && !rows.length && !error && <p>No inventory to audit.</p>}

          {!!rows.length && (
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>System Qty</th>
                  <th>Physical count</th>
                  <th>Variance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = Number(r.physical);
                  const v = Number.isFinite(p) ? Math.round(p) - r.systemQty : null;
                  return (
                    <tr key={r._id}>
                      <td>{r.name}</td>
                      <td>{r.sku}</td>
                      <td className="numeric">{r.systemQty}</td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={r.physical}
                          onChange={(e) => setPhysical(r._id, e.target.value)}
                          style={{ width: 100 }}
                        />
                      </td>
                      <td className="numeric">{v == null ? "—" : v}</td>
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
              onClick={handleSubmitAudit}
              disabled={saving || loading}
            >
              {saving ? "Submitting…" : "Submit audit"}
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

export default StaffOrders;
