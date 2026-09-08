## MODIFIED Requirements

### Requirement: Discover and destination routes

The application SHALL offer a discover route at `/discover`, a destination route at
`/destination/:id` where `:id` is the city’s UUID, and a configuration route at `/config`. The
empty path SHALL redirect to discover. Any other unknown path SHALL redirect to discover.

#### Scenario: The home path lands on discover
- **WHEN** a visitor opens `/`
- **THEN** they are taken to `/discover`

#### Scenario: An unknown path lands on discover
- **WHEN** a visitor opens a path that is not discover, destination-detail, or configuration
- **THEN** they are taken to `/discover`

#### Scenario: Destination uses the city UUID
- **WHEN** a visitor opens a destination from a recommendation
- **THEN** the path contains that city’s UUID, not its display name

### Requirement: Destination detail shows forecast and reasons

The destination page SHALL load detail for the UUID in the path, for today through six days later.
It SHALL show the city name, country, score, recommendation sentence, daily forecast, and “why go
now?” reasons. When the city is missing or the request fails, it SHALL say the destination was not
found and offer a way back to discover.

#### Scenario: A known city shows forecast and reasons
- **WHEN** the visitor opens `/destination/{id}` for a catalog UUID and the API returns detail
- **THEN** the page shows the score, recommendation, forecast days, and reasons

#### Scenario: A missing city offers a way back
- **WHEN** the detail request fails
- **THEN** the page reports that the destination was not found and links to discover

## ADDED Requirements

### Requirement: A configuration page manages the city catalog

The application SHALL offer `/config` for listing cities and for creating, editing, and deleting
them, without signing in. The navigation SHALL include a way to open that page. The page SHALL
use the city-management HTTP resources. After a successful change, the listed catalog SHALL
reflect the store.

#### Scenario: An operator can open configuration
- **WHEN** a visitor follows the configuration link in the navigation
- **THEN** they reach `/config` without providing credentials

#### Scenario: An operator can add a city
- **WHEN** the visitor submits a valid new city on the configuration page
- **THEN** the city appears in the configuration list

#### Scenario: An operator can remove a city
- **WHEN** the visitor deletes a city on the configuration page
- **THEN** that city is absent from the configuration list
