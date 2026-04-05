# MongoDB schema (Vector AI backend)

All models use Mongoose. Collection names are implicit unless overridden.

## Entity overview

| Model | Collection | Purpose |
|-------|------------|---------|
| **Product** | `products` | Catalog: SKU, pricing, `holdingCost`, stock levels, reorder settings |
| **Inventory** | `inventories` | Shelf-style rows (name, sku, quantity, price) synced toward Product |
| **Sale** | `sales` | Transactions: `product` ref, `quantity`, `saleDate`, `storeId` |
| **Batch** | `batches` | FIFO lots: `product`, qty, expiry, optional `purchaseOrder` |
| **PurchaseOrder** | `purchaseorders` | PO header + `items[].product` |
| **Snapshot** | `snapshots` | Historical closing stock + estimated sales per product/day |
| **PredictionLog** | `predictionlogs` | Each `/api/predict` call (admin ML workflow) |

## Product

- `name` (String, required, indexed)
- `sku` (String, required, **unique**, indexed)
- `category`, `brand` (String)
- `sellingPrice`, `costPrice` (Number, required)
- `holdingCost` (Number, default 0.1) — used by EOQ when predicting if body omits holding cost
- `reorderPoint`, `safetyStock`, `leadTime`, `totalStock` (Number)
- `timestamps: true` → `createdAt`, `updatedAt`

## Inventory

- `name`, `sku` (String, required; sku **unique**)
- `quantity`, `price` (Number)
- `category` (String)
- `createdAt` (Date)

## Sale

- `product` (ObjectId → `Product`, required)
- `quantity` (Number, required)
- `saleDate` (Date, default now, indexed)
- `storeId` (String, default `"store_1"`) — matches ML / prediction `storeId`

## Batch

- `product` (ObjectId → `Product`, required, indexed)
- `initialQty`, `currentQty` (Number)
- `expiryDate` (Date, required, indexed)
- `receivedDate` (Date)
- `purchaseOrder` (ObjectId → `PurchaseOrder`)
- `supplier` (String)
- `status` enum: `Active` | `Sold` | `Expired` | `Liquidation`

Compound index: `{ product, status, expiryDate }`

## PurchaseOrder

- `poNumber` (String, unique)
- `supplier` (String, required)
- `status` enum: `Pending` | `Received` | `Cancelled`
- `items[]`: `product` (ObjectId), `orderedQty`, `receivedQty`, `costPerUnit`
- `orderDate`, `expectedDate`, `receivedDate` (Date)
- `timestamps: true`

## Snapshot

- `product` (ObjectId → `Product`, required)
- `date` (Date, required, indexed)
- `closingStock` (Number, required)
- `estimatedSales` (Number)

Compound index: `{ product, date }` (desc on date)

## PredictionLog (ML prediction audit)

Indexed for admin reporting: by store, SKU, product, success/error, time.

- `storeId` (String, required) — same meaning as `Sale.storeId`
- `sku` (String, required) — same as `Product.sku` / API `sku_id`
- `product` (ObjectId → `Product`, optional) — resolved when SKU exists in catalog
- `status` enum: `success` | `error`
- `inputData` (Mixed, required) — full request snapshot (rows + cost assumptions)
- `prediction` (Mixed, required) — on success: engine JSON + `insights`; on error: `{ error, httpStatus }`
- `timestamp` (Date, default now, indexed)

Compound index: `{ storeId, sku, timestamp }` (desc on timestamp)

## ML payload vs DB naming

| API / Python | Mongo field |
|--------------|-------------|
| `store_id` | `Sale.storeId`, `PredictionLog.storeId` |
| `sku_id` | `Product.sku`, `PredictionLog.sku` |

## Migrations / legacy data

If you have **old** `predictionlogs` documents created before `storeId`, `sku`, `product`, and `status` were added, either:

- Drop or archive that collection and let new predictions recreate it, or  
- Run a one-off MongoDB update to backfill `storeId` / `sku` from `inputData` where possible.

---

For run instructions and environment variables, see the project **README.md**.
