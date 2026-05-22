#!/usr/bin/env python3
"""Interactive radial AQI chart — The Smoke That Stays (Plotly HTML)."""

import sys
from pathlib import Path

# Local plotly install (pip install plotly --target .pydeps)
_DEPS = Path(__file__).parent / ".pydeps"
if _DEPS.exists():
    sys.path.insert(0, str(_DEPS))

import pandas as pd
import plotly.graph_objects as go

DATA = Path(__file__).parent / "delhi_aqi.csv"
OUT = Path(__file__).parent / "visualizations" / "08_radial_poster.html"

SMOKE_SCALE = [
    [0.0, "#1e3a4a"],
    [0.12, "#3d6b7a"],
    [0.28, "#6b9e8f"],
    [0.42, "#c9b87a"],
    [0.58, "#e8956a"],
    [0.72, "#d45d52"],
    [0.88, "#9e3a5c"],
    [1.0, "#4a2040"],
]

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def pm25_to_aqi(pm):
    breaks = [
        (0, 12.0, 0, 50),
        (12.1, 35.4, 51, 100),
        (35.5, 55.4, 101, 150),
        (55.5, 150.4, 151, 200),
        (150.5, 250.4, 201, 300),
        (250.5, 350.4, 301, 400),
        (350.5, 500.4, 401, 500),
    ]
    aqi = 0.0
    for lo, hi, a_lo, a_hi in breaks:
        if lo <= pm <= hi:
            return (a_hi - a_lo) / (hi - lo) * (pm - lo) + a_lo
    if pm > 500.4:
        return 500 + (pm - 500.4) * 0.5
    return 0.0


def aqi_label(aqi: float) -> str:
    if aqi <= 50:
        return "Good"
    if aqi <= 100:
        return "Moderate"
    if aqi <= 150:
        return "Unhealthy for sensitive groups"
    if aqi <= 200:
        return "Unhealthy"
    if aqi <= 300:
        return "Very unhealthy"
    if aqi <= 500:
        return "Hazardous"
    return "Severe+"


def _bar_trace_for_year(sub: pd.DataFrame, year: int, show_colorbar: bool = False) -> go.Barpolar:
    theta = [(m - 0.5) * 30 for m in sub["month"]]
    marker: dict = dict(
        color=sub["aqi"],
        colorscale=SMOKE_SCALE,
        cmin=50,
        cmax=500,
        line=dict(color="rgba(12,14,20,0.85)", width=1.5),
    )
    if show_colorbar:
        marker["colorbar"] = dict(
            title=dict(text="AQI", font=dict(color="#9ca3af", size=12)),
            tickfont=dict(color="#9ca3af"),
            len=0.5,
            y=0.55,
            x=0.92,
            xanchor="left",
            yanchor="middle",
            outlinecolor="#333",
            bgcolor="rgba(0,0,0,0)",
        )
    return go.Barpolar(
        r=[0.78] * len(sub),
        base=[0.38] * len(sub),
        theta=theta,
        marker=marker,
        customdata=sub[["month_name", "aqi", "pm25", "n", "category", "burn_note"]].values,
        hovertemplate=(
            "<b>%{customdata[0]} %{fullData.name}</b><br>"
            "Mean AQI: <b>%{customdata[1]:.0f}</b> (%{customdata[4]})<br>"
            "Mean PM2.5: %{customdata[2]:.1f} µg/m³<br>"
            "Readings: %{customdata[3]:,}<br>"
            "%{customdata[5]}<br>"
            "<extra></extra>"
        ),
        name=str(year),
        opacity=0.95,
    )


def _year_stats(df: pd.DataFrame, year: int) -> tuple[float, str, float]:
    yr = df[df["year"] == year]
    peak = float(yr["aqi"].max())
    peak_when = yr.loc[yr["aqi"].idxmax(), "date"].strftime("%b %d, %H:%M")
    burn = float(yr[yr["month"].isin([10, 11])]["aqi"].mean())
    return peak, peak_when, burn


def _title_text(year: int, peak: float, peak_when: str, burn: float) -> str:
    return (
        f"<b>THE SMOKE THAT STAYS</b>  ·  <span style='color:#fbbf24'>{year}</span><br>"
        f"<sup>Peak <b>{peak:.0f}</b> AQI on {peak_when}  ·  "
        f"Oct–Nov mean <b>{burn:.0f}</b>  ·  drag slider to change year</sup>"
    )


