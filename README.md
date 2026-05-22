# The Smoke That Stays — Delhi AQI

Interactive story and data viz about Delhi's air quality, Punjab stubble burning, and MODIS satellite data.

## Mock website (smoke tunnel + guide character)

Open the immersive mock experience:

```bash
cd website
python3 -m http.server 8080
```

Then visit **http://localhost:8080** in your browser.

### Flow
1. **Intro** — Raj (guide character) says hello
2. **Smoke tunnel** — gray vortex transition (character flies through smog)
3. **Main site** — dramatic landing + chapters
4. **Each nav click** — flies through the smoke tunnel again to the next section

### Sections
- **Home** — hero title & key stats
- **My Delhi** — interactive neighborhood AQI map
- **Burn Scars** — interactive MODIS week slider
- **AQI Calendar** — interactive radial year slider
- **The Story** — inversion + who gets blamed

## Data & visualizations

- `delhi_aqi.csv` — hourly Delhi sensor data (2020–2023)
- `generate_smoke_viz.py` — static PNG charts
- `interactive_radial.py` / `interactive_burn_scars.py` — Plotly HTML

```bash
pip install plotly pandas matplotlib numpy --target .pydeps
python3 interactive_radial.py
python3 interactive_burn_scars.py
```

## GitHub Pages (live site)

**URL:** [https://shreybe.github.io/Dehli-AQI/](https://shreybe.github.io/Dehli-AQI/)

If you see the README instead of the smoke-tunnel site, fix Pages settings once:

1. Open **[Settings → Pages](https://github.com/shreybe/Dehli-AQI/settings/pages)**
2. **Either** set **Source → Deploy from a branch → `main` → `/docs`**
3. **Or** set **Source → GitHub Actions** (uses the deploy workflow on `docs/`)

The repo also has `index.html` at the root so **branch / (root)** deploys work too.

> The GitHub **code** view on `github.com/shreybe/Dehli-AQI` always shows README — open the **Pages URL** above for the actual site.
