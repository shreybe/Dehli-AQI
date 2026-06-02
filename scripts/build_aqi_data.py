#!/usr/bin/env python3
"""Build compact JSON for Delhi AQI dashboard."""

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
CSV_LEGACY = ROOT / "delhi_aqi.csv"
CSV_NEW = ROOT / "Delhi Air Quality Time Series Dataset(01-01-2025 to 15-05-2026).csv"
OUT_PATHS = [
    ROOT / "delhi-dashboard" / "data" / "delhi_aqi.json",
    ROOT / "data" / "delhi_aqi.json",
]

FORECAST_YEAR = 2026


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


def load_legacy() -> pd.DataFrame:
    df = pd.read_csv(CSV_LEGACY, parse_dates=["date"])
    df = df.rename(columns={"date": "ts"})
    df["pm2_5"] = df["pm2_5"].astype(float)
    return df


def load_new_timeseries() -> pd.DataFrame | None:
    if not CSV_NEW.is_file():
        print(f"Note: {CSV_NEW.name} not found — 2026 months will use legacy trend only.")
        return None

    print(f"Reading {CSV_NEW.name} (pm2.5 only)…")
    parts = []
    for chunk in pd.read_csv(CSV_NEW, parse_dates=["DateTime"], chunksize=500_000):
        pm = chunk[chunk["Parameters"] == "pm25"]
        if len(pm):
            parts.append(pm)
    if not parts:
        return None

    raw = pd.concat(parts, ignore_index=True)
    raw["ts"] = raw["DateTime"].dt.floor("h")
    hourly = raw.groupby("ts", as_index=False)["Values"].mean()
    hourly = hourly.rename(columns={"Values": "pm2_5"})
    hourly["aqi"] = hourly["pm2_5"].apply(pm25_to_aqi)
    return hourly


def merge_hourly(legacy: pd.DataFrame, new: pd.DataFrame | None) -> pd.DataFrame:
    cols = ["ts", "pm2_5", "aqi"]
    leg = legacy[["ts", "pm2_5"]].copy()
    leg["aqi"] = leg["pm2_5"].apply(pm25_to_aqi)
    if new is None:
        return leg

    combined = pd.concat([leg[cols], new[cols]], ignore_index=True)
    combined = combined.sort_values("ts").drop_duplicates(subset=["ts"], keep="last")
    return combined


def fill_pollutant_defaults(mdf: pd.DataFrame) -> dict:
    """Legacy CSV has full pollutants; new CSV is PM-only — use NaN-safe means."""
    return {
        "pm25": round(float(mdf["pm2_5"].mean()), 1),
        "pm10": round(float(mdf["pm10"].mean()), 1) if "pm10" in mdf else 0.0,
        "no2": round(float(mdf["no2"].mean()), 1) if "no2" in mdf else 0.0,
        "no": round(float(mdf["no"].mean()), 2) if "no" in mdf else 0.0,
        "o3": round(float(mdf["o3"].mean()), 1) if "o3" in mdf else 0.0,
        "so2": round(float(mdf["so2"].mean()), 1) if "so2" in mdf else 0.0,
        "co": round(float(mdf["co"].mean()), 1) if "co" in mdf else 0.0,
        "nh3": round(float(mdf["nh3"].mean()), 1) if "nh3" in mdf else 0.0,
    }


def build_series(df: pd.DataFrame) -> tuple[dict, dict, dict, list[int]]:
    df = df.copy()
    df["year"] = df["ts"].dt.year
    df["month"] = df["ts"].dt.month
    df["day"] = df["ts"].dt.day
    df["hour"] = df["ts"].dt.hour

    years = sorted(int(y) for y in df["year"].unique())
    monthly: dict = {}
    daily: dict = {}
    hourly: dict = {}

    for year in years:
        monthly[str(year)] = {}
        daily[str(year)] = {}
        hourly[str(year)] = {}
        ydf = df[df["year"] == year]
        for month in sorted(int(m) for m in ydf["month"].unique()):
            mdf = ydf[ydf["month"] == month]
            mean_aqi = float(mdf["aqi"].mean())
            pol = fill_pollutant_defaults(mdf) if "pm10" in mdf.columns else {
                "pm25": round(float(mdf["pm2_5"].mean()), 1),
                "pm10": 0.0,
                "no2": 0.0,
                "no": 0.0,
                "o3": 0.0,
                "so2": 0.0,
                "co": 0.0,
                "nh3": 0.0,
            }
            monthly[str(year)][str(month)] = {
                "aqi": round(mean_aqi, 1),
                **pol,
                "bin": aqi_bin(mean_aqi),
                "readings": int(len(mdf)),
            }
            daily[str(year)][str(month)] = []
            for day, ddf in mdf.groupby("day"):
                daily[str(year)][str(month)].append({
                    "day": int(day),
                    "aqi": round(float(ddf["aqi"].mean()), 1),
                    "pm25": round(float(ddf["pm2_5"].mean()), 1),
                    "no2": round(float(ddf["no2"].mean()), 1) if "no2" in ddf else 0.0,
                    "o3": round(float(ddf["o3"].mean()), 1) if "o3" in ddf else 0.0,
                    "so2": round(float(ddf["so2"].mean()), 1) if "so2" in ddf else 0.0,
                })
            hourly[str(year)][str(month)] = []
            for i, (_, row) in enumerate(mdf.sort_values("ts").iterrows()):
                if i % 3 != 0:
                    continue
                hourly[str(year)][str(month)].append({
                    "t": row["ts"].strftime("%Y-%m-%d %H:%M"),
                    "aqi": round(float(row["aqi"]), 1),
                    "pm25": round(float(row["pm2_5"]), 1),
                    "no2": round(float(row["no2"]), 1) if "no2" in row.index else 0.0,
                })

    return monthly, daily, hourly, years


