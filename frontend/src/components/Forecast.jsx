import React from "react";
import SalesPredictionChart from "./SalesPredictionChart";
import { TrendingUp } from "lucide-react";

function Forecast({ theme }) {
  return (
    <div className="modern-feature-card">
      <div className="modern-feature-header">
        <div className="modern-feature-icon-wrapper">
          <TrendingUp size={24} />
        </div>
        <div>
          <h3 className="modern-feature-title">AI Sales Prediction</h3>
          <p className="modern-feature-desc">Forecasting future sales using AI insights.</p>
        </div>
      </div>
      <div style={{ height: "200px", width: "100%", marginTop: "24px" }}>
        <SalesPredictionChart theme={theme} isStatic={true} />
      </div>
    </div>
  );
}

export default Forecast;
