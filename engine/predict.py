"""
predict.py
----------
Modular prediction entry point for the ML engine.

Used by:
  - FastAPI POST /predict (JSON in → JSON out)
  - app.forecast_post_endpoint (same pipeline as before, refactored here)

Flow (unchanged from prior inline logic in app.py):
  raw DataFrame → forecast.forecast_sku (internally runs preprocess + model)
  If no model file → fallback.moving_average_forecast (also uses preprocess)

Adds comparison.baseline_forecast for UI charts:
  "with ML" = model output (or 4-week-avg fallback if no .pkl),
  "without ML" = repeat *last historical week's* demand (simplest naive plan).
  Those two differ whenever latest week != 4-week average (fixes identical lines).
"""

from __future__ import annotations

import pandas as pd

from forecast import forecast_sku
from fallback import moving_average_forecast, naive_last_week_repeated_forecast


def predict_demand(store_id: str, sku_id: str, df: pd.DataFrame) -> dict:
    """
    Run demand forecast for one SKU using historical daily sales rows.

    Args:
        store_id: Store identifier (matches model filename prefix).
        sku_id:   SKU to forecast.
        df:       Columns date, sku_id, sales (as produced by records_to_df).

    Returns:
        Dict with store_id, sku_id, forecast, eoq_hint, and optional comparison.

    Raises:
        ValueError: empty input or invalid SKU / insufficient data.
        FileNotFoundError: no model and fallback cannot run.
        RuntimeError: other unexpected failures from the stack below.
    """
    if df is None or df.empty:
        raise ValueError("No data provided")

    try:
        forecast_points = forecast_sku(store_id, sku_id, df)
    except FileNotFoundError as e:
        try:
            forecast_points = moving_average_forecast(store_id, sku_id, df)
        except Exception:
            raise FileNotFoundError(str(e)) from e
    except ValueError:
        raise
    except Exception as e:
        raise RuntimeError(f"Prediction failed: {str(e)}") from e

    total_demand = sum(p["forecast"] for p in forecast_points)
    avg_weekly = total_demand / len(forecast_points) if forecast_points else 0

    result = {
        "store_id": store_id,
        "sku_id": sku_id,
        "forecast": forecast_points,
        "eoq_hint": {
            "total_4_week_demand": round(total_demand, 2),
            "avg_weekly_demand": round(avg_weekly, 2),
            "note": "Pass total_4_week_demand with your holding and ordering costs to compute EOQ",
        },
    }

    # Naive "no ML" plan — repeat last completed week (not the same as 4-wk MA fallback)
    try:
        baseline = naive_last_week_repeated_forecast(sku_id, df)
        total_naive = sum(p["forecast"] for p in baseline)
        result["comparison"] = {
            "baseline_forecast": baseline,
            "baseline_method": "last_week_repeated",
            "totals_four_week": {
                "with_ml": round(total_demand, 2),
                "without_ml_naive": round(total_naive, 2),
                "difference_ml_minus_naive": round(total_demand - total_naive, 2),
            },
        }
    except ValueError as e:
        result["comparison"] = {
            "baseline_forecast": None,
            "note": str(e),
        }

    return result
