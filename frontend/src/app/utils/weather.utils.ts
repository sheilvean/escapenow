export function weatherIcon(conditionKey: string): string {
  switch (conditionKey) {
    case 'Sunny':
      return '☀️';
    case 'PartlyCloudy':
      return '⛅';
    case 'Cloudy':
      return '☁️';
    case 'Fog':
      return '🌫️';
    case 'Drizzle':
      return '🌦️';
    case 'Rain':
    case 'HeavyRain':
      return '🌧️';
    case 'Snow':
      return '❄️';
    case 'Thunderstorm':
      return '⛈️';
    default:
      return '🌤️';
  }
}

export function scoreLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Great';
  if (score >= 55) return 'Good';
  return 'Fair';
}

export function formatDay(dateIso: string): string {
  const date = new Date(dateIso + 'T12:00:00');
  return date.toLocaleDateString('en-GB', { weekday: 'long' });
}

export function formatShortDate(dateIso: string): string {
  const date = new Date(dateIso + 'T12:00:00');
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
