# Vector AI

Retail decision-support stack: **React** frontend, **Express + MongoDB** backend, and a **Python (FastAPI)** demand-forecasting engine (XGBoost with a moving-average fallback).

## Architecture

```
Browser (Vite/React)
    → POST /api/predict  (and other /api/* routes)
        → Node.js validates input, calls Python over HTTP (native fetch)
            → FastAPI POST /predict → preprocess + model (or fallback)
        → MongoDB stores each request (PredictionLog — see backend/DATABASE_SCHEMA.md)
    ← JSON with forecast, comparison baseline, and EOQ-style insights
```

**Database schema:** See **[backend/DATABASE_SCHEMA.md](backend/DATABASE_SCHEMA.md)** for all collections, fields, and how API `store_id` / `sku_id` map to `Sale.storeId`, `Product.sku`, and `PredictionLog`.

**Admin prediction UI:** **`/admin/predict`** — charts (**with ML** vs **without ML** naive plan), Wilson **EOQ**, illustrative profit/holding, raw JSON. **Staff cannot access** any `/admin/*` route (redirects to staff dashboard or login).

## Prerequisites

- **Node.js 18+** (global `fetch`)
- **MongoDB** (local or Atlas)
- **Python 3.11+** (see `engine/requirements.txt`)

## Environment variables

### Backend (`backend/.env`)

| Variable | Purpose |
|----------|---------|
| `MONGO_URI` | MongoDB connection string (**required**) |
| `ML_ENGINE_URL` | Python API base URL (default `http://localhost:8000`) |
| `PORT` | Express port (default `5000`) |

### Frontend (`frontend/.env` optional)

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend origin for **production** builds. In **dev**, leave unset so the app uses Vite’s **`/api` → `http://127.0.0.1:5000` proxy** (avoids many `fetch failed` errors). |

If you still see **fetch failed**: start the backend (`cd backend && npm start`), confirm MongoDB, then reload the Vite page (`npm run dev`).

### Python engine

Runs from the `engine` folder; model files are written under `engine/models/` as `{store_id}_{sku_id}.pkl`.

## Run the stack (step by step)

### 1. MongoDB

Start your MongoDB instance and create a database user if needed. Put the URI in `backend/.env`:

```env
MONGO_URI=mongodb://127.0.0.1:27017/vector_ai
```

### 2. Python ML engine

```bash
cd engine
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Health check: [http://localhost:8000/health](http://localhost:8000/health)

### 3. Node backend

```bash
cd backend
npm install
npm start
```

API root: [http://localhost:5000/api](http://localhost:5000/api)

### 4. React frontend

```bash
cd frontend
npm install
npm run dev
```

Default Vite port in this project: **3000** (see `frontend/vite.config.js`). Log in as admin (`admin@retail.com` / `admin123`), then use the sidebar:

- **Prediction & insights** (`/admin/predict`) — forecast, EOQ, charts, Mongo log id  
- **Intelligence** — shortcut card to the same page  

## Training models (so ML differs from naive)

Without a model file, the engine uses a **moving average** fallback — the prediction page will show overlapping lines until you train:

1. Enter sales in the app (or use existing `POST /api/sales` / uploads).
2. Trigger training, e.g. `POST http://localhost:5000/api/ml/train/store_1` (or your `storeId`).
3. Ensure the SKU in your JSON matches a trained `{store_id}_{sku_id}.pkl` under `engine/models/`.

## Main API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/predict/history/:storeId?sku=` | Historical sold qty from MongoDB (`Sale` + `Product`) as demand-signal rows for the UI |
| POST | `/api/predict` | Full pipeline + Mongo log + `insights` (EOQ, illustrative profit/holding) |
| POST | `/api/predict/accuracy` | Hold-out backtest: same body as `/api/predict` + optional `holdout_weeks` (1–12); returns MAE, RMSE, MAPE %, week table |
| POST | `/api/ml/train/:storeId` | Train all SKUs from Mongo sales |
| GET | `/api/ml/forecast/:storeId/:sku` | Forecast + EOQ from Mongo-backed history |
| GET | `/api/ml/health` | Backend ↔ engine connectivity |

Python (FastAPI): `POST /predict`, `POST /train/{store_id}`, `POST /forecast/{store_id}/{sku_id}`, `GET /health`.

## Prediction payload (JSON)

```json
{
  "store_id": "store_1",
  "sku_id": "SKU001",
  "data": [
    { "date": "2024-01-01", "sku_id": "SKU001", "sales": 10 }
  ],
  "ordering_cost": 50,
  "holding_cost": 2,
  "unit_margin": 15
}
```

Optional `ordering_cost`, `holding_cost`, `unit_margin` drive **Wilson EOQ** and the **illustrative** overstock / understock story. If `holding_cost` is omitted, the backend uses the **Product** document’s `holdingCost` when the SKU exists in MongoDB.

## MongoDB: prediction logs

Collection: **`predictionlogs`** (`PredictionLog`). Full field list: [DATABASE_SCHEMA.md](backend/DATABASE_SCHEMA.md).

- `storeId`, `sku` — aligned with `Sale.storeId` and `Product.sku`  
- `product` — optional `ObjectId` ref to `Product` when SKU exists  
- `status` — `success` | `error`  
- `inputData`, `prediction`, `timestamp`  

Older documents may lack `storeId`/`sku`; new writes always include them.

## Tech stack

- Frontend: React 19, Vite, React Router, Chart.js / react-chartjs-2  
- Backend: Express 5, Mongoose, Multer, CSV/XLSX  
- Engine: FastAPI, pandas, scikit-learn, XGBoost, joblib  

## License / academic use

Suitable for coursework demos; tune disclaimers on the prediction page for your institution’s requirements.
