"""
app.py
------
FastAPI entry point for the Vector AI ML Engine.

Endpoints:
  POST /predict                     → JSON in/out (Node.js integration)
  POST /train/{store_id}            → trains models for all SKUs
  POST /forecast/{store_id}/{sku_id} → returns 4-week forecast (+ EOQ hint)
  GET  /health                      → health check
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import pandas as pd

from train import train_all_skus
from predict import predict_demand

app = FastAPI(
    title="Vector AI — Demand Forecasting Engine",
    description="Retail demand forecasting and EOQ optimization ML service",
    version="1.0.0"
)

# Allow Node.js backend to call this service without CORS errors
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten this in production to your backend's URL
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class SalesRecord(BaseModel):
    date: str
    sku_id: str
    sales: float


class TrainRequest(BaseModel):
    data: List[SalesRecord]


class TrainResponse(BaseModel):
    store_id: str
    results: dict   # {sku_id: "trained" | "skipped" | "error: ..."}


class ForecastPoint(BaseModel):
    week_start: str
    forecast: float


class ForecastResponse(BaseModel):
    store_id: str
    sku_id: str
    forecast: List[ForecastPoint]
    eoq_hint: dict   # basic EOQ info for Node.js backend to use


class PredictRequest(BaseModel):
    """
    Body for POST /predict — same sales rows as training, plus store and SKU.
    Node.js /api/predict forwards this JSON to the engine.
    """
    store_id: str
    sku_id: str
    data: List[SalesRecord]


# ---------------------------------------------------------------------------
# Helper: convert list of SalesRecord → pandas DataFrame
# ---------------------------------------------------------------------------

def records_to_df(records: List[SalesRecord]) -> pd.DataFrame:
    # Pydantic v2: model_dump(); keep dict() fallback for older stacks
    rows = [r.model_dump() if hasattr(r, "model_dump") else r.dict() for r in records]
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health_check():
    """Simple health check — confirms service is running."""
    return {"status": "ok", "service": "Vector AI ML Engine"}


@app.post("/predict")
def predict_endpoint(body: PredictRequest):
    """
    Generic JSON prediction API for integration (e.g. Node.js POST /api/predict).

    Expects: store_id, sku_id, and data[] of {date, sku_id, sales}.
    Returns: forecast weeks + eoq_hint (same contract as POST /forecast/...).
    """
    if not body.data:
        raise HTTPException(status_code=400, detail="No data provided")

    df = records_to_df(body.data)

    try:
        return predict_demand(body.store_id, body.sku_id, df)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@app.post("/train/{store_id}", response_model=TrainResponse)
def train_endpoint(store_id: str, body: TrainRequest):
    """
    Trains one XGBoost model per SKU using provided sales history.

    Send raw daily sales data as a JSON array.
    Example body:
    {
        "data": [
            {"date": "2024-01-01", "sku_id": "SKU001", "sales": 42},
            ...
        ]
    }
    """
    if not body.data:
        raise HTTPException(status_code=400, detail="No data provided")

    df = records_to_df(body.data)

    try:
        results = train_all_skus(store_id, df)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")

    return TrainResponse(store_id=store_id, results=results)


@app.get("/forecast/{store_id}/{sku_id}")
def forecast_endpoint(store_id: str, sku_id: str, data: str = ""):
    """
    Returns the next 4-week demand forecast for a specific SKU.

    Because GET requests can't have a body, pass historical data via
    POST /forecast/{store_id}/{sku_id} instead (see below).

    Note: This endpoint is a companion to the POST version.
    """
    raise HTTPException(
        status_code=405,
        detail="Use POST /forecast/{store_id}/{sku_id} to send historical data"
    )


@app.post("/forecast/{store_id}/{sku_id}")
def forecast_post_endpoint(store_id: str, sku_id: str, body: TrainRequest):
    """
    Returns 4-week demand forecast + basic EOQ metadata.

    Send the same sales history used for training.
    The engine loads the pre-trained model (no retraining).

    Returns:
    {
        "store_id": "...",
        "sku_id": "...",
        "forecast": [
            {"week_start": "2024-06-03", "forecast": 145.2},
            ...
        ],
        "eoq_hint": {
            "total_4_week_demand": 580.8,
            "avg_weekly_demand": 145.2,
            "note": "Use total_4_week_demand with your holding/ordering costs for EOQ"
        }
    }
    """
    if not body.data:
        raise HTTPException(status_code=400, detail="No data provided")

    df = records_to_df(body.data)

    try:
        return predict_demand(store_id, sku_id, df)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecast failed: {str(e)}")