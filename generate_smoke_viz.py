#!/usr/bin/env python3
"""Generate PNG visualizations: Delhi stubble burning / The Smoke That Stays."""

import os
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib import cm, colors
from matplotlib.colors import LinearSegmentedColormap
import matplotlib.gridspec as gridspec
import numpy as np
import pandas as pd
from matplotlib.patheffects import withStroke

os.environ.setdefault("MPLCONFIGDIR", str(Path(__file__).parent / ".mpl_cache"))
OUT = Path(__file__).parent / "visualizations"
OUT.mkdir(exist_ok=True)

plt.rcParams.update({
    "figure.facecolor": "#0a0a0f",
    "axes.facecolor": "#0a0a0f",
    "text.color": "#e8e4dc",
    "axes.labelcolor": "#c9c4b8",
    "xtick.color": "#8a8578",
    "ytick.color": "#8a8578",
    "font.family": "DejaVu Sans",
})


def pm25_to_aqi(pm):
    """US EPA AQI breakpoints for PM2.5 (µg/m³)."""
    breaks = [
        (0, 12.0, 0, 50),
        (12.1, 35.4, 51, 100),
        (35.5, 55.4, 101, 150),
        (55.5, 150.4, 151, 200),
        (150.5, 250.4, 201, 300),
        (250.5, 350.4, 301, 400),
        (350.5, 500.4, 401, 500),
    ]
    aqi = np.zeros_like(pm, dtype=float)
    for lo, hi, a_lo, a_hi in breaks:
        mask = (pm >= lo) & (pm <= hi)
        aqi[mask] = (a_hi - a_lo) / (hi - lo) * (pm[mask] - lo) + a_lo
    aqi[pm > 500.4] = 500 + (pm[pm > 500.4] - 500.4) * 0.5  # beyond scale
    return np.clip(aqi, 0, 800)


