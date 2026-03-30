"""
train.py
--------
Trains one XGBoost model per SKU and saves it to disk.
Called via POST /train/{store_id} in app.py
"""

import os
import pandas as pd
import joblib
from xgboost import XGBRegressor

from preprocess import preprocess
from feature_engineering import create_features, FEATURE_COLS, TARGET_COL

# Minimum number of weekly rows needed to train a model
# (we need at least 3 lags + a few training rows)
MIN_WEEKS = 8

MODELS_DIR = "models"
os.makedirs(MODELS_DIR, exist_ok=True)


def train_all_skus(store_id: str, raw_df: pd.DataFrame) -> dict:
    """
    Trains one XGBoost model per SKU for the given store.

    Args:
        store_id: unique store identifier (used in saved file names)
        raw_df:   DataFrame with columns [date, sku_id, sales]

    Returns:
        dict with per-SKU status: "trained", "skipped", or "error"
    """
    results = {}

    # Step 1: Clean and aggregate to weekly data
    weekly_df = preprocess(raw_df)

    # Step 2: Train a separate model for each SKU
    for sku_id, sku_df in weekly_df.groupby("sku_id"):
        try:
            # Step 3: Create ML features
            featured_df = create_features(sku_df)

            # Step 4: Skip SKUs that don't have enough data
            if len(featured_df) < MIN_WEEKS:
                print(f"[SKIP] SKU {sku_id}: only {len(featured_df)} weeks after preprocessing (need {MIN_WEEKS})")
                results[sku_id] = "skipped (insufficient data)"
                continue

            # Step 5: Prepare X (features) and y (target)
            X = featured_df[FEATURE_COLS]
            y = featured_df[TARGET_COL]

            # Step 6: Train XGBoost model
            # These hyperparameters are safe defaults for small-medium retail datasets
            model = XGBRegressor(
                n_estimators=100,      # number of trees
                max_depth=4,           # shallow trees prevent overfitting on small data
                learning_rate=0.1,     # step size for each tree
                subsample=0.8,         # use 80% of rows per tree (reduces overfitting)
                colsample_bytree=0.8,  # use 80% of features per tree
                random_state=42,
                verbosity=0            # suppress XGBoost logs
            )
            model.fit(X, y)

            # Step 7: Save model to disk as models/storeId_skuId.pkl
            model_path = os.path.join(MODELS_DIR, f"{store_id}_{sku_id}.pkl")
            joblib.dump(model, model_path)
            print(f"[OK] SKU {sku_id}: model saved → {model_path}")
            results[sku_id] = "trained"

        except Exception as e:
            print(f"[ERROR] SKU {sku_id}: {e}")
            results[sku_id] = f"error: {str(e)}"

    return results