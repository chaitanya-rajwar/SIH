# Burn-In Component Screening Dashboard

## Run it

```bash
npm install
npm run dev
```

Then open the local URL Vite prints (usually http://localhost:5173).

## What's inside

- `src/App.jsx` — the full dashboard (mock data, upload flow, risk gauge, trend chart, explanations)
- Mock data lives at the top of `App.jsx` in `RAW_COMPONENTS`. Replace it with the real
  backend response later — same shape: `id`, `values` (current in µA at each checkpoint
  hour), `score`, optional `reasons`.
vercel link - https://burnin-dashboard-rnikka4jh-chaitanya-rajwars-projects.vercel.app/
