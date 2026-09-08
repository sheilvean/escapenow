export interface DestinationRecommendation {
  id: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  averageTemperature: number;
  rainProbability: number;
  weatherCondition: string;
  weatherConditionKey: string;
  score: number;
  recommendation: string;
  imageUrl: string;
}

export interface WeatherForecastDay {
  date: string;
  minTemperature: number;
  maxTemperature: number;
  rainProbability: number;
  condition: string;
  conditionKey: string;
}

export interface DestinationDetail {
  id: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  score: number;
  recommendation: string;
  imageUrl: string;
  forecast: WeatherForecastDay[];
  reasons: string[];
}

export type DeparturePeriod = 'next-weekend' | 'in-3-4-days' | 'any-time-this-week';
export type TemperaturePreference = 'warm' | 'mild' | 'any';
export type WeatherPreference = 'sunny' | 'lowrain' | 'any';

export interface SearchPreferences {
  departurePeriod: DeparturePeriod;
  temperaturePreference: TemperaturePreference;
  weatherPreference: WeatherPreference;
}