def estimate_missing_2026(
    monthly: dict, daily: dict, meta: dict
) -> None:
    """Fill Jun–Dec 2026 from 2025 same-month pattern × Jan–May 2026/2025 ratio."""
    y5, y6 = monthly.get("2025", {}), monthly.get("2026", {})
    if not y5:
        return

    ratios = []
    for m in range(1, 6):
        r5, r6 = y5.get(str(m)), y6.get(str(m))
        if r5 and r6 and r5["aqi"] > 0:
            ratios.append(r6["aqi"] / r5["aqi"])
    scale = sum(ratios) / len(ratios) if ratios else 1.0

    if str(FORECAST_YEAR) not in daily:
        daily[str(FORECAST_YEAR)] = {}
        monthly[str(FORECAST_YEAR)] = {}

    for month in range(1, 13):
        key = str(month)
        if key in daily.get(str(FORECAST_YEAR), {}) and len(daily[str(FORECAST_YEAR)][key]) >= 5:
            meta[key] = {"source": "observed"}
            continue

        ref = y5.get(key)
        if not ref:
            continue

        pred_mean = ref["aqi"] * scale
        shape = daily.get("2025", {}).get(key, [])
        if len(shape) < 5:
            continue

        shape_mean = sum(d["aqi"] for d in shape) / len(shape)
        sc = pred_mean / shape_mean if shape_mean > 0 else 1.0
        daily[str(FORECAST_YEAR)][key] = [
            {"day": d["day"], "aqi": round(d["aqi"] * sc, 1), "pm25": d.get("pm25", 0), "no2": 0, "o3": 0, "so2": 0}
            for d in shape
        ]
        monthly[str(FORECAST_YEAR)][key] = {
            **ref,
            "aqi": round(pred_mean, 1),
            "bin": aqi_bin(pred_mean),
            "readings": 0,
        }
        month_names = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ]
        mlabel = month_names[month - 1]
        meta[key] = {
            "source": "estimated",
            "note": (
                f"Sensors only through May 2026. Estimated {mlabel} 2026 from "
                f"{mlabel} 2025, scaled by Jan–May 2026 vs 2025 ({scale:.2f}×)."
            ),
        }

    for month in range(1, 6):
        key = str(month)
        if key in daily.get(str(FORECAST_YEAR), {}):
            meta.setdefault(key, {"source": "observed"})


def main():
    legacy = load_legacy()
    new = load_new_timeseries()
    hourly = merge_hourly(legacy, new)

    # Re-attach legacy pollutants for old rows only
    leg_full = pd.read_csv(CSV_LEGACY, parse_dates=["date"])
    leg_full = leg_full.rename(columns={"date": "ts"})
    hourly = hourly.merge(
        leg_full[
            ["ts", "pm10", "no2", "no", "o3", "so2", "co", "nh3"]
        ],
        on="ts",
        how="left",
    )

    monthly, daily, hourly_dict, years = build_series(hourly)

    meta_2026: dict = {}
    if str(FORECAST_YEAR) in daily or CSV_NEW.is_file():
        estimate_missing_2026(monthly, daily, meta_2026)

    payload = {
        "years": years,
        "forecastYear": FORECAST_YEAR,
        "months": list(range(1, 13)),
        "monthNames": [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ],
        "monthly": monthly,
        "daily": daily,
        "hourly": hourly_dict,
        "actual2026Meta": meta_2026,
    }

    for out in OUT_PATHS:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload), encoding="utf-8")
        print(f"Wrote {out} ({out.stat().st_size // 1024} KB)")
        if meta_2026:
            obs = sum(1 for m in meta_2026.values() if m.get("source") == "observed")
            est = sum(1 for m in meta_2026.values() if m.get("source") == "estimated")
            print(f"  2026 months: {obs} observed, {est} estimated")


if __name__ == "__main__":
    main()
