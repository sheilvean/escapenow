# EscapeNow

A demo portfolio application for planning **last-minute European city breaks** based on live weather forecasts.

**EscapeNow** answers one question: *Where should I go in Europe for a city break in the next 7 days?*

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Angular 21 (LTS), Vite build, Vitest, TypeScript, standalone components, HttpClient |
| Backend | ASP.NET Core Web API (.NET 10) |
| Persistence | PostgreSQL 18.6 from `compose.yaml`; city catalog via EF Core |
| Weather data | [Open-Meteo](https://open-meteo.com/) (free, no API key) |
| Local engine | [Rancher Desktop](https://rancherdesktop.io/) with the **dockerd (moby)** container engine |

## Quick start

### 1. PostgreSQL

Install [Rancher Desktop](https://rancherdesktop.io/), set **Container Engine** to **dockerd (moby)**,
then from the repository root:

```bash
docker compose up -d
```

That starts PostgreSQL 18.6 on `localhost:5432`. The published demo credential is user, database
and password `escapenow`. It is not a secret; do not reuse it for a hosted environment. Port 5432
must be free on the host — a Windows PostgreSQL service bound there will receive the connection
instead of the container.

### 2. Backend API

```bash
dotnet run --project src/EscapeNow.Api/EscapeNow.Api.csproj --launch-profile http
```

API: `http://localhost:5180`

### 3. Frontend

```bash
cd frontend
npm ci
npm start
```

App: `http://localhost:4200`

## Routes

| Route | Description |
| --- | --- |
| `/discover` | Search preferences and top 5 destination recommendations |
| `/destination/:id` | 7-day forecast, score, and “Why go now?” reasons (city UUID) |
| `/config` | Unauthenticated catalog editor: list, add, edit, delete cities |

## API endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/destinations/recommendations` | Ranked destinations (query: `startDate`, `endDate`, `temperaturePreference`, `weatherPreference`) |
| `GET` | `/api/destinations/{id}` | Destination detail with 7-day forecast (city UUID) |
| `GET` | `/api/cities` | List catalog cities |
| `POST` | `/api/cities` | Create a city |
| `GET` | `/api/cities/{id}` | Get a city by UUID |
| `PUT` | `/api/cities/{id}` | Replace a city by UUID |
| `DELETE` | `/api/cities/{id}` | Delete a city by UUID |

## Architecture

```
Angular UI  →  EscapeNow.Api  →  Open-Meteo
                  ├── CityCatalogService / DestinationRecommendationService
                  ├── EfCityCatalog (PostgreSQL)
                  └── OpenMeteoWeatherService (forecast fetch)
```

Four layers: **Domain** (scoring rules), **Application** (orchestration and ports),
**Infrastructure** (the HTTP weather client and EF city catalog), **Api** (composition and
endpoints). The dependency direction is enforced by tests — see `docs/ARCHITECTURE.md`.

## City Break Score

Simple 0–100 score (no ML):

- Base: 50
- Bonus: ideal temperature (18–26°C), sunny/partly cloudy, low rain
- Penalty: storms, heavy rain, extreme temperatures

## Included cities

The empty-table seed is Barcelona, Lisbon, Rome, Madrid, Valencia, Nice, Athens, Budapest, Prague,
Vienna, Amsterdam, Copenhagen. Operators can add, change, or remove cities on `/config`. Destination
pages are addressed by UUID, not by name.

The `/discover` and `/destination/:id` screens also show non-functional "Check flights",
"Generate weekend plan" and "Save this trip" buttons. They are deliberate placeholders with no
backend behind them.

## Checks

```bash
node tools/repo.mjs check
```

Every declared stage, in order — including `database` before `test:integration`. `passed`,
`failed` and `not-configured` are three different outcomes; a stage that executed zero tests
fails. A down Postgres fails `database` and names `docker compose up -d`. `CONTRIBUTING.md` has
the change workflow.
