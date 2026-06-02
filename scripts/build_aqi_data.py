#!/usr/bin/env python3
"""Build compact JSON for Delhi AQI dashboard."""

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
CSV = ROOT / "delhi_aqi.csv"
OUT = ROOT / "delhi-dashboard" / "data" / "delhi_aqi.json"


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
            for _, row in mdf.sort_values("date").iterrows():
                hourly[str(year)][str(month)].append({
                    "t": row["date"].strftime("%Y-%m-%d %H:%M"),
                    "aqi": round(float(row["aqi"]), 1),
                    "pm25": round(float(row["pm2_5"]), 1),
                    "no2": round(float(row["no2"]), 1),
                })

    payload = {
        "years": years,
        "months": list(range(1, 13)),
        "monthNames": [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ],
        "monthly": monthly,
        "daily": daily,
        "hourly": hourly,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload), encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
