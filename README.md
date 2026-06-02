# Dehli-AQI

**The Smoke That Stays** — interactive Delhi air quality dashboard (radial calendar, month drill-down, draw-to-predict).

## Quick start

```bash
python3 scripts/build_aqi_data.py
python3 -m http.server 8080
```

Open **http://localhost:8080** (serves from repo root).

## GitHub Pages

**Live:** [https://shreybe.github.io/Dehli-AQI/](https://shreybe.github.io/Dehli-AQI/)

1. Go to **[Settings → Pages](https://github.com/shreybe/Dehli-AQI/settings/pages)**
2. Set **Source** to **GitHub Actions** (not “Deploy from a branch”)
3. After each push, check the **Actions** tab — workflow must be green
4. Hard-refresh the site (Cmd+Shift+R)

If you still see the old Raj/smoke-tunnel site, Pages is using branch deploy on `/` — switch to **GitHub Actions**.
