# EscapeNow

A demo portfolio application for planning **last-minute European city breaks** based on live weather forecasts.

**EscapeNow** answers one question: *Where should I go in Europe for a city break in the next 7 days?*

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Angular 19, TypeScript, standalone components, HttpClient |
| Backend | ASP.NET Core Web API (.NET 10) |
| Weather data | [Open-Meteo](https://open-meteo.com/) (free, no API key) |

## Quick start

### 1. Backend API

```bash
dotnet run --project src/EscapeNow.Api/EscapeNow.Api.csproj
```

API: `http://localhost:5180`

### 2. Frontend

```bash
cd frontend
npm install
npm start
```

App: `http://localhost:4200`

## Routes

| Route | Description |
| --- | --- |
| `/discover` | Search preferences and top 5 destination recommendations |
| `/destination/:city` | 7-day forecast, score, and “Why go now?” reasons |

## API endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/destinations/recommendations` | Ranked destinations (query: `startDate`, `endDate`, `temperaturePreference`, `weatherPreference`) |
| `GET` | `/api/destinations/{city}` | Destination detail with 7-day forecast |

## Architecture

```
Angular UI  →  EscapeNow.Api  →  Open-Meteo
                  ├── DestinationRecommendationService (scoring & ranking)
                  └── OpenMeteoWeatherService (forecast fetch)
```

Four layers: **Domain** (scoring rules), **Application** (orchestration and ports),
**Infrastructure** (the HTTP weather client), **Api** (composition and endpoints). The dependency
direction is enforced by tests — see `docs/ARCHITECTURE.md`.

## City Break Score

Simple 0–100 score (no ML):

- Base: 50
- Bonus: ideal temperature (18–26°C), sunny/partly cloudy, low rain
- Penalty: storms, heavy rain, extreme temperatures

## Included cities

Barcelona, Lisbon, Rome, Madrid, Valencia, Nice, Athens, Budapest, Prague, Vienna, Amsterdam, Copenhagen

The `/discover` and `/destination/:city` screens also show non-functional "Check flights",
"Generate weekend plan" and "Save this trip" buttons. They are deliberate placeholders with no
backend behind them.

## Checks

```bash
node tools/repo.mjs check
```

Ten stages, in order. `passed`, `failed` and `not-configured` are three different outcomes; a
stage that executed zero tests fails. `CONTRIBUTING.md` has the change workflow.
