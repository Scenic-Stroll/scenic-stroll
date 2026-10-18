# Multimodal evaluation — 2026-10-18

Live answers from the `plan-trip` Edge Function, run at about 22:40 HK. Car/taxi times are **Google Routes with
live traffic** (future 08:30 / 18:00 runs use Google's traffic forecast). Walking rows are empty for the longer
trips because OpenRouteService walking was down during this run; public transport is our MTR planner (ride times estimated from distance; the
"now" run uses live MTR Next Train departures). Taxi = official urban meter, tolls not included. CO₂ =
estimates (DECISIONS D31–D34). "Rush hour (simulated)" = the demo switch: driving × 2.5.

## Kowloon Tong Exit A1 → CityU MMW

**Leaving now** — Walk is 2 min slower than a car and saves ~390 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | 9 min | free | 0 g | 9 min | Walk · Fastest · green nudge |
| MTR | – | – | – | – | No public transport option beats walking here |
| Car | 7 min | – | 390 g | < 1 min | Car via Cornwall St |
| Taxi | 10 min | HK$33–33 | 390 g | < 1 min | Taxi via Cornwall St |

**Leaving 2026-10-19 08:30** — Walk is as quick as (or quicker than) a car and saves ~390 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | 9 min | free | 0 g | 9 min | Walk · Fastest · green nudge |
| MTR | – | – | – | – | No public transport option beats walking here |
| Car | 9 min | – | 390 g | < 1 min | Car via Cornwall St |
| Taxi | 12 min | HK$33–35 | 390 g | < 1 min | Taxi via Cornwall St |

**Leaving 2026-10-19 18:00** — Walk is as quick as (or quicker than) a car and saves ~390 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | 9 min | free | 0 g | 9 min | Walk · Fastest · green nudge |
| MTR | – | – | – | – | No public transport option beats walking here |
| Car | 10 min | – | 390 g | < 1 min | Car via Cornwall St |
| Taxi | 13 min | HK$33–35 | 390 g | < 1 min | Taxi via Cornwall St |

**2026-10-19 18:00, rush hour (simulated)** — Walk is as quick as (or quicker than) a car and saves ~390 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | 9 min | free | 0 g | 9 min | Walk · Fastest · green nudge |
| MTR | – | – | – | – | No public transport option beats walking here |
| Car | 24 min | – | 390 g | < 1 min | Car via Cornwall St · simulated jam |
| Taxi | 27 min | HK$50–65 | 390 g | < 1 min | Taxi via Cornwall St · simulated jam |

## CityU → Mong Kok

**Leaving now** — MTR is 1 min slower than a car and saves ~322 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | – | – | – | – | No walking route found right now |
| MTR | 11 min | HK$6.0 | 140 g | 4 min | Kwun Tong Line · green nudge · live MTR departure |
| Car | 10 min | – | 462 g | < 1 min | Car via Nathan Rd |
| Taxi | 13 min | HK$40–40 | 462 g | < 1 min | Taxi via Nathan Rd |

**Leaving 2026-10-19 08:30** — MTR is 2 min slower than a car and saves ~323 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | – | – | – | – | No walking route found right now |
| MTR | 13 min | HK$6.0 | 140 g | 4 min | Kwun Tong Line · green nudge |
| Car | 12 min | – | 463 g | < 1 min | Car via Nathan Rd |
| Taxi | 15 min | HK$40–42 | 463 g | < 1 min | Taxi via Nathan Rd |

**Leaving 2026-10-19 18:00** — MTR is as quick as (or quicker than) a car and saves ~323 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | – | – | – | – | No walking route found right now |
| MTR | 10 min | HK$6.0 | 140 g | 4 min | Kwun Tong Line · green nudge |
| Car | 12 min | – | 463 g | < 1 min | Car via Nathan Rd |
| Taxi | 15 min | HK$40–42 | 463 g | < 1 min | Taxi via Nathan Rd |

**2026-10-19 18:00, rush hour (simulated)** — MTR is as quick as (or quicker than) a car and saves ~323 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | – | – | – | – | No walking route found right now |
| MTR | 10 min | HK$6.0 | 140 g | 4 min | Kwun Tong Line · green nudge |
| Car | 29 min | – | 463 g | < 1 min | Car via Nathan Rd · simulated jam |
| Taxi | 32 min | HK$58–77 | 463 g | < 1 min | Taxi via Nathan Rd · simulated jam |

## CityU → Tsim Sha Tsui

**Leaving now** — MTR is 14 min slower than a car and saves ~823 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | – | – | – | – | No walking route found right now |
| MTR | 28 min | HK$7.5 | 303 g | 12 min | East Rail Line → Tuen Ma Line · live MTR departure |
| Car | 14 min | – | 1126 g | < 1 min | Car via Route 1 |
| Taxi | 17 min | HK$82–82 | 1126 g | < 1 min | Taxi via Route 1 |

**Leaving 2026-10-19 08:30** — MTR is 3 min slower than a car and saves ~853 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | – | – | – | – | No walking route found right now |
| MTR | 27 min | HK$7.5 | 273 g | 4 min | Kwun Tong Line → Tsuen Wan Line · green nudge |
| Car | 24 min | – | 1126 g | < 1 min | Car via Route 1 |
| Taxi | 27 min | HK$82–103 | 1126 g | < 1 min | Taxi via Route 1 |

**Leaving 2026-10-19 18:00** — MTR is 7 min slower than a car and saves ~853 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | – | – | – | – | No walking route found right now |
| MTR | 24 min | HK$7.5 | 273 g | 4 min | Kwun Tong Line → Tsuen Wan Line |
| Car | 17 min | – | 1126 g | < 1 min | Car via Route 1 |
| Taxi | 20 min | HK$82–88 | 1126 g | < 1 min | Taxi via Route 1 |

**2026-10-19 18:00, rush hour (simulated)** — MTR is as quick as (or quicker than) a car and saves ~853 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | – | – | – | – | No walking route found right now |
| MTR | 24 min | HK$7.5 | 273 g | 4 min | Kwun Tong Line → Tsuen Wan Line · green nudge |
| Car | 43 min | – | 1126 g | < 1 min | Car via Route 1 · simulated jam |
| Taxi | 46 min | HK$107–125 | 1126 g | < 1 min | Taxi via Route 1 · simulated jam |

## CityU → HKU

**Leaving now** — MTR is 16 min slower than a car and saves ~1524 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | – | – | – | – | No walking route found right now |
| MTR | 38 min | HK$16.0 | 656 g | 11 min | East Rail Line → Island Line · live MTR departure |
| Car | 22 min | – | 2180 g | < 1 min | Car via Route 1 |
| Taxi | 25 min | HK$133–133 | 2180 g | < 1 min | Taxi via Route 1 |

**Leaving 2026-10-19 08:30** — MTR is 5 min slower than a car and saves ~1196 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | – | – | – | – | No walking route found right now |
| MTR | 41 min | HK$16.0 | 656 g | 11 min | East Rail Line → Island Line · green nudge |
| Car | 36 min | – | 1852 g | < 1 min | Car via Route 3 |
| Taxi | 39 min | HK$119–133 | 1852 g | < 1 min | Taxi via Route 3 |

**Leaving 2026-10-19 18:00** — MTR is 10 min slower than a car and saves ~2139 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | – | – | – | – | No walking route found right now |
| MTR | 38 min | HK$16.0 | 656 g | 11 min | East Rail Line → Island Line |
| Car | 29 min | – | 2795 g | < 1 min | Car via Route 3 |
| Taxi | 32 min | HK$159–161 | 2795 g | < 1 min | Taxi via Route 3 |

**2026-10-19 18:00, rush hour (simulated)** — MTR is as quick as (or quicker than) a car and saves ~2139 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | – | – | – | – | No walking route found right now |
| MTR | 38 min | HK$16.0 | 656 g | 11 min | East Rail Line → Island Line · green nudge |
| Car | 1 h 11 min | – | 2795 g | < 1 min | Car via Route 3 · simulated jam |
| Taxi | 1 h 14 min | HK$189–219 | 2795 g | < 1 min | Taxi via Route 3 · simulated jam |

## CityU → CUHK

**Leaving now** — MTR is 22 min slower than a car and saves ~1760 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | – | – | – | – | No walking route found right now |
| MTR | 42 min | HK$8.5 | 563 g | 23 min | East Rail Line |
| Car | 20 min | – | 2323 g | < 1 min | Car via Route 1 |
| Taxi | 23 min | HK$139–139 | 2323 g | < 1 min | Taxi via Route 1 |

**Leaving 2026-10-19 08:30** — MTR is 18 min slower than a car and saves ~1760 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | – | – | – | – | No walking route found right now |
| MTR | 40 min | HK$8.5 | 563 g | 23 min | East Rail Line |
| Car | 22 min | – | 2323 g | < 1 min | Car via Route 1 |
| Taxi | 25 min | HK$139–140 | 2323 g | < 1 min | Taxi via Route 1 |

**Leaving 2026-10-19 18:00** — MTR is 15 min slower than a car and saves ~1760 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | – | – | – | – | No walking route found right now |
| MTR | 40 min | HK$8.5 | 563 g | 23 min | East Rail Line |
| Car | 26 min | – | 2323 g | < 1 min | Car via Route 1 |
| Taxi | 29 min | HK$139–146 | 2323 g | < 1 min | Taxi via Route 1 |

**2026-10-19 18:00, rush hour (simulated)** — MTR is as quick as (or quicker than) a car and saves ~1760 g CO₂

| Mode | Best time | Cost | CO₂ | Walking | Notes |
|---|---|---|---|---|---|
| Walk | – | – | – | – | No walking route found right now |
| MTR | 40 min | HK$8.5 | 563 g | 23 min | East Rail Line · green nudge |
| Car | 1 h 5 min | – | 2323 g | < 1 min | Car via Route 1 · simulated jam |
| Taxi | 1 h 8 min | HK$167–194 | 2323 g | < 1 min | Taxi via Route 1 · simulated jam |

## For the pitch deck

- Kowloon Tong Exit A1 → CityU MMW, 18:00 in a jam: Walk is as quick as (or quicker than) a car and saves ~390 g CO₂
- CityU → Mong Kok, 18:00 in a jam: MTR is as quick as (or quicker than) a car and saves ~323 g CO₂
- CityU → Tsim Sha Tsui, 18:00 in a jam: MTR is as quick as (or quicker than) a car and saves ~853 g CO₂
- CityU → HKU, 18:00 in a jam: MTR is as quick as (or quicker than) a car and saves ~2139 g CO₂
- CityU → CUHK, 18:00 in a jam: MTR is as quick as (or quicker than) a car and saves ~1760 g CO₂
