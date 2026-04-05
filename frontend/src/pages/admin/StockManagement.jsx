import React, { useState } from "react";
import DashboardNavbar from "../../components/DashboardNavbar";

function StockManagement({ toggleTheme }) {
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const handleApproveAudit = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setCompleted(true);
      setToastMsg("Audit Log successfully reconciled!");
      setTimeout(() => setToastMsg(""), 3000);
    }, 600);
  };

  return (
    <>
      <DashboardNavbar toggleTheme={toggleTheme} />

      <div className="container">

        <div className="card">
          <h3>Audit Receipt Inbox</h3>

          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>System Qty</th>
                <th>Staff Counted</th>
                <th>Variance</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>Milk 500ml</td>
                <td>15</td>
                <td>12</td>
                <td className="numeric">-3</td>
              </tr>

              <tr>
                <td>Bread</td>
                <td>22</td>
                <td>22</td>
                <td className="numeric">0</td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: "20px" }}>
            <button
              className={`approve-btn ${loading ? "btn-processing" : ""}`}
              onClick={handleApproveAudit}
              disabled={loading || completed}
            >
              {completed ? "Audit Approved ✓" : "Approve Audit Log"}
            </button>
          </div>
        </div>

      </div>

      {toastMsg && <div className="toast-notification">{toastMsg}</div>}
    </>
  );
}

export default StockManagement;