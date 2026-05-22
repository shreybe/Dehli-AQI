#!/usr/bin/env python3
"""Interactive MCD64A1 burn-scar map — week slider (Plotly HTML)."""

import sys
from pathlib import Path

_DEPS = Path(__file__).parent / ".pydeps"
if _DEPS.exists():
    sys.path.insert(0, str(_DEPS))

import numpy as np
import plotly.graph_objects as go

OUT = Path(__file__).parent / "visualizations" / "02_modis_burn_scars.html"
WEEKS = 6
NY, NX = 120, 140

BURN_SCALE = [
    [0.0, "#c4a574"],
    [0.25, "#8b7355"],
    [0.45, "#5c4030"],
    [0.65, "#3d2817"],
    [0.85, "#1a0f08"],
    [1.0, "#0d0805"],
]


def generate_week_fields():
    """Same synthetic Punjab grid as generate_smoke_viz.viz_burn_scars (seed 7)."""
    rng = np.random.default_rng(7)
    base = rng.random((NY, NX)) * 0.3 + 0.5
    fields, fracs, patch_counts = [], [], []

    for week in range(1, WEEKS + 1):
        burn_frac = min(0.85, 0.05 + week * 0.14)
        field = base.copy()
        n_patches = int(15 + week * 12)
        for _ in range(n_patches):
            cy, cx = rng.integers(10, NY - 10), rng.integers(10, NX - 10)
            r = rng.integers(4, 18)
            yy, xx = np.ogrid[-r : r + 1, -r : r + 1]
            mask = xx * xx + yy * yy <= r * r
            y0, x0 = max(0, cy - r), max(0, cx - r)
            sl_y = slice(y0, min(NY, y0 + 2 * r + 1))
            sl_x = slice(x0, min(NX, x0 + 2 * r + 1))
            m = mask[: sl_y.stop - sl_y.start, : sl_x.stop - sl_x.start]
            field[sl_y, sl_x][m] = rng.uniform(0.02, 0.15)

        fields.append(field)
        fracs.append(burn_frac)
        patch_counts.append(n_patches)

    return fields, fracs, patch_counts


def _heatmap_trace(field: np.ndarray, week: int, show_scale: bool = False) -> go.Heatmap:
    burned = field < 0.35
    pct = 100 * burned.mean()
    return go.Heatmap(
        z=field,
        zmin=0,
        zmax=1,
        colorscale=BURN_SCALE,
        showscale=show_scale,
        colorbar=dict(
            title=dict(text="Burn severity", font=dict(color="#9ca3af", size=11)),
            tickfont=dict(color="#9ca3af"),
            len=0.45,
            y=0.55,
            x=1.01,
            outlinecolor="#333",
            tickvals=[0.1, 0.3, 0.5, 0.7, 0.9],
            ticktext=["Unburned", "Light", "Moderate", "Heavy", "Scar"],
        )
        if show_scale
        else None,
        hovertemplate=(
            "Week %{customdata[0]}<br>"
            "Burn index: %{z:.2f}<br>"
            "%{customdata[1]}<br>"
            "<extra></extra>"
        ),
        customdata=np.stack(
            [
                np.full_like(field, week, dtype=int),
                np.where(burned, "Burned field", "Unburned / stubble"),
            ],
            axis=-1,
        ),
        x=list(range(NX)),
        y=list(range(NY)),
    )


def _delhi_marker() -> go.Scatter:
    dx, dy = NX * 0.72, NY * 0.15
    return go.Scatter(
        x=[dx],
        y=[dy],
        mode="markers+text",
        marker=dict(symbol="star", size=14, color="#ff4444", line=dict(width=1, color="#ffaa88")),
        text=["Delhi →"],
        textposition="middle right",
        textfont=dict(size=11, color="#ff8888"),
        hovertemplate="Smoke plume direction toward Delhi<extra></extra>",
        showlegend=False,
    )


def _title(week: int, burn_frac: float, n_patches: int) -> str:
    return (
        f"<b>MCD64A1 — Burned Area Scars, Punjab</b>  ·  "
        f"<span style='color:#d4a574'>Week {week}</span><br>"
        f"<sup>~{burn_frac * 100:.0f}% fields scarred  ·  {n_patches} active burn patches  ·  "
        f"Oct–Nov stubble fires</sup>"
    )


def build_figure() -> go.Figure:
    fields, fracs, patch_counts = generate_week_fields()

    def traces_for_week(week: int, show_scale: bool = False):
        traces = [_heatmap_trace(fields[week - 1], week, show_scale=show_scale)]
        if week == WEEKS:
            traces.append(_delhi_marker())
        return traces

    fig = go.Figure(data=traces_for_week(1, show_scale=True))
    fig.frames = [
        go.Frame(
            data=traces_for_week(w),
            name=str(w),
            layout=go.Layout(title=dict(text=_title(w, fracs[w - 1], patch_counts[w - 1]))),
        )
        for w in range(1, WEEKS + 1)
    ]

    slider_steps = [
        dict(
            label=f"Wk {w}",
            method="animate",
            args=[
                [str(w)],
                dict(mode="immediate", frame=dict(duration=250, redraw=True), transition=dict(duration=200)),
            ],
        )
        for w in range(1, WEEKS + 1)
    ]

    fig.update_layout(
        title=dict(text=_title(1, fracs[0], patch_counts[0]), x=0.5, xanchor="center", font=dict(size=18, color="#e8dcc8")),
        paper_bgcolor="#0a0a0f",
        plot_bgcolor="#0a0a0f",
        font=dict(color="#9ca3af"),
        height=720,
        width=900,
        margin=dict(l=50, r=90, t=100, b=110),
        xaxis=dict(visible=False, constrain="domain"),
        yaxis=dict(visible=False, scaleanchor="x", scaleratio=NY / NX),
        hoverlabel=dict(bgcolor="#1a1814", bordercolor="#554433", font_size=12),
        sliders=[
            dict(
                active=0,
                x=0.1,
                xanchor="left",
                y=0.05,
                yanchor="bottom",
                len=0.72,
                pad=dict(t=0, b=0),
                bgcolor="#141210",
                bordercolor="#443",
                tickcolor="#887766",
                font=dict(color="#b8a890", size=11),
                currentvalue=dict(visible=False),
                steps=slider_steps,
            )
        ],
        updatemenus=[
            dict(
                type="buttons",
                showactive=False,
                x=0.84,
                y=0.05,
                xanchor="left",
                yanchor="bottom",
                bgcolor="#141210",
                bordercolor="#443",
                font=dict(color="#b8a890", size=11),
                buttons=[
                    dict(
                        label="▶ Play weeks",
                        method="animate",
                        args=[
                            None,
                            dict(
                                frame=dict(duration=700, redraw=True),
                                fromcurrent=True,
                                transition=dict(duration=400),
                            ),
                        ],
                    ),
                ],
            )
        ],
        annotations=[
            dict(
                text="Each dark pixel ≈ one field set on fire · 25 years of MODIS: scars spreading, not shrinking",
                xref="paper",
                yref="paper",
                x=0.5,
                y=-0.02,
                showarrow=False,
                font=dict(size=10, color="#665544"),
                xanchor="center",
            ),
        ],
    )

    return fig


def main():
    OUT.parent.mkdir(exist_ok=True)
    fig = build_figure()
    fig.write_html(
        OUT,
        include_plotlyjs="cdn",
        config=dict(displayModeBar=True, displaylogo=False, scrollZoom=True),
    )
    print(f"Saved → {OUT}")


if __name__ == "__main__":
    main()
