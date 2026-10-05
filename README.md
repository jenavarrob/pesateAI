# Weigh IT FastAPI proof of concept

This is a small clickable MVP for human weight tracking and scenario modeling. It keeps the existing legacy files untouched.

## Run

```powershell
cd fastapi_poc
py -m pip install -r requirements.txt
py -m uvicorn main:app --reload
```

Open http://127.0.0.1:8000.

## Current scope

- Personal inputs: sex, age, height, starting weight, starting fat percentage, intake, PAL, horizon, and intervention values.
- Two history plots: energy intake/PAL and weight/fat/fat-free mass.
- A simple two-compartment projection model with a baseline-to-intervention ramp.
- Spanish is the default language; the top-right `EN`/`ES` button switches between Spanish and English and remembers the choice.
- Local registration and login with salted PBKDF2 password hashes and HttpOnly session cookies.
- Per-user persistence in `data/users.sqlite` for timeline settings, measured weight, food energy intake, and physical activity.

## Simple architecture

- `main.py`: FastAPI shell and static/template serving.
- `static/human-app.js`: input handling, localization, chart rendering, and browser interaction.
- `static/human-model.js`: pure projection calculation, kept separate from DOM handling.
- `templates/human.html` and `static/human.css`: responsive web UI.

## User data

`data/users.sqlite` is created automatically when FastAPI starts. Do not commit or distribute this file because it contains account and personal tracking data. Every new account begins without weight, food, or activity entries. Subsequent changes are synchronized from the browser to the signed-in user record.

The session cookie is configured for local HTTP development. Before an internet deployment, enable HTTPS and change the cookie configuration to `secure=True`.

The model is an MVP approximation for exploration, not medical advice. The next agent slice should connect the equations and defaults to the legacy documentation and add automated tests around `calculateProjection`.

## Next agile slice

Read the legacy manual and source assets, map each old screen/control to a route or component, and replace the simulated reading with the real device/domain adapter.
