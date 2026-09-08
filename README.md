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

Layers follow the template structure: **Domain** (scoring rules), **Application** (services & ports), **Infrastructure** (HTTP weather client), **Api** (endpoints).

## City Break Score

Simple 0–100 score (no ML):

- Base: 50
- Bonus: ideal temperature (18–26°C), sunny/partly cloudy, low rain
- Penalty: storms, heavy rain, extreme temperatures

## Included cities

Barcelona, Lisbon, Rome, Madrid, Valencia, Nice, Athens, Budapest, Prague, Vienna, Amsterdam, Copenhagen

## Future features (UI placeholders only)

- **Check flights** — Coming soon
- **Generate weekend plan** — Coming soon
- **Save this trip** — Coming soon

## Checks

```bash
node tools/repo.mjs check
```
