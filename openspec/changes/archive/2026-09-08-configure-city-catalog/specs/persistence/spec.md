## REMOVED Requirements

### Requirement: Persistence does not store product data yet
**Reason**: Cities become stored catalog rows; the previous rule forbade destination rows.
**Migration**: City rows are the catalog. Trips, searches, and user accounts remain unstored; the
save control stays a placeholder.

## ADDED Requirements

### Requirement: Cities are stored; trips and users are not

The system SHALL persist the city catalog in the configured PostgreSQL instance. It SHALL NOT
persist trips, searches, or user accounts. Activating the existing save control SHALL NOT write a
trip row.

#### Scenario: Recommendations read stored cities
- **WHEN** recommendations are requested
- **THEN** the scored set is the cities currently in the store, not a compile-time list

#### Scenario: Save still does not persist
- **WHEN** a visitor activates save on the destination page
- **THEN** no trip row is written and no save API is called
