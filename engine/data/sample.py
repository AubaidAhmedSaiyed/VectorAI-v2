# generate_sample_data.py
import pandas as pd
import numpy as np

np.random.seed(42)
dates = pd.date_range("2023-06-01", "2024-05-31", freq="D")  # 1 full year
skus = [f"SKU{str(i).zfill(3)}" for i in range(1, 11)]       # 10 SKUs

records = []
for sku in skus:
    base_demand = np.random.randint(30, 150)   # each SKU has different volume
    for date in dates:
        # Add weekly seasonality (weekends sell more)
        weekend_boost = 1.3 if date.dayofweek >= 5 else 1.0
        # Add noise
        sales = base_demand * weekend_boost + np.random.randint(-15, 20)
        sales = max(0, round(sales))
        records.append({"date": date.strftime("%Y-%m-%d"), "sku_id": sku, "sales": sales})

df = pd.DataFrame(records)
df.to_csv("sample_sales_data.csv", index=False)
print(f"Generated {len(df)} records for {len(skus)} SKUs")