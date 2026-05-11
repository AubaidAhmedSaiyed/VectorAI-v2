import React, { useState, useEffect, useCallback } from "react";
import DashboardNavbar from "../../components/DashboardNavbar";
import { getProductsList, createPurchaseOrder } from "../../Api/Api";

function suggestedQty(p) {
  const stock = Number(p.totalStock) || 0;
  const reorder = Number(p.reorderPoint) || 10;
  const safety = Number(p.safetyStock) || 5;
  const target = reorder + safety;
  return Math.max(0, Math.ceil(target - stock));
}

function Procurement({ toggleTheme }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [supplier, setSupplier] = useState("Primary supplier");
  const [expectedDate, setExpectedDate] = useState("");
  const [error, setError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getProductsList({ limit: 200 });
      const products = res.products || [];
      setRows(
        products.map((p) => ({
          ...p,
          selected: suggestedQty(p) > 0,
          qty: suggestedQty(p),
        }))
      );
    } catch (e) {
      setError(e.message || "Could not load products");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (sku) => {
    setRows((prev) => prev.map((r) => (r.sku === sku ? { ...r, selected: !r.selected } : r)));
  };

  const setQty = (sku, val) => {
    const n = val === "" ? NaN : Number(val);
    setRows((prev) =>
      prev.map((r) => (r.sku === sku ? { ...r, qty: Number.isFinite(n) ? Math.max(0, Math.round(n)) : r.qty } : r))
    );
  };

  const handleGeneratePO = async () => {
    setSubmitting(true);
    setToastMsg("");
    setError("");
    const items = rows
      .filter((r) => r.selected && r.qty > 0)
      .map((r) => ({
        sku: r.sku,
        orderedQty: r.qty,
        costPerUnit: Number(r.costPrice) || 0,
      }));
    if (!supplier.trim()) {
      setError("Supplier name is required.");
      setSubmitting(false);
      return;
    }
    if (!items.length) {
      setError("Select at least one SKU with order quantity greater than zero.");
      setSubmitting(false);
      return;
    }
    try {
      await createPurchaseOrder({
        supplier: supplier.trim(),
        expectedDate: expectedDate || undefined,
        items,
      });
      setToastMsg(`Purchase order created with ${items.length} line(s).`);
      await load();
    } catch (e) {
      setError(e.message || "Could not create PO — log in as admin?");
    } finally {
      setSubmitting(false);
      setTimeout(() => setToastMsg(""), 5000);
    }
  };

  return (
    <>
      <DashboardNavbar toggleTheme={toggleTheme} />

      <div className="container">
        <div className="card">
          <h3>Procurement — suggested orders from catalog</h3>
          <p className="note" style={{ marginBottom: 12 }}>
            Rows use <code>Product</code> stock vs reorder + safety. Generating a PO calls{" "}
            <code>POST /api/purchase-orders</code> (requires login).
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <label>
              Supplier
              <input value={supplier} onChange={(e) => setSupplier(e.target.value)} style={{ marginLeft: 8 }} />
            </label>
            <label>
              Expected date (optional)
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                style={{ marginLeft: 8 }}
              />
            </label>
          </div>

          {loading && <p>Loading products…</p>}
          {error && <p style={{ color: "var(--danger, #c94c4c)", marginBottom: 8 }}>{error}</p>}

          {!loading && !rows.length && !error && <p>No products in catalog.</p>}

          {!!rows.length && (
            <table>
              <thead>
                <tr>
                  <th>Include</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Current stock</th>
                  <th>Reorder</th>
                  <th>Order qty</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const sug = suggestedQty(r);
                  const reason =
                    sug > 0 ? "Below reorder + safety target" : "Stock sufficient";
                  return (
                    <tr key={r.sku}>
                      <td>
                        <input type="checkbox" checked={r.selected} onChange={() => toggle(r.sku)} />
                      </td>
                      <td>{r.name}</td>
                      <td>{r.sku}</td>
                      <td className="numeric">{r.totalStock ?? 0}</td>
                      <td className="numeric">{r.reorderPoint ?? "—"}</td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={r.qty}
                          onChange={(e) => setQty(r.sku, e.target.value)}
                          style={{ width: 80 }}
                        />
                      </td>
                      <td>{reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: 20 }}>
            <button
              type="button"
              className={`approve-btn ${submitting ? "btn-processing" : ""}`}
              onClick={handleGeneratePO}
              disabled={submitting || loading}
            >
              {submitting ? "Creating PO…" : "Generate purchase order"}
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

export default Procurement;
