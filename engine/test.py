import pandas as pd
import requests

df = pd.read_csv("sample_sales_data.csv")
payload = {"data": df.to_dict(orient="records")}

# Train
r = requests.post("http://localhost:8000/train/STORE1", json=payload)
print("Training:", r.json())

# Forecast one SKU
r = requests.post("http://localhost:8000/forecast/STORE1/SKU001", json=payload)
print("Forecast:", r.json())