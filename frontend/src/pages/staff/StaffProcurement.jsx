import React, { useState, useEffect, useCallback } from "react";
import DashboardNavbar from "../../components/DashboardNavbar";
import { getPurchaseOrdersList } from "../../Api/Api";

function StaffProcurement({ toggleTheme }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getPurchaseOrdersList({ limit: 50 });
      setRows(res.purchase_orders || []);
    } catch (e) {
      setError(e.message || "Could not load purchase orders");
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
          <h2>Staff — Purchase orders</h2>
          <p className="note">Read-only view of open and recent POs from the database.</p>
          {loading && <p>Loading…</p>}
          {error && <p style={{ color: "var(--danger, #c94c4c)" }}>{error}</p>}
          {!loading && !rows.length && !error && <p>No purchase orders yet.</p>}
          {!!rows.length && (
            <table>
              <thead>
                <tr>
                  <th>PO #</th>
                  <th>Supplier</th>
                  <th>Status</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((po) => (
                  <tr key={po._id}>
                    <td>{po.poNumber}</td>
                    <td>{po.supplier}</td>
                    <td>{po.status}</td>
                    <td>
                      {(po.items || [])
                        .map((it) => `${it.product?.sku || "?"} × ${it.orderedQty}`)
                        .join(", ")}
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

export default StaffProcurement;
