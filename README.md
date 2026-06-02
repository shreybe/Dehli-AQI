# Dehli-AQI

**The Smoke That Stays** — interactive Delhi air quality dashboard.

## Quick start

```bash
python3 scripts/build_aqi_data.py
cd delhi-dashboard
python3 -m http.server 8080
```

Open **http://localhost:8080**

See [delhi-dashboard/README.md](delhi-dashboard/README.md) for full documentation.

## GitHub Pages

Settings → Pages → **GitHub Actions** (workflow deploys `delhi-dashboard/`)  
or **Deploy from branch** → `main` → `/delhi-dashboard`
