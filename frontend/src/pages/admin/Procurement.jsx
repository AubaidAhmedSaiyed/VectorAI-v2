import React, { useState } from "react";
import DashboardNavbar from "../../components/DashboardNavbar";

function Procurement({ toggleTheme }) {
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const handleGeneratePO = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setCompleted(true);
      setToastMsg("Purchase Order successfully dispatched!");
      setTimeout(() => setToastMsg(""), 3000);
    }, 600);
  };

  return (
    <>
      <DashboardNavbar toggleTheme={toggleTheme} />

      <div className="container">

        <div className="card">
          <h3>Smart Procurement Engine</h3>

          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Current Stock</th>
                <th>Suggested Order</th>
                <th>Reason</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>Milk 500ml</td>
                <td>8</td>
                <td className="numeric">20</td>
                <td>Below safety threshold</td>
              </tr>

              <tr>
                <td>Maggi</td>
                <td>40</td>
                <td className="numeric">0</td>
                <td>Stock sufficient</td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: "20px" }}>
            <button
              className={`approve-btn ${loading ? "btn-processing" : ""}`}
              onClick={handleGeneratePO}
              disabled={loading || completed}
            >
              {completed ? "PO Generated ✓" : "Generate Purchase Order"}
            </button>
          </div>
        </div>
      </div>
      
      {toastMsg && <div className="toast-notification">{toastMsg}</div>}
    </>
  );
}

export default Procurement;