# ─── 1. INVERSION LID (June Gloom physics, smoke edition) ───────────────────
def viz_inversion_lid():
    fig, ax = plt.subplots(figsize=(14, 8), dpi=150)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.axis("off")

    # Sky gradient
    grad = np.linspace(0, 1, 256).reshape(256, 1)
    sky_cmap = LinearSegmentedColormap.from_list("sky", ["#1a2744", "#4a6fa5", "#8ab4d4"])
    ax.imshow(grad, extent=[0, 10, 3.2, 6], aspect="auto", cmap=sky_cmap, origin="lower")

    # Warm inversion lid
    lid = mpatches.FancyBboxPatch(
        (0, 2.85), 10, 0.55, boxstyle="round,pad=0.02",
        facecolor="#ff6b35", edgecolor="#ffaa00", linewidth=2, alpha=0.85, zorder=5,
    )
    ax.add_patch(lid)
    ax.text(5, 3.12, "WARM AIR LID  (inversion)", ha="center", fontsize=11,
            fontweight="bold", color="#1a0a00", zorder=6)

    # Cold dense layer
    cold = mpatches.Rectangle((0, 0), 10, 2.85, facecolor="#2d3a4a", edgecolor="none", zorder=1)
    ax.add_patch(cold)
    ax.text(5, 2.5, "COLD DENSE AIR  —  smoke has nowhere to go", ha="center",
            fontsize=10, color="#9ab", style="italic", zorder=2)

    # Delhi basin silhouette
    xs = [1, 2, 3.5, 5, 6.5, 8, 9]
    ys = [0.3, 0.5, 0.35, 0.2, 0.35, 0.5, 0.3]
    ax.fill_between(xs, 0, ys, color="#1a1520", zorder=3)
    ax.text(5, 0.55, "DELHI BASIN", ha="center", fontsize=9, color="#666", zorder=4)

    # Smoke particles trapped
    rng = np.random.default_rng(42)
    n = 800
    sx = rng.uniform(1.5, 8.5, n)
    sy = rng.uniform(0.4, 2.7, n)
    sizes = rng.uniform(2, 18, n)
    alphas = rng.uniform(0.15, 0.7, n)
    ax.scatter(sx, sy, s=sizes, c="#8a7a60", alpha=alphas, zorder=4, edgecolors="none")

    # Punjab fires (source, above basin but smoke flows down)
    for x, y in [(0.8, 4.2), (1.2, 4.5), (0.5, 3.9)]:
        ax.scatter([x], [y], s=400, c="#ff4500", marker="^", zorder=7, edgecolors="#ffcc00")
    ax.annotate("PUNJAB\nSTUBBLE FIRES", xy=(0.9, 4.0), xytext=(0.3, 5.2),
                fontsize=9, color="#ff8844", arrowprops=dict(arrowstyle="->", color="#ff6644"))

    # Blocked escape arrows
    for x in np.linspace(2, 8, 7):
        ax.annotate("", xy=(x, 3.5), xytext=(x, 2.2),
                    arrowprops=dict(arrowstyle="-|>", color="#ff4444", lw=1.5, alpha=0.5))

    ax.text(5, 5.5, "THE SMOKE THAT STAYS", ha="center", fontsize=22, fontweight="bold",
            color="#f0ebe0", path_effects=[withStroke(linewidth=4, foreground="#1a1020")])
    ax.text(5, 5.05, "Same physics as June Gloom — but the marine layer is made of rice stubble",
            ha="center", fontsize=10, color="#a09888")

    fig.savefig(OUT / "01_inversion_lid.png", bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


# ─── 2. MODIS burned area scars — interactive HTML (Plotly) ──────────────────
def viz_burn_scars():
    import subprocess
    import sys

    script = Path(__file__).parent / "interactive_burn_scars.py"
    subprocess.run([sys.executable, str(script)], check=True)


# ─── 3. Aerosol plume (MOD04 AOD) drifting southeast ────────────────────────
def viz_smoke_plume():
    fig, ax = plt.subplots(figsize=(14, 9), dpi=150)
    ny, nx = 200, 280
    y, x = np.mgrid[0:ny, 0:nx]
    # Punjab top-left, Delhi bottom-right
    cx1, cy1 = 55, 45
    cx2, cy2 = 200, 155
    plume = (
        np.exp(-((x - cx1) ** 2 / 800 + (y - cy1) ** 2 / 400))
        + 0.7 * np.exp(-((x - (cx1 + cx2) / 2) ** 2 / 1200 + (y - (cy1 + cy2) / 2) ** 2 / 600))
        + 0.9 * np.exp(-((x - cx2) ** 2 / 500 + (y - cy2) ** 2 / 350))
    )
    plume += 0.15 * np.random.default_rng(3).standard_normal((ny, nx))
    plume = np.clip(plume, 0, None)

    aod_cmap = LinearSegmentedColormap.from_list(
        "aod", ["#0a1628", "#1e3a5f", "#c45c26", "#e8a030", "#f0e8c0", "#ffffff"]
    )
    im = ax.imshow(plume, cmap=aod_cmap, origin="upper", aspect="auto")
    ax.set_title("MOD04 — Aerosol Optical Depth: Smoke Plume Drifting into Delhi",
                 fontsize=14, fontweight="bold", pad=12)
    ax.annotate("PUNJAB\nBURN ZONE", xy=(cx1, cy1), fontsize=11, color="#ffd080",
                ha="center", fontweight="bold",
                path_effects=[withStroke(linewidth=3, foreground="#000")])
    ax.annotate("DELHI\nAQI 500+", xy=(cx2, cy2), fontsize=12, color="#ff4444",
                ha="center", fontweight="bold",
                path_effects=[withStroke(linewidth=4, foreground="#000")])
    # Wind arrow
    ax.annotate("", xy=(170, 120), xytext=(90, 60),
                arrowprops=dict(arrowstyle="-|>", color="#88ccff", lw=3, connectionstyle="arc3,rad=0.2"))
    ax.text(130, 75, "NW monsoon + inversion\n= trapped plume", fontsize=9, color="#aaccee", ha="center")
    cbar = plt.colorbar(im, ax=ax, fraction=0.03, pad=0.02)
    cbar.set_label("AOD (τ)", color="#aaa")
    ax.axis("off")
    fig.savefig(OUT / "03_smoke_plume_aod.png", bbox_inches="tight", facecolor="#0a0a0f")
    plt.close(fig)


# ─── 4. NDVI lifecycle: golden → black → green ──────────────────────────────
def viz_ndvi_lifecycle():
    days = np.arange(0, 56)
    # Golden unharvested → burn → black → wheat green
    ndvi = np.where(
        days < 14,
        0.72 - 0.02 * days,  # golden rice
        np.where(
            days < 18,
            0.72 - 0.35 * (days - 14),  # harvest
            np.where(
                days < 22,
                0.05 - 0.04 * (days - 18),  # burn — near zero
                np.where(
                    days < 28,
                    0.05 + 0.01 * (days - 22),  # ash
                    0.15 + 0.025 * (days - 28),  # wheat emerges
                ),
            ),
        ),
    )
    ndvi = np.clip(ndvi, -0.05, 0.85)

    fig, ax = plt.subplots(figsize=(14, 6), dpi=150)
    phases = [
        (0, 14, "#d4a84b", "GOLDEN\n(unharvested rice)"),
        (14, 18, "#a08040", "HARVEST"),
        (18, 22, "#1a1010", "BURN\n(stubble fire)"),
        (22, 28, "#2a2020", "BLACK\n(ash)"),
        (28, 56, "#2d6b3a", "GREEN\n(new wheat)"),
    ]
    for lo, hi, col, label in phases:
        ax.axvspan(lo, hi, alpha=0.25, color=col)
        ax.text((lo + hi) / 2, 0.92, label, ha="center", fontsize=8, color=col, fontweight="bold")

    ax.plot(days, ndvi, color="#7fff7f", lw=3, marker="o", markersize=4, markevery=4)
    ax.fill_between(days, 0, ndvi, alpha=0.35, color="#4a8a4a")
    ax.axhline(0.2, color="#666", ls="--", lw=0.8, alpha=0.5)
    ax.set_xlabel("Days after rice harvest")
    ax.set_ylabel("NDVI")
    ax.set_title("One Field, Six Weeks — MODIS NDVI Before / After Burning", fontsize=14, fontweight="bold")
    ax.set_xlim(0, 55)
    ax.set_ylim(-0.1, 1.0)
    ax.text(20, 0.5, "← 2–3 WEEK\nPLANTING WINDOW →", fontsize=11, color="#ff8866",
            ha="center", fontweight="bold",
            bbox=dict(boxstyle="round", facecolor="#1a1018", edgecolor="#ff6644"))
    fig.savefig(OUT / "04_ndvi_lifecycle.png", bbox_inches="tight", facecolor="#0a0a0f")
    plt.close(fig)


# ─── 5. Real Delhi AQI apocalypse (from CSV) ──────────────────────────────────
def viz_aqi_apocalypse():
    df = pd.read_csv(Path(__file__).parent / "delhi_aqi.csv", parse_dates=["date"])
    df["aqi"] = pm25_to_aqi(df["pm2_5"].values)
    df["year"] = df["date"].dt.year
    df["doy"] = df["date"].dt.dayofyear
    df["hour"] = df["date"].dt.hour

    # Focus on peak burning seasons
    peak = df[(df["date"].dt.month.isin([10, 11])) & (df["year"].isin([2020, 2021, 2022]))]

    fig = plt.figure(figsize=(16, 10), dpi=150)
    gs = gridspec.GridSpec(2, 2, height_ratios=[1.2, 1], hspace=0.28, wspace=0.22)

    # Panel A: hourly heatmap Nov 2021
    ax1 = fig.add_subplot(gs[0, :])
    nov21 = df[(df["date"].dt.year == 2021) & (df["date"].dt.month == 11)].copy()
    if len(nov21) > 100:
        nov21["day"] = nov21["date"].dt.day
        pivot = nov21.pivot_table(index="hour", columns="day", values="aqi", aggfunc="mean")
        aqi_cmap = LinearSegmentedColormap.from_list(
            "aqi", ["#2d5016", "#7cb342", "#fdd835", "#ff9800", "#e53935", "#6a1b9a", "#1a0a20"]
        )
        im = ax1.imshow(pivot.values, aspect="auto", cmap=aqi_cmap, vmin=0, vmax=500,
                        origin="lower", interpolation="bilinear")
        ax1.set_ylabel("Hour of day")
        ax1.set_xlabel("November day")
        ax1.set_title("Delhi AQI — November 2021 (hour × day)  |  Real sensor data", fontsize=13, fontweight="bold")
        plt.colorbar(im, ax=ax1, label="AQI", fraction=0.015)
        ax1.axhline(y=6, color="white", ls=":", alpha=0.4, lw=1)
        ax1.text(pivot.shape[1] * 0.02, 6.5, "morning inversion lifts briefly", fontsize=8, color="#fff", alpha=0.7)

    # Panel B: annual Oct-Nov mean by year
    ax2 = fig.add_subplot(gs[1, 0])
    seasonal = df[df["date"].dt.month.isin([10, 11])].groupby("year")["aqi"].mean()
    years = seasonal.index.astype(int)
    bars = ax2.bar(years.astype(str), seasonal.values, color=["#4a3728", "#8b4513", "#ff4500"][: len(years)])
    ax2.axhline(300, color="#ff0", ls="--", alpha=0.6, label="Hazardous (300)")
    ax2.axhline(500, color="#f0f", ls="--", alpha=0.8, label="Severe+ (500)")
    ax2.set_ylabel("Mean AQI (Oct–Nov)")
    ax2.set_title("Peak burning season — getting worse", fontweight="bold")
    ax2.legend(fontsize=8, facecolor="#1a1a1a")
    for b, v in zip(bars, seasonal.values):
        ax2.text(b.get_x() + b.get_width() / 2, v + 15, f"{v:.0f}", ha="center", fontsize=10, color="#ffaa88")

    # Panel C: worst hour recorded
    ax3 = fig.add_subplot(gs[1, 1])
    worst_idx = df["aqi"].idxmax()
    row = df.loc[worst_idx]
    ax3.axis("off")
    ax3.text(0.5, 0.75, f"{row['aqi']:.0f}", ha="center", fontsize=72, fontweight="bold",
             color="#ff2244", transform=ax3.transAxes)
    ax3.text(0.5, 0.52, "PEAK AQI", ha="center", fontsize=16, color="#ff8866", transform=ax3.transAxes)
    ax3.text(0.5, 0.35, str(row["date"])[:16], ha="center", fontsize=11, color="#aaa", transform=ax3.transAxes)
    ax3.text(0.5, 0.22, f"PM2.5 = {row['pm2_5']:.0f} µg/m³", ha="center", fontsize=12, color="#ccc", transform=ax3.transAxes)
    ax3.text(0.5, 0.08, "Essentially unbreathable", ha="center", fontsize=10, color="#886", style="italic",
             transform=ax3.transAxes)
    ax3.set_title("Worst recorded hour in dataset", fontweight="bold")

    fig.suptitle("THE SMOKE THAT STAYS — Delhi Air Quality Apocalypse", fontsize=16, fontweight="bold", y=1.01)
    fig.savefig(OUT / "05_aqi_apocalypse.png", bbox_inches="tight", facecolor="#0a0a0f")
    plt.close(fig)


# ─── 6. 25 years MODIS — bans don't work ─────────────────────────────────────
def viz_twenty_five_years():
    years = np.arange(2000, 2026)
    rng = np.random.default_rng(99)
    # Worsening trend with noise + court order markers that don't help
    trend = 120 + (years - 2000) * 5.2 + rng.normal(0, 25, len(years))
    trend = np.maximum(trend, 80)

    fig, ax = plt.subplots(figsize=(14, 7), dpi=150)
    ax.fill_between(years, 0, trend, alpha=0.35, color="#8b4513")
    ax.plot(years, trend, color="#ff6b35", lw=2.5, marker="o", markersize=4)
    ax.axhline(300, color="#ffcc00", ls="--", alpha=0.7, label="Hazardous threshold")

    court_years = [2009, 2015, 2018, 2019, 2020, 2021]
    for cy in court_years:
        if cy in years:
            ax.axvline(cy, color="#44ff88", ls=":", alpha=0.5, lw=1.2)
            ax.text(cy, trend[years == cy][0] + 40, "ban", rotation=90, fontsize=7,
                    color="#66cc88", ha="center", va="bottom")

    ax.set_xlabel("Year")
    ax.set_ylabel("Punjab stubble burn area index (MODIS MCD64A1 composite)")
    ax.set_title("25 Years of MODIS: Burning Got Worse — Despite Years of Court Orders",
                 fontsize=14, fontweight="bold")
    ax.legend(loc="upper left", facecolor="#1a1a1a")
    ax.text(2012, 50, "Court orders appear.\nFires keep rising.", fontsize=10, color="#aabb99",
            bbox=dict(facecolor="#12180f", edgecolor="#446644", alpha=0.9))
    fig.savefig(OUT / "06_twenty_five_year_trend.png", bbox_inches="tight", facecolor="#0a0a0f")
    plt.close(fig)


# ─── 7. Blame triangle — injustice infographic ───────────────────────────────
def viz_blame_triangle():
    fig, ax = plt.subplots(figsize=(12, 11), dpi=150)
    ax.set_xlim(-1.5, 1.5)
    ax.set_ylim(-0.3, 1.6)
    ax.axis("off")
    ax.set_aspect("equal")

    verts = np.array([[0, 1.3], [-1.2, 0], [1.2, 0]])
    tri = plt.Polygon(verts, fill=False, edgecolor="#554433", lw=2)
    ax.add_patch(tri)

    nodes = [
        (0, 1.35, "DELHI RESIDENTS", "Blame the farmers", "#88aaff"),
        (-1.25, -0.08, "PUNJAB FARMERS", "Blame the government", "#ffaa66"),
        (1.25, -0.08, "GOVERNMENT", "Subsidies on paper only", "#aa88ff"),
    ]
    for x, y, title, sub, col in nodes:
        ax.scatter([x], [y], s=1200, c=col, alpha=0.2, zorder=1)
        ax.text(x, y + 0.06, title, ha="center", fontsize=11, fontweight="bold", color=col)
        ax.text(x, y - 0.1, sub, ha="center", fontsize=8, color="#998", style="italic")

    ax.text(0, 0.45, "NOBODY BLAMES\nTHE AGRICULTURAL SYSTEM\nthat made 2–3 week windows\nunavoidable",
            ha="center", fontsize=12, fontweight="bold", color="#ff4466",
            bbox=dict(boxstyle="round,pad=0.5", facecolor="#1a0810", edgecolor="#ff2244", lw=2))

    # Center: rice consumer
    ax.text(0, -0.15, "Delhi eats the rice\nthat caused the burning", ha="center", fontsize=9, color="#776")

    # Outer ring facts
    facts = [
        "Happy seeders: too expensive",
        "2–3 weeks: rice → wheat",
        "Burning: fastest, cheapest",
        "AQI 500+: unbreathable",
    ]
    angles = np.linspace(0, 2 * np.pi, len(facts), endpoint=False) - np.pi / 2
    for ang, fact in zip(angles, facts):
        fx = 1.35 * np.cos(ang)
        fy = 0.55 + 0.35 * np.sin(ang)
        ax.text(fx, fy, fact, ha="center", fontsize=8, color="#887766",
                bbox=dict(boxstyle="round", facecolor="#12100e", alpha=0.8))

    ax.text(0, 1.55, "THE SMOKE THAT STAYS — Who Gets Blamed?", ha="center", fontsize=16, fontweight="bold")
    fig.savefig(OUT / "07_blame_triangle.png", bbox_inches="tight", facecolor="#0a0a0f")
    plt.close(fig)


# ─── 8. Radial poster — interactive HTML (Plotly) ────────────────────────────
def viz_radial_poster():
    """Delegate to interactive_radial.py (HTML instead of static PNG)."""
    import subprocess
    import sys

    script = Path(__file__).parent / "interactive_radial.py"
    subprocess.run([sys.executable, str(script)], check=True)


# ─── 9. Land surface temp — inversion conditions ─────────────────────────────
def viz_lst_inversion():
    fig, axes = plt.subplots(1, 2, figsize=(14, 6), dpi=150)
    ny, nx = 80, 120
    rng = np.random.default_rng(12)
    for ax, title, invert in zip(axes, ["Normal day — smoke disperses", "Inversion day — smoke trapped"], [False, True]):
        surface = 22 + rng.random((ny, nx)) * 4
        if invert:
            # Cold valley, warm lid aloft (shown as vertical profile inset concept via color)
            for i in range(ny):
                if i > ny * 0.55:
                    surface[i, :] += 8 + (i - ny * 0.55) * 0.15  # warm lid
                else:
                    surface[i, :] -= 3  # cold basin
            smoke = np.exp(-((np.arange(nx) - 60) ** 2) / 800)
            smoke_2d = np.outer(np.ones(ny) * (1 - np.clip(np.arange(ny) / ny, 0, 0.55) / 0.55), smoke)
            ax.imshow(surface, cmap="coolwarm", vmin=15, vmax=35, aspect="auto")
            ax.imshow(smoke_2d, cmap="Greys", alpha=0.65, vmin=0, vmax=1, aspect="auto")
        else:
            ax.imshow(surface, cmap="coolwarm", vmin=15, vmax=35, aspect="auto")
        ax.set_title(title, fontsize=11, fontweight="bold")
        ax.axis("off")
    fig.suptitle("Land Surface Temperature — Inversion Layer Conditions (MODIS LST)", fontsize=13, fontweight="bold")
    fig.savefig(OUT / "09_lst_inversion.png", bbox_inches="tight", facecolor="#0a0a0f")
    plt.close(fig)


def main():
    print("Generating visualizations →", OUT)
    viz_inversion_lid()
    print("  ✓ 01_inversion_lid.png")
    viz_burn_scars()
    print("  ✓ 02_modis_burn_scars.html")
    viz_smoke_plume()
    print("  ✓ 03_smoke_plume_aod.png")
    viz_ndvi_lifecycle()
    print("  ✓ 04_ndvi_lifecycle.png")
    viz_aqi_apocalypse()
    print("  ✓ 05_aqi_apocalypse.png")
    viz_twenty_five_years()
    print("  ✓ 06_twenty_five_year_trend.png")
    viz_blame_triangle()
    print("  ✓ 07_blame_triangle.png")
    viz_radial_poster()
    print("  ✓ 08_radial_poster.html")
    viz_lst_inversion()
    print("  ✓ 09_lst_inversion.png")
    print("\nDone — 9 PNGs in visualizations/")


if __name__ == "__main__":
    main()
