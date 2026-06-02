#!/usr/bin/env python3
"""Build compact JSON for Delhi AQI dashboard."""

import json
import math
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

MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

# Years with incomplete sensor coverage — filled from a reference year
PARTIAL_YEARS = {
    2020: {"ref": 2021, "overlap": [11, 12]},
    2023: {"ref": 2022, "overlap": [1]},
}


def num(value, default: float = 0.0, ndigits: int | None = 1) -> float:
    """JSON-safe number (no NaN / Infinity)."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(f) or math.isinf(f):
        return default
    if ndigits is None:
        return f
    return round(f, ndigits)


def sanitize_for_json(obj):
    """Replace NaN/Inf so browsers can JSON.parse the file."""
    if isinstance(obj, float):
        return num(obj, 0.0, None)
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    return obj


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


def col_mean(mdf: pd.DataFrame, column: str, ndigits: int = 1) -> float:
    if column not in mdf.columns:
        return 0.0
    return num(mdf[column].mean(), 0.0, ndigits)


def fill_pollutant_defaults(mdf: pd.DataFrame) -> dict:
    """Legacy CSV has full pollutants; 2025–2026 rows are often PM-only."""
    return {
        "pm25": col_mean(mdf, "pm2_5", 1),
        "pm10": col_mean(mdf, "pm10", 1),
        "no2": col_mean(mdf, "no2", 1),
        "no": col_mean(mdf, "no", 2),
        "o3": col_mean(mdf, "o3", 1),
        "so2": col_mean(mdf, "so2", 1),
        "co": col_mean(mdf, "co", 1),
        "nh3": col_mean(mdf, "nh3", 1),
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
            mean_aqi = num(mdf["aqi"].mean(), 0.0, 1)
            pol = fill_pollutant_defaults(mdf)
            monthly[str(year)][str(month)] = {
                "aqi": mean_aqi,
                **pol,
                "bin": aqi_bin(mean_aqi),
                "readings": int(len(mdf)),
            }
            daily[str(year)][str(month)] = []
            for day, ddf in mdf.groupby("day"):
                daily[str(year)][str(month)].append({
                    "day": int(day),
                    "aqi": num(ddf["aqi"].mean(), 0.0, 1),
                    "pm25": col_mean(ddf, "pm2_5", 1),
                    "no2": col_mean(ddf, "no2", 1),
                    "o3": col_mean(ddf, "o3", 1),
                    "so2": col_mean(ddf, "so2", 1),
                })
            hourly[str(year)][str(month)] = []
            for i, (_, row) in enumerate(mdf.sort_values("ts").iterrows()):
                # Sparse hourly points keep JSON small enough to load reliably
                if i % 12 != 0:
                    continue
                hourly[str(year)][str(month)].append({
                    "t": row["ts"].strftime("%Y-%m-%d %H:%M"),
                    "aqi": num(row["aqi"], 0.0, 1),
                    "pm25": num(row["pm2_5"], 0.0, 1),
                    "no2": num(row["no2"], 0.0, 1) if "no2" in row.index else 0.0,
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


def overlap_scale(
    monthly: dict, target_year: int, ref_year: int, overlap_months: list[int]
) -> float:
    ratios = []
    ty = monthly.get(str(target_year), {})
    ry = monthly.get(str(ref_year), {})
    for m in overlap_months:
        t = ty.get(str(m))
        r = ry.get(str(m))
        if t and r and r["aqi"] > 0:
            ratios.append(t["aqi"] / r["aqi"])
    return sum(ratios) / len(ratios) if ratios else 1.0


def scale_daily(ref_daily: list, pred_mean: float) -> list:
    if len(ref_daily) < 1:
        return []
    shape_mean = sum(d["aqi"] for d in ref_daily) / len(ref_daily)
    sc = pred_mean / shape_mean if shape_mean > 0 else 1.0
    out = []
    for d in ref_daily:
        out.append({
            "day": d["day"],
            "aqi": num(d["aqi"] * sc, 0.0, 1),
            "pm25": num(d.get("pm25", 0) * sc, 0.0, 1),
            "no2": num(d.get("no2", 0) * sc, 0.0, 1),
            "o3": num(d.get("o3", 0) * sc, 0.0, 1),
            "so2": num(d.get("so2", 0) * sc, 0.0, 1),
        })
    return out


def scale_monthly_record(ref: dict, pred_mean: float) -> dict:
    sc = pred_mean / ref["aqi"] if ref.get("aqi", 0) > 0 else 1.0
    rec = {
        "aqi": num(pred_mean, 0.0, 1),
        "pm25": num(ref.get("pm25", 0) * sc, 0.0, 1),
        "pm10": num(ref.get("pm10", 0) * sc, 0.0, 1),
        "no2": num(ref.get("no2", 0) * sc, 0.0, 1),
        "no": num(ref.get("no", 0) * sc, 0.0, 2),
        "o3": num(ref.get("o3", 0) * sc, 0.0, 1),
        "so2": num(ref.get("so2", 0) * sc, 0.0, 1),
        "co": num(ref.get("co", 0) * sc, 0.0, 1),
        "nh3": num(ref.get("nh3", 0) * sc, 0.0, 1),
        "bin": aqi_bin(pred_mean),
        "readings": 0,
        "estimated": True,
    }
    return rec


def scale_hourly(ref_hourly: list, ref_year: int, target_year: int, scale: float) -> list:
    out = []
    for h in ref_hourly:
        t = h["t"]
        if t.startswith(f"{ref_year}-"):
            t = f"{target_year}-{t[5:]}"
        out.append({
            "t": t,
            "aqi": num(h["aqi"] * scale, 0.0, 1),
            "pm25": num(h.get("pm25", 0) * scale, 0.0, 1),
            "no2": num(h.get("no2", 0) * scale, 0.0, 1),
        })
    return out


def fill_partial_years(
    monthly: dict, daily: dict, hourly: dict, meta: dict
) -> None:
    """Estimate missing months for sparse years (2020, 2023) from a full reference year."""
    for year, cfg in PARTIAL_YEARS.items():
        ref_year = cfg["ref"]
        overlap = cfg["overlap"]
        ys, rs = str(year), str(ref_year)
        scale = overlap_scale(monthly, year, ref_year, overlap)

        monthly.setdefault(ys, {})
        daily.setdefault(ys, {})
        hourly.setdefault(ys, {})
        meta.setdefault(ys, {})

        for month in range(1, 13):
            key = str(month)
            existing = monthly[ys].get(key)
            if existing and existing.get("readings", 0) > 0:
                meta[ys][key] = {"source": "observed"}
                continue

            ref_m = monthly.get(rs, {}).get(key)
            ref_d = daily.get(rs, {}).get(key, [])
            if not ref_m or len(ref_d) < 5:
                continue

            pred_mean = num(ref_m["aqi"] * scale, 0.0, 1)
            daily[ys][key] = scale_daily(ref_d, pred_mean)
            monthly[ys][key] = scale_monthly_record(ref_m, pred_mean)

            ref_h = hourly.get(rs, {}).get(key, [])
            if ref_h:
                sc = pred_mean / ref_m["aqi"] if ref_m["aqi"] > 0 else scale
                hourly[ys][key] = scale_hourly(ref_h, ref_year, year, sc)
            else:
                hourly[ys][key] = []

            mlabel = MONTH_NAMES[month - 1]
            meta[ys][key] = {
                "source": "estimated",
                "note": (
                    f"Estimated {mlabel} {year} from {mlabel} {ref_year}, "
                    f"scaled by observed overlap ({scale:.2f}×)."
                ),
            }


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

    meta_partial: dict = {}
    fill_partial_years(monthly, daily, hourly_dict, meta_partial)

    payload = {
        "years": years,
        "forecastYear": FORECAST_YEAR,
        "months": list(range(1, 13)),
        "monthNames": MONTH_NAMES,
        "monthly": monthly,
        "daily": daily,
        "hourly": hourly_dict,
        "actual2026Meta": meta_2026,
        "partialYearMeta": meta_partial,
    }

    payload = sanitize_for_json(payload)

    for out in OUT_PATHS:
        out.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(payload, allow_nan=False)
        out.write_text(text, encoding="utf-8")
        assert "NaN" not in text, f"Invalid JSON written to {out}"
        print(f"Wrote {out} ({out.stat().st_size // 1024} KB)")
        if meta_2026:
            obs = sum(1 for m in meta_2026.values() if m.get("source") == "observed")
            est = sum(1 for m in meta_2026.values() if m.get("source") == "estimated")
            print(f"  2026 months: {obs} observed, {est} estimated")
        for ys, months in meta_partial.items():
            obs = sum(1 for m in months.values() if m.get("source") == "observed")
            est = sum(1 for m in months.values() if m.get("source") == "estimated")
            print(f"  {ys}: {obs} observed, {est} estimated months")


if __name__ == "__main__":
    main()
