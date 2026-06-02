#!/usr/bin/env python3
"""Build compact JSON for Delhi AQI dashboard."""

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
CSV = ROOT / "delhi_aqi.csv"
OUT_PATHS = [
    ROOT / "delhi-dashboard" / "data" / "delhi_aqi.json",
    ROOT / "data" / "delhi_aqi.json",
]


def pm25_to_aqi(pm: float) -> float:
    breaks = [
        (0, 12.0, 0, 50),
        (12.1, 35.4, 51, 100),
        (35.5, 55.4, 101, 150),
        (55.5, 150.4, 151, 200),
        (150.5, 250.4, 201, 300),
        (250.5, 350.4, 301, 400),
        (350.5, 500.4, 401, 500),
    ]
    for lo, hi, a_lo, a_hi in breaks:
        if lo <= pm <= hi:
            return (a_hi - a_lo) / (hi - lo) * (pm - lo) + a_lo
    if pm > 500.4:
        return 500 + (pm - 500.4) * 0.5
    return 0.0


def aqi_bin(aqi: float) -> int:
    if aqi <= 50:
        return 0
    if aqi <= 100:
        return 1
    if aqi <= 150:
        return 2
    if aqi <= 200:
        return 3
    if aqi <= 300:
        return 4
    if aqi <= 500:
        return 5
    return 6


FORECAST_YEAR = 2026


def build_forecast_2026(monthly: dict, daily: dict, years: list[int]) -> dict:
    """Per-month linear trend on yearly mean AQI; daily curve scaled from latest shape."""
    forecast = {}
    for month in range(1, 13):
        points = []
        for y in years:
            rec = monthly.get(str(y), {}).get(str(month))
            if rec:
                points.append((y, rec["aqi"]))

        if not points:
            continue

        if len(points) >= 2:
            xs = [p[0] for p in points]
            ys = [p[1] for p in points]
            n = len(points)
            x_bar = sum(xs) / n
            y_bar = sum(ys) / n
            num = sum((xs[i] - x_bar) * (ys[i] - y_bar) for i in range(n))
            den = sum((xi - x_bar) ** 2 for xi in xs) or 1.0
            slope = num / den
            intercept = y_bar - slope * x_bar
            pred_mean = intercept + slope * FORECAST_YEAR
            ss_res = sum((ys[i] - (intercept + slope * xs[i])) ** 2 for i in range(n))
            ss_tot = sum((yi - y_bar) ** 2 for yi in ys) or 1.0
            r2 = 1 - ss_res / ss_tot
        else:
            slope = 0.0
            intercept = points[0][1]
            pred_mean = points[0][1]
            r2 = None

        pred_mean = float(max(50, min(650, pred_mean)))

        shape_year = None
        for y in sorted(years, reverse=True):
            days = daily.get(str(y), {}).get(str(month), [])
            if len(days) >= 5:
                shape_year = y
                break

        daily_fc = []
        if shape_year is not None:
            shape = daily[str(shape_year)][str(month)]
            shape_mean = sum(d["aqi"] for d in shape) / len(shape)
            scale = pred_mean / shape_mean if shape_mean > 0 else 1.0
            for d in shape:
                daily_fc.append({
                    "day": d["day"],
                    "aqi": round(d["aqi"] * scale, 1),
                })

        forecast[str(month)] = {
            "year": FORECAST_YEAR,
            "monthlyAqi": round(pred_mean, 1),
            "bin": aqi_bin(pred_mean),
            "daily": daily_fc,
            "model": "linear_year_trend",
            "trainingYears": [p[0] for p in points],
            "trainingAqi": [round(p[1], 1) for p in points],
            "slope": round(slope, 3),
            "intercept": round(intercept, 1),
            "r2": round(r2, 3) if r2 is not None else None,
            "shapeFromYear": shape_year,
        }

    return forecast


def main():
    df = pd.read_csv(CSV, parse_dates=["date"])
    df["aqi"] = df["pm2_5"].apply(pm25_to_aqi)
    df["year"] = df["date"].dt.year
    df["month"] = df["date"].dt.month
    df["day"] = df["date"].dt.day
    df["hour"] = df["date"].dt.hour

    years = sorted(int(y) for y in df["year"].unique())
    monthly = {}
    daily = {}
    hourly = {}

    for year in years:
        monthly[str(year)] = {}
        daily[str(year)] = {}
        hourly[str(year)] = {}
        ydf = df[df["year"] == year]
        for month in sorted(int(m) for m in ydf["month"].unique()):
            mdf = ydf[ydf["month"] == month]
            monthly[str(year)][str(month)] = {
                "aqi": round(float(mdf["aqi"].mean()), 1),
                "pm25": round(float(mdf["pm2_5"].mean()), 1),
                "pm10": round(float(mdf["pm10"].mean()), 1),
                "no2": round(float(mdf["no2"].mean()), 1),
                "no": round(float(mdf["no"].mean()), 2),
                "o3": round(float(mdf["o3"].mean()), 1),
                "so2": round(float(mdf["so2"].mean()), 1),
                "co": round(float(mdf["co"].mean()), 1),
                "nh3": round(float(mdf["nh3"].mean()), 1),
                "bin": aqi_bin(float(mdf["aqi"].mean())),
                "readings": int(len(mdf)),
            }
            daily[str(year)][str(month)] = []
            for day, ddf in mdf.groupby("day"):
                daily[str(year)][str(month)].append({
                    "day": int(day),
                    "aqi": round(float(ddf["aqi"].mean()), 1),
                    "pm25": round(float(ddf["pm2_5"].mean()), 1),
                    "no2": round(float(ddf["no2"].mean()), 1),
                    "o3": round(float(ddf["o3"].mean()), 1),
                    "so2": round(float(ddf["so2"].mean()), 1),
                })
            hourly[str(year)][str(month)] = []
            for i, (_, row) in enumerate(mdf.sort_values("date").iterrows()):
                if i % 3 != 0:
                    continue
                hourly[str(year)][str(month)].append({
                    "t": row["date"].strftime("%Y-%m-%d %H:%M"),
                    "aqi": round(float(row["aqi"]), 1),
                    "pm25": round(float(row["pm2_5"]), 1),
                    "no2": round(float(row["no2"]), 1),
                })

    forecast_2026 = build_forecast_2026(monthly, daily, years)

    payload = {
        "years": years,
        "forecastYear": 2026,
        "months": list(range(1, 13)),
        "monthNames": [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ],
        "monthly": monthly,
        "daily": daily,
        "hourly": hourly,
        "forecast2026": forecast_2026,
    }

    for out in OUT_PATHS:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload), encoding="utf-8")
        print(f"Wrote {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
