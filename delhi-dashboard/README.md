# Delhi AQI Dashboard

Interactive radial calendar (discrete AQI bands) + month drill-down + draw-to-predict 2023.

Inspired by [US Wildfire Intensity · MODIS](https://argsweet.github.io/Wildfires/).

## Run locally

```bash
# From project root — regenerate JSON if CSV changes
python3 scripts/build_aqi_data.py

cd delhi-dashboard
python3 -m http.server 8080
```

Open **http://localhost:8080**

## Features

- **Radial month wheel** — discrete EPA AQI colors (not continuous)
- **Year slider** 2020–2023 (default 2020)
- **Click a month** → blue-themed daily AQI + pollutant charts
- **Scroll down** → draw your 2023 forecast on the canvas
- **Finish** → reveals actual 2023 (or nearest year with data)

## Data note

`delhi_aqi.csv` covers Nov–Dec 2020, all of 2021–2022, and Jan 2023 only. Months without readings appear gray and are not clickable.
