## Purpose

Stores the European city catalog as rows an unauthenticated operator can list, create, update and
delete, seeding the current twelve cities only when the table is empty.

## ADDED Requirements

### Requirement: Each city has a UUID identity

Every city SHALL have a UUID that is assigned when the city is created and SHALL NOT change. Public
routes and city HTTP resources SHALL identify a city by that UUID, not by its name. The name SHALL
be unique among cities, compared without regard to case, and SHALL be a display field only.

#### Scenario: Two cities cannot share a name
- **WHEN** an operator creates or updates a city using a name that another city already has,
  ignoring case
- **THEN** the change is rejected and no second city with that name exists

#### Scenario: Lookup is by UUID
- **WHEN** a client requests a city or destination with a UUID that exists
- **THEN** that city is returned, even if its display name has been changed since creation

#### Scenario: An unknown UUID is not a city
- **WHEN** a client requests a city with a UUID that is not in the catalog
- **THEN** the system does not return a city for that identifier

### Requirement: The twelve current catalog cities are the empty-table seed

When the city store contains no rows, the system SHALL insert the twelve cities that the in-process
catalog currently names (Barcelona, Lisbon, Rome, Madrid, Valencia, Nice, Athens, Budapest, Prague,
Vienna, Amsterdam, Copenhagen), each with its present country, coordinates, and image URL, and each
with a stable UUID that does not change across empty-table seeds. When any city row already exists,
the system SHALL NOT insert those seed rows again and SHALL NOT reset operator edits.

#### Scenario: First start seeds twelve cities
- **WHEN** the city store is empty and the application starts
- **THEN** exactly those twelve cities are present, each with a UUID

#### Scenario: A later start does not wipe edits
- **WHEN** an operator has added, changed, or removed cities and the application starts again
- **THEN** the store still reflects those edits and the seed is not re-applied

### Requirement: Unauthenticated operators can manage the full catalog

The system SHALL expose HTTP resources to list all cities, create a city, retrieve one city by
UUID, replace one city by UUID, and delete one city by UUID. Those resources SHALL NOT require
authentication. Create and replace SHALL require a non-empty name, country, image URL, and
coordinates within valid latitude and longitude ranges. Delete SHALL remove the city. An empty
catalog SHALL be allowed.

#### Scenario: Listing returns every stored city
- **WHEN** a client lists cities
- **THEN** the response includes every city currently in the store, each with its UUID and display
  fields

#### Scenario: A city can be added
- **WHEN** an operator submits a valid new city
- **THEN** the city is stored with a new UUID and appears in the list

#### Scenario: A city can be changed
- **WHEN** an operator replaces a city by UUID with valid fields
- **THEN** later reads of that UUID return the new fields and the UUID is unchanged

#### Scenario: A city can be removed
- **WHEN** an operator deletes a city by UUID
- **THEN** that UUID is no longer a city and recommendations no longer include it

#### Scenario: No credential is required
- **WHEN** a client calls any city-management resource without authentication
- **THEN** the request is authorised the same as any other public API call in this application
