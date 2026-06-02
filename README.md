# Dehli-AQI

**Breathing Smoke** — scrollytelling narrative on crop burning and Delhi smog, plus **The Smoke That Stays** interactive AQI dashboard (radial calendar, month drill-down, draw-to-predict 2026).

The narrative is from [Argsweet/Delhi-Air](https://github.com/Argsweet/Delhi-Air). The AQI dashboard is embedded **after the Active Fire Counts (VIIRS) chart** — scroll past the peak-window visualization to explore monthly sensor data.

## Quick start

```bash
python3 scripts/build_aqi_data.py   # optional — rebuild JSON from CSVs
python3 -m http.server 8080
```

Open **http://localhost:8080** (serves from repo root — combined narrative + dashboard).

Standalone dashboard only: `cd delhi-dashboard && python3 -m http.server 8080`

## GitHub Pages

**Live:** [https://shreybe.github.io/Dehli-AQI/](https://shreybe.github.io/Dehli-AQI/)

1. Go to **[Settings → Pages](https://github.com/shreybe/Dehli-AQI/settings/pages)**
2. Set **Source** to **GitHub Actions** (not “Deploy from a branch”)
3. After each push, check the **Actions** tab — workflow must be green
4. Hard-refresh the site (Cmd+Shift+R)
