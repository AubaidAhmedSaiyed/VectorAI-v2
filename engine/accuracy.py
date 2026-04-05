"""
accuracy.py
-----------
Backtest demand forecasts against known history (last N weeks held out).

We truncate daily rows before the first holdout week, run the same predict_demand
pipeline, and compare weekly forecast totals to what actually sold in those weeks.
This measures how close the engine was — not future accuracy on unseen data.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

import pandas as pd

from predict import predict_demand


def _daily_with_week_start(raw_df: pd.DataFrame) -> pd.DataFrame:
    df = raw_df.copy()
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])
    df["week_start"] = df["date"] - pd.to_timedelta(df["date"].dt.dayofweek, unit="D")
    return df


def split_train_and_holdout_actuals(
    raw_df: pd.DataFrame, sku_id: str, holdout_weeks: int
) -> Tuple[pd.DataFrame, List[Dict[str, Any]]]:
    """
    Returns:
      train_daily: rows strictly before the first holdout week (all SKUs in df preserved for preprocess).
      actuals: list of {week_start, actual_demand} for each holdout week (chronological).
    """
    if holdout_weeks < 1:
        raise ValueError("holdout_weeks must be at least 1")

    dfw = _daily_with_week_start(raw_df)
    sku_weekly = (
        dfw[dfw["sku_id"] == sku_id]
        .groupby("week_start", as_index=False)["sales"]
        .sum()
        .sort_values("week_start")
        .reset_index(drop=True)
    )

    min_weeks_needed = holdout_weeks + 5
    if len(sku_weekly) < min_weeks_needed:
        raise ValueError(
            f"Need at least {min_weeks_needed} weeks of history for SKU '{sku_id}' "
            f"to hold out {holdout_weeks} weeks (have {len(sku_weekly)})."
        )

    holdout_slice = sku_weekly.tail(holdout_weeks)
    cutoff = holdout_slice["week_start"].iloc[0]

    train_daily = dfw[dfw["week_start"] < cutoff].drop(columns=["week_start"])

    actuals = [
        {
            "week_start": row["week_start"].strftime("%Y-%m-%d"),
            "actual_demand": float(row["sales"]),
        }
        for _, row in holdout_slice.iterrows()
    ]
    return train_daily, actuals


def _mae_rmse_mape(actual: List[float], predicted: List[float]) -> Dict[str, Any]:
    n = len(actual)
    if n == 0 or len(predicted) != n:
        raise ValueError("actual and predicted must be same non-empty length")

    abs_err = [abs(a - p) for a, p in zip(actual, predicted)]
    mae = sum(abs_err) / n
    rmse = math.sqrt(sum((a - p) ** 2 for a, p in zip(actual, predicted)) / n)

    ape_vals = []
    for a, p in zip(actual, predicted):
        if a != 0:
            ape_vals.append(abs(a - p) / a * 100.0)
    mape = sum(ape_vals) / len(ape_vals) if ape_vals else None

    return {
        "mae": round(mae, 3),
        "rmse": round(rmse, 3),
        "mape_percent": round(mape, 2) if mape is not None else None,
        "mean_actual": round(sum(actual) / n, 3),
        "mean_predicted": round(sum(predicted) / n, 3),
    }


def backtest_accuracy(
    store_id: str, sku_id: str, raw_df: pd.DataFrame, holdout_weeks: int = 4
) -> Dict[str, Any]:
    """
    Hold out the last `holdout_weeks` calendar weeks of demand for this SKU,
    forecast them from prior data, return metrics and per-week table.
    """
    train_daily, actuals = split_train_and_holdout_actuals(
        raw_df, sku_id, holdout_weeks
    )

    if train_daily.empty:
        raise ValueError("Training slice is empty after holdout")

    pred_result = predict_demand(store_id, sku_id, train_daily)
    fc = pred_result.get("forecast") or []

    if len(fc) < holdout_weeks:
        raise ValueError(
            f"Forecast returned {len(fc)} weeks; expected at least {holdout_weeks}"
        )

    fc_trim = fc[:holdout_weeks]
    actual_vals = [a["actual_demand"] for a in actuals]
    pred_vals = [float(p["forecast"]) for p in fc_trim]

    weeks_aligned = all(
        a["week_start"] == frow["week_start"]
        for a, frow in zip(actuals, fc_trim)
    )

    metrics = _mae_rmse_mape(actual_vals, pred_vals)

    by_week: List[Dict[str, Any]] = []
    for a, p, frow in zip(actuals, pred_vals, fc_trim):
        act = a["actual_demand"]
        err = p - act
        ape = round(abs(err) / act * 100.0, 2) if act else None
        by_week.append(
            {
                "week_start": a["week_start"],
                "forecast_week_label": frow.get("week_start"),
                "actual_demand": act,
                "forecast_demand": p,
                "error": round(err, 3),
                "abs_error": round(abs(err), 3),
                "ape_percent": ape,
            }
        )

    # Plain-language hint for retailers
    mape = metrics.get("mape_percent")
    if mape is None:
        quality = "unknown (some weeks had zero actuals)"
    elif mape <= 15:
        quality = "strong — typical retail target is often under ~15–20% average error"
    elif mape <= 25:
        quality = "reasonable — watch slow movers and promotions"
    else:
        quality = "weak — add more history, train the model, or check data quality"

    return {
        "method": "holdout_backtest",
        "holdout_weeks": holdout_weeks,
        "weeks_calendar_aligned": weeks_aligned,
        "store_id": store_id,
        "sku_id": sku_id,
        "summary": (
            f"The last {holdout_weeks} weeks were hidden; the engine predicted them from earlier demand. "
            "Lower MAPE (%) means forecast demand was closer to what customers actually bought."
        ),
        "metrics": metrics,
        "by_week": by_week,
        "quality_hint": quality,
    }
