"""
fallback.py
-----------
Provides a simple moving average forecast when no trained model exists.
This is a safety net — used only if the model file is missing.
"""

import pandas as pd
import numpy as np
from preprocess import preprocess

FORECAST_WEEKS = 4


def moving_average_forecast(store_id: str, sku_id: str, raw_df: pd.DataFrame) -> list:
    """
    Simple 4-week moving average forecast.
    No ML model required — uses last 4 weeks of historical data.

    Returns:
        List of dicts: [{week_start: "...", forecast: 123.4}, ...]
    """
    weekly_df = preprocess(raw_df)
    sku_df = weekly_df[weekly_df["sku_id"] == sku_id].copy()

    if len(sku_df) < 4:
        raise ValueError(f"Not enough data for fallback forecast for SKU '{sku_id}'")

    avg_demand = float(np.mean(sku_df["sales"].values[-4:]))
    last_week = sku_df["week_start"].iloc[-1]

    forecasts = []
    for i in range(1, FORECAST_WEEKS + 1):
        next_week = last_week + pd.Timedelta(weeks=i)
        forecasts.append({
            "week_start": next_week.strftime("%Y-%m-%d"),
            "forecast": round(avg_demand, 2),
            "method": "moving_average_fallback"
        })

    return forecasts