"""
forecast.py
-----------
Loads a trained model and predicts demand for the next 4 weeks.
Uses recursive forecasting: each prediction is fed back as a lag feature.
Called via GET /forecast/{store_id}/{sku_id} in app.py
"""

import os
import pandas as pd
import numpy as np
import joblib

from preprocess import preprocess
from feature_engineering import create_features, FEATURE_COLS

MODELS_DIR = "models"
FORECAST_WEEKS = 4


def forecast_sku(store_id: str, sku_id: str, raw_df: pd.DataFrame) -> list:
    """
    Loads the saved model for this SKU and forecasts next 4 weeks.

    Args:
        store_id: store identifier
        sku_id:   SKU to forecast
        raw_df:   raw historical DataFrame (date, sku_id, sales)

    Returns:
        List of dicts: [{week_start: "...", forecast: 123.4}, ...]
    """

    # Step 1: Load the trained model
    model_path = os.path.join(MODELS_DIR, f"{store_id}_{sku_id}.pkl")
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"No trained model found at {model_path}. "
            f"Please train first using POST /train/{store_id}"
        )
    model = joblib.load(model_path)

    # Step 2: Preprocess + filter to this SKU only
    weekly_df = preprocess(raw_df)
    sku_df = weekly_df[weekly_df["sku_id"] == sku_id].copy()

    if sku_df.empty:
        raise ValueError(f"No data found for SKU '{sku_id}' in store '{store_id}'")

    # Step 3: Build features from historical data
    featured_df = create_features(sku_df)
    if featured_df.empty:
        raise ValueError(f"Insufficient data to build features for SKU '{sku_id}'")

    # Step 4: Set up recursive forecasting
    # We need the last 3 actual sales values as our starting lags
    last_sales = list(featured_df["sales"].values[-3:])  # [lag3, lag2, lag1] order
    last_week = featured_df["week_start"].iloc[-1]

    forecasts = []

    # Step 5: Predict one week at a time, feeding each prediction back as a lag
    for i in range(1, FORECAST_WEEKS + 1):
        next_week = last_week + pd.Timedelta(weeks=i)
        week_number = next_week.isocalendar()[1]  # ISO week number (1–52)

        # Build the feature row for this future week
        # last_sales[-1] = most recent = lag1, [-2] = lag2, [-3] = lag3
        lag1 = last_sales[-1]
        lag2 = last_sales[-2] if len(last_sales) >= 2 else lag1
        lag3 = last_sales[-3] if len(last_sales) >= 3 else lag2

        rolling_mean_3 = np.mean([lag1, lag2, lag3])

        feature_row = pd.DataFrame([{
            "lag1": lag1,
            "lag2": lag2,
            "lag3": lag3,
            "rolling_mean_3": rolling_mean_3,
            "week_number": week_number
        }])[FEATURE_COLS]  # ensure column order matches training

        # Predict and clip to non-negative (demand can't be negative)
        predicted = float(model.predict(feature_row)[0])
        predicted = max(0.0, round(predicted, 2))

        forecasts.append({
            "week_start": next_week.strftime("%Y-%m-%d"),
            "forecast": predicted
        })

        # Feed this prediction back as the new lag1 for the next iteration
        last_sales.append(predicted)

    return forecasts