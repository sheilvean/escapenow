## MODIFIED Requirements

### Requirement: A fixed catalog of twelve European cities

The system SHALL recommend from the stored city catalog. Each city SHALL have a UUID, a unique
display name, a country, latitude, longitude, and an image URL. Destination lookup SHALL use the
UUID. A UUID that is not in the catalog SHALL not be treated as a destination. After an empty-table
seed, the catalog SHALL contain the twelve cities previously listed in process; operators MAY then
add, change, or remove cities.

#### Scenario: Every listed city is addressable
- **WHEN** a destination is requested for each seed city's UUID
- **THEN** each UUID resolves to that city’s display name, country, and coordinates

#### Scenario: An unknown city is not a destination
- **WHEN** a destination is requested for a UUID that is not in the catalog
- **THEN** the system does not return a destination for that identifier

#### Scenario: A name is not a destination identifier
- **WHEN** a destination is requested using a city name where a UUID is required
- **THEN** the system does not treat that name as a catalog identity

### Requirement: Recommendations return the top five scored catalog cities

The system SHALL score every catalog city for the resolved date window using the city-break
scoring rule and the caller’s temperature and weather preferences. A city whose forecast is empty
SHALL be omitted. The response SHALL contain at most five cities, ordered by score descending.
Each recommendation SHALL include the city’s UUID. When the catalog is empty, the response SHALL
be an empty list.

#### Scenario: The list is capped and ordered
- **WHEN** more than five catalog cities have a non-empty forecast
- **THEN** the response contains exactly five cities, and each city’s score is greater than or
  equal to the next city’s score

#### Scenario: An empty forecast drops the city
- **WHEN** the provider returns no days for a city in the window
- **THEN** that city is absent from the recommendation list

#### Scenario: An empty catalog yields an empty list
- **WHEN** the catalog contains no cities and recommendations are requested
- **THEN** the response status is 200 and the body is an empty list

### Requirement: HTTP resources for recommendations and destination detail

The system SHALL expose `GET /api/destinations/recommendations` accepting optional `startDate`,
`endDate`, `temperaturePreference`, and `weatherPreference` query parameters, and SHALL return
HTTP 200 with the ranked list. Unrecognised preference values SHALL be treated as unspecified.
The system SHALL expose `GET /api/destinations/{id}` where `{id}` is the city’s UUID, accepting
optional `startDate` and `endDate`. An unknown UUID or an empty forecast SHALL return HTTP 404.
Destination detail SHALL include the UUID, the score, a recommendation sentence, the daily
forecast, and the “why go now?” reasons. Destination detail SHALL score with unspecified
temperature and weather preferences even when recommendation requests used other values.

#### Scenario: Recommendations succeed
- **WHEN** a client calls `GET /api/destinations/recommendations`
- **THEN** the response status is 200 and the body is the ranked list, each item carrying the
  city’s UUID

#### Scenario: Unknown preference values are unspecified
- **WHEN** `temperaturePreference` or `weatherPreference` is a value other than the documented
  warm, mild, sunny, mostly-sunny, low-rain forms
- **THEN** scoring uses unspecified preferences

#### Scenario: Unknown city is not found
- **WHEN** a client calls `GET /api/destinations/{id}` with a UUID absent from the catalog
- **THEN** the response status is 404

#### Scenario: Detail ignores search preferences
- **WHEN** destination detail is requested for a catalog city by UUID
- **THEN** the score is computed with unspecified temperature and weather preferences