def build_figure() -> go.Figure:
    df = pd.read_csv(DATA, parse_dates=["date"])
    df["aqi"] = df["pm2_5"].apply(pm25_to_aqi)
    df = df.assign(year=df["date"].dt.year, month=df["date"].dt.month)

    monthly = (
        df.groupby(["year", "month"], as_index=False)
        .agg(aqi=("aqi", "mean"), pm25=("pm2_5", "mean"), n=("aqi", "count"))
    )
    monthly["month_name"] = monthly["month"].map(dict(enumerate(MONTHS, start=1)))
    monthly["category"] = monthly["aqi"].apply(aqi_label)
    monthly["burn_note"] = monthly["month"].apply(
        lambda m: "🔥 Stubble burning season" if m in (10, 11) else ""
    )

    years = sorted(int(y) for y in monthly["year"].unique())
    burn_month_ticks = [
        f"<span style='color:#fbbf24;font-weight:600'>{m}</span>" if m in ("Oct", "Nov") else m
        for m in MONTHS
    ]

    def frame_for_year(year: int):
        sub = monthly[monthly["year"] == year].sort_values("month")
        peak, peak_when, burn = _year_stats(df, year)
        return go.Frame(
            data=[_bar_trace_for_year(sub, year)],
            name=str(year),
            layout=go.Layout(
                title=dict(
                    text=_title_text(year, peak, peak_when, burn),
                    x=0.5,
                    xanchor="center",
                    font=dict(size=20, color="#f3f1ec"),
                ),
            ),
        )

    first = years[0]
    peak0, when0, burn0 = _year_stats(df, first)
    fig = go.Figure(
        data=[_bar_trace_for_year(
            monthly[monthly["year"] == first].sort_values("month"), first, show_colorbar=True
        )],
        frames=[frame_for_year(y) for y in years],
    )

    slider_steps = [
        dict(
            label=str(y),
            method="animate",
            args=[
                [str(y)],
                dict(
                    mode="immediate",
                    frame=dict(duration=200, redraw=True),
                    transition=dict(duration=200),
                ),
            ],
        )
        for y in years
    ]

    fig.update_layout(
        title=dict(
            text=_title_text(first, peak0, when0, burn0),
            x=0.5,
            xanchor="center",
            font=dict(size=20, color="#f3f1ec"),
        ),
        paper_bgcolor="#0c0e14",
        plot_bgcolor="#0c0e14",
        font=dict(color="#9ca3af", family="Inter, system-ui, sans-serif"),
        showlegend=False,
        height=780,
        width=880,
        polar=dict(
            domain=dict(x=[0.06, 0.78], y=[0.22, 0.88]),
            bgcolor="#141820",
            radialaxis=dict(visible=False, range=[0, 1.02]),
            angularaxis=dict(
                direction="clockwise",
                rotation=90,
                tickmode="array",
                tickvals=[(i - 0.5) * 30 for i in range(1, 13)],
                ticktext=burn_month_ticks,
                ticks="",
                linecolor="rgba(255,255,255,0.08)",
                gridcolor="rgba(255,255,255,0.06)",
                tickfont=dict(size=12, color="#6b7280"),
            ),
        ),
        margin=dict(l=40, r=40, t=110, b=100),
        hoverlabel=dict(bgcolor="#1a2030", bordercolor="#444", font_size=13),
        sliders=[
            dict(
                active=0,
                x=0.08,
                xanchor="left",
                y=0.06,
                yanchor="bottom",
                len=0.72,
                pad=dict(t=0, b=0),
                bgcolor="#141820",
                bordercolor="#444",
                borderwidth=1,
                tickcolor="#6b7280",
                font=dict(color="#9ca3af", size=11),
                currentvalue=dict(visible=False),
                steps=slider_steps,
            )
        ],
        updatemenus=[
            dict(
                type="buttons",
                showactive=False,
                x=0.82,
                y=0.06,
                xanchor="left",
                yanchor="bottom",
                bgcolor="#141820",
                bordercolor="#444",
                font=dict(color="#9ca3af", size=11),
                buttons=[
                    dict(
                        label="▶ Play",
                        method="animate",
                        args=[
                            None,
                            dict(
                                frame=dict(duration=900, redraw=True),
                                fromcurrent=True,
                                transition=dict(duration=500),
                            ),
                        ],
                    ),
                ],
            )
        ],
    )

    return fig


def main():
    OUT.parent.mkdir(exist_ok=True)
    fig = build_figure()
    fig.write_html(
        OUT,
        include_plotlyjs="cdn",
        config=dict(
            displayModeBar=True,
            displaylogo=False,
            modeBarButtonsToRemove=["lasso2d", "select2d"],
            toImageButtonOptions=dict(format="png", scale=2),
        ),
    )
    print(f"Saved → {OUT}")
    print("Open in any browser (double-click the file).")


if __name__ == "__main__":
    main()
