"""
preprocess.py
-------------
Handles all data cleaning and preparation before training.
Steps: sort → fill missing dates → aggregate to weekly → remove outliers
"""

import pandas as pd
import numpy as np


def preprocess(df: pd.DataFrame) -> pd.DataFrame:
    """
    Takes raw daily sales data and returns a clean weekly DataFrame.

    Input columns expected: date, sku_id, sales
    Output columns: week_start, sku_id, sales (weekly aggregated)
    """

    # --- Step 1: Basic cleaning ---
    df = df.copy()
    df.columns = df.columns.str.strip().str.lower()           # normalize column names
    df["date"] = pd.to_datetime(df["date"], errors="coerce")  # parse dates safely
    df["sales"] = pd.to_numeric(df["sales"], errors="coerce") # parse sales safely
    df = df.dropna(subset=["date", "sales", "sku_id"])        # drop rows with critical NaNs
    df["sales"] = df["sales"].clip(lower=0)                   # no negative sales

    # --- Step 2: Fill missing dates per SKU ---
    # For each SKU, create a continuous daily date range so there are no gaps
    filled_frames = []
    for sku_id, group in df.groupby("sku_id"):
        group = group.set_index("date").sort_index()
        full_range = pd.date_range(start=group.index.min(), end=group.index.max(), freq="D")
        group = group.reindex(full_range)
        group["sku_id"] = sku_id
        group["sales"] = group["sales"].fillna(0)  # missing day = 0 sales (stockout/closed)
        group.index.name = "date"
        filled_frames.append(group.reset_index())

    df = pd.concat(filled_frames, ignore_index=True)

    # --- Step 3: Aggregate from daily → weekly ---
    df["week_start"] = df["date"] - pd.to_timedelta(df["date"].dt.dayofweek, unit="D")
    weekly = (
        df.groupby(["week_start", "sku_id"])["sales"]
        .sum()
        .reset_index()
    )
    weekly = weekly.sort_values(["sku_id", "week_start"]).reset_index(drop=True)

    # --- Step 4: Remove outliers using IQR method per SKU ---
    cleaned_frames = []
    for sku_id, group in weekly.groupby("sku_id"):
        if len(group) < 4:
            cleaned_frames.append(group)  # too small to detect outliers, keep as-is
            continue
        Q1 = group["sales"].quantile(0.25)
        Q3 = group["sales"].quantile(0.75)
        IQR = Q3 - Q1
        upper_bound = Q3 + 3.0 * IQR   # 3x IQR is lenient — preserves real demand spikes
        group = group.copy()
        group["sales"] = group["sales"].clip(upper=upper_bound)
        cleaned_frames.append(group)

    weekly = pd.concat(cleaned_frames, ignore_index=True)
    return weekly