## Purpose

Lets a traveller pick a departure window and weather priorities, see ranked city breaks, and open
a destination page with the week’s forecast and reasons to go now.

## Requirements

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

### Requirement: Search preferences map onto the recommendation query

Discover SHALL let the visitor choose a departure period, a temperature preference, and a weather
priority, then request recommendations. “Any time this week” SHALL query today through six days
later. “In 3–4 days” SHALL query three days from today through four days from today. “Next
weekend” SHALL query the next Saturday through the following Sunday. Temperature choices SHALL be
warm, mild, or unspecified. Weather choices SHALL be mostly sunny, low rain, or unspecified.
Unspecified choices SHALL be omitted from the query string.

#### Scenario: Next weekend sends Saturday and Sunday
- **WHEN** the visitor selects next weekend and searches on a Wednesday
- **THEN** the recommendation request uses that week’s Saturday as start date and Sunday as end
  date

#### Scenario: Unspecified preferences are omitted
- **WHEN** temperature and weather are left as “doesn’t matter”
- **THEN** the recommendation request does not include `temperaturePreference` or
  `weatherPreference`

### Requirement: Discover shows loading, results, empty, and error states

Before the first search, discover SHALL show a prompt to search. While recommendations are loading,
it SHALL show a loading placeholder. On success with results, it SHALL list the ranked cities and
mark the first as the best match. On success with no cities, it SHALL say that no destinations were
found. On failure to reach the API, it SHALL show an error and a retry action that repeats the last
search.

#### Scenario: A failed request can be retried
- **WHEN** the recommendation request fails and the visitor activates retry
- **THEN** the last search preferences are sent again

#### Scenario: An empty list is distinguished from an error
- **WHEN** the API returns an empty list after a search
- **THEN** the page reports that no destinations were found and does not show the API-error copy

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

### Requirement: Flights, itinerary, and save are non-functional placeholders

Discover and destination detail SHALL show “check flights”, “generate weekend plan”, and “save this
trip” as coming-soon copy. Activating them SHALL NOT book travel, persist a trip, or call an API.
They SHALL NOT be described as working features.

#### Scenario: Save does not persist
- **WHEN** the visitor activates save on the destination page
- **THEN** no trip is stored and no API call is made to save it

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
