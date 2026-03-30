"""
feature_engineering.py
-----------------------
Creates ML features from weekly sales data.
Features used: lag1, lag2, lag3, rolling_mean_3, week_number
"""

import pandas as pd


def create_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Takes a weekly DataFrame for a single SKU and adds ML features.

    Input:  week_start, sku_id, sales
    Output: same + lag1, lag2, lag3, rolling_mean_3, week_number
    """
    df = df.copy().sort_values("week_start").reset_index(drop=True)

    # Lag features: what were sales 1, 2, 3 weeks ago?
    # The model uses these to understand recent demand trends
    df["lag1"] = df["sales"].shift(1)
    df["lag2"] = df["sales"].shift(2)
    df["lag3"] = df["sales"].shift(3)

    # Rolling average: smoothed demand over past 3 weeks
    # Helps the model ignore one-off spikes and see the trend
    df["rolling_mean_3"] = df["sales"].shift(1).rolling(window=3).mean()

    # Week number (1–52): captures seasonal patterns
    # e.g., Week 50-52 = holiday season = higher demand
    df["week_number"] = df["week_start"].dt.isocalendar().week.astype(int)

    # Drop rows where lag/rolling features are NaN (first few rows)
    df = df.dropna().reset_index(drop=True)

    return df


# Columns the model trains and predicts on (must match in both train + forecast)
FEATURE_COLS = ["lag1", "lag2", "lag3", "rolling_mean_3", "week_number"]
TARGET_COL = "sales"