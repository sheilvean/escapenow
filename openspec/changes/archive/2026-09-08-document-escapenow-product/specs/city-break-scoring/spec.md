## Purpose

Gives a last-minute city break a numeric score and short, preference-aware reasons so ranking
and the destination page can explain why a place is (or is not) worth going now.

## ADDED Requirements

### Requirement: Score is a clamped integer on a 0–100 scale

The system SHALL compute a city-break score as an integer from 0 to 100 inclusive. The score SHALL
start at 50 and then apply bonuses and penalties for temperature, dominant weather, and rain
probability. The result SHALL be clamped so it cannot leave that range.

#### Scenario: Ideal late-summer walking weather scores near the top
- **WHEN** the average temperature is about 22°C, the dominant condition is sunny, and the average
  rain probability is about 10%, with no temperature or weather preference
- **THEN** the score is between 85 and 100

#### Scenario: Storms pull the score down
- **WHEN** the average temperature is about 22°C, the dominant condition is thunderstorms, and the
  average rain probability is about 80%, with no temperature or weather preference
- **THEN** the score is below 60

#### Scenario: Extremes cannot leave the scale
- **WHEN** bonuses and penalties would otherwise produce a value below 0 or above 100
- **THEN** the returned score is 0 or 100 respectively

### Requirement: Preferences change the score relative to an unspecified preference

The system SHALL accept a temperature preference of warm, mild, or unspecified, and a weather
preference of mostly sunny, low rain, or unspecified. A warm or mild preference SHALL raise the
score when the average temperature matches that band and SHALL lower it when it does not, relative
to an unspecified temperature preference. A mostly-sunny or low-rain preference SHALL raise the
score when the forecast matches that priority and SHALL lower it when it does not, relative to an
unspecified weather preference.

#### Scenario: Warm preference rewards warmer forecasts
- **WHEN** two otherwise identical forecasts are scored, one with a warm preference and one with
  an unspecified temperature preference, and the average temperature is at least 20°C and inside
  18–26°C
- **THEN** the warm-preference score is higher

#### Scenario: Low-rain preference punishes wet forecasts more
- **WHEN** two otherwise identical forecasts are scored, one with a low-rain preference and one
  with an unspecified weather preference, and the average rain probability is at least 60%
- **THEN** the low-rain score is lower

### Requirement: A short recommendation sentence follows the score

The system SHALL produce a single recommendation sentence from the score, the dominant condition,
the average temperature, and the average rain probability. A score of 85 or above SHALL describe
the trip as ideal for a spontaneous weekend. A score of 70 or above and below 85 SHALL describe
comfortable walking weather. Remaining cases SHALL mention rain, cooler days, mixed skies, or a
generic solid pick, according to the forecast.

#### Scenario: A high score uses the ideal-weekend wording
- **WHEN** the score is 85 or above
- **THEN** the recommendation states that conditions are warm, sunny and ideal for a spontaneous
  weekend escape

### Requirement: “Why go now?” is at most three reasons

The system SHALL produce a list of at most three reasons from the daily forecast. Reasons SHALL
mention sunny or clear spells when enough days are sunny or partly cloudy, comfortable or mild
temperatures when the average is high enough, and low rain when the wettest day stays below the
documented thresholds. When none of those highlights apply, the system SHALL still return two
generic reasons so the list is never empty.

#### Scenario: Sunny comfortable days produce weather reasons
- **WHEN** three forecast days are mostly sunny or partly cloudy with average temperatures in
  18–26°C and rain probabilities around 10%
- **THEN** the reasons mention sunny weather and comfortable temperature, and contain at most
  three items

#### Scenario: A dull forecast still has reasons
- **WHEN** no day meets the sunny, temperature, or low-rain highlight rules
- **THEN** the list still contains two generic reasons and no more than three items
