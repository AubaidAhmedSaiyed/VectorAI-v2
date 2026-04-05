"""
fallback.py
-----------
Provides a simple moving average forecast when no trained model exists.
Also exposes the same curve as a "naive planning" baseline for ML vs non-ML charts.
"""

import pandas as pd
import numpy as np
from preprocess import preprocess

FORECAST_WEEKS = 4


def naive_baseline_forecast(sku_id: str, raw_df: pd.DataFrame) -> list:
    """
    "Without ML" scenario: plan each future week using the average of the last
    4 historical weeks (flat naive forecast). Used for comparison dashboards.
    """
    weekly_df = preprocess(raw_df)
    sku_df = weekly_df[weekly_df["sku_id"] == sku_id].copy()

    if len(sku_df) < 4:
        raise ValueError(
            f"Not enough weekly history for naive baseline (SKU '{sku_id}' needs 4+ weeks)"
        )

    avg_demand = float(np.mean(sku_df["sales"].values[-4:]))
    last_week = sku_df["week_start"].iloc[-1]

    forecasts = []
    for i in range(1, FORECAST_WEEKS + 1):
        next_week = last_week + pd.Timedelta(weeks=i)
        forecasts.append({
            "week_start": next_week.strftime("%Y-%m-%d"),
            "forecast": round(avg_demand, 2),
        })
    return forecasts


def naive_last_week_repeated_forecast(sku_id: str, raw_df: pd.DataFrame) -> list:
    """
    Simpler "no ML" planner: assume every future week equals the *most recent*
    historical week's demand (flat line). Differs from the 4-week average fallback
    whenever the latest week is not equal to that average — so charts do not
    overlap when the engine is using moving_average_fallback (no .pkl model).
    """
    weekly_df = preprocess(raw_df)
    sku_df = weekly_df[weekly_df["sku_id"] == sku_id].copy()

    if sku_df.empty:
        raise ValueError(f"No weekly history for SKU '{sku_id}'")

    last_sales = float(sku_df["sales"].iloc[-1])
    last_week = sku_df["week_start"].iloc[-1]

    forecasts = []
    for i in range(1, FORECAST_WEEKS + 1):
        next_week = last_week + pd.Timedelta(weeks=i)
        forecasts.append({
            "week_start": next_week.strftime("%Y-%m-%d"),
            "forecast": round(last_sales, 2),
        })
    return forecasts


def moving_average_forecast(store_id: str, sku_id: str, raw_df: pd.DataFrame) -> list:
    """
    Simple 4-week moving average forecast (same numbers as naive_baseline_forecast).
    Used when no trained model file exists.
    """
    out = naive_baseline_forecast(sku_id, raw_df)
    for p in out:
        p["method"] = "moving_average_fallback"
    return out
