## Purpose

Ranks a fixed catalog of European cities for a date window using live forecasts, and exposes
recommendation and destination-detail resources over HTTP.

## ADDED Requirements

### Requirement: A fixed catalog of twelve European cities

The system SHALL recommend from a closed catalog of Barcelona, Lisbon, Rome, Madrid, Valencia,
Nice, Athens, Budapest, Prague, Vienna, Amsterdam, and Copenhagen. Each city SHALL have a country,
latitude, longitude, and an image URL. City lookup SHALL be case-insensitive on the city name.
A name that is not in the catalog SHALL not be treated as a destination.

#### Scenario: Every listed city is addressable
- **WHEN** a destination is requested for each catalog city name, ignoring case
- **THEN** each name resolves to that city’s country and coordinates

#### Scenario: An unknown city is not a destination
- **WHEN** a destination is requested for a name that is not in the catalog
- **THEN** the system does not return a destination for that name

### Requirement: Forecasts come from an external provider without an API key

The system SHALL obtain a daily forecast for a city’s coordinates and an inclusive start and end
date from an external weather provider that does not require an API key. Each day SHALL include
minimum and maximum temperature, a rain probability, and a classified condition (sunny, partly
cloudy, cloudy, fog, drizzle, rain, heavy rain, snow, thunderstorm, or unknown). Transient
provider failures of “too many requests” or “service unavailable” SHALL be retried a bounded
number of times before the request fails.

#### Scenario: A successful forecast covers the requested window
- **WHEN** the provider returns daily rows for the requested start and end dates
- **THEN** the system exposes one day per returned date inside that window, with temperatures,
  rain probability, and a classified condition

#### Scenario: Transient provider failure is retried
- **WHEN** the provider responds with service unavailable or too many requests
- **THEN** the system retries a bounded number of times before failing the request

### Requirement: Recommendations return the top five scored catalog cities

The system SHALL score every catalog city for the resolved date window using the city-break
scoring rule and the caller’s temperature and weather preferences. A city whose forecast is empty
SHALL be omitted. The response SHALL contain at most five cities, ordered by score descending.

#### Scenario: The list is capped and ordered
- **WHEN** more than five catalog cities have a non-empty forecast
- **THEN** the response contains exactly five cities, and each city’s score is greater than or
  equal to the next city’s score

#### Scenario: An empty forecast drops the city
- **WHEN** the provider returns no days for a city in the window
- **THEN** that city is absent from the recommendation list

### Requirement: The recommendation date window has documented defaults

When both a start date and an end date are supplied, the system SHALL use that inclusive window.
When only a start date is supplied, the window SHALL be that date through two days later. When
neither is supplied, the window SHALL be the UTC calendar today through six days later.

#### Scenario: Both dates are honoured
- **WHEN** recommendations are requested with start date 2026-09-12 and end date 2026-09-14
- **THEN** forecasts are requested for that inclusive range

#### Scenario: Start date alone spans three days
- **WHEN** recommendations are requested with start date 2026-09-12 and no end date
- **THEN** the window is 2026-09-12 through 2026-09-14

#### Scenario: No dates default to seven days from today
- **WHEN** recommendations are requested with neither start nor end date
- **THEN** the window is the UTC calendar today through six days later

### Requirement: HTTP resources for recommendations and destination detail

The system SHALL expose `GET /api/destinations/recommendations` accepting optional `startDate`,
`endDate`, `temperaturePreference`, and `weatherPreference` query parameters, and SHALL return
HTTP 200 with the ranked list. Unrecognised preference values SHALL be treated as unspecified.
The system SHALL expose `GET /api/destinations/{city}` accepting optional `startDate` and
`endDate`. An unknown city or an empty forecast SHALL return HTTP 404. Destination detail SHALL
include the score, a recommendation sentence, the daily forecast, and the “why go now?” reasons.
Destination detail SHALL score with unspecified temperature and weather preferences even when
recommendation requests used other values.

#### Scenario: Recommendations succeed
- **WHEN** a client calls `GET /api/destinations/recommendations`
- **THEN** the response status is 200 and the body is the ranked list

#### Scenario: Unknown preference values are unspecified
- **WHEN** `temperaturePreference` or `weatherPreference` is a value other than the documented
  warm, mild, sunny, mostly-sunny, low-rain forms
- **THEN** scoring uses unspecified preferences

#### Scenario: Unknown city is not found
- **WHEN** a client calls `GET /api/destinations/{city}` with a name absent from the catalog
- **THEN** the response status is 404

#### Scenario: Detail ignores search preferences
- **WHEN** destination detail is requested for a catalog city
- **THEN** the score is computed with unspecified temperature and weather preferences
