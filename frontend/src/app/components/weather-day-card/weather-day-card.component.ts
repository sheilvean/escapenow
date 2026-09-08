import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeatherForecastDay } from '../../models/destination.models';
import { formatDay, weatherIcon } from '../../utils/weather.utils';

@Component({
  selector: 'app-weather-day-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article class="day-card">
      <p class="day-card__day">{{ dayLabel }}</p>
      <span class="day-card__icon">{{ icon }}</span>
      <p class="day-card__temp">{{ day.minTemperature | number:'1.0-0' }}–{{ day.maxTemperature | number:'1.0-0' }}°C</p>
      <p class="day-card__condition">{{ day.condition }}</p>
      <p class="day-card__rain">{{ day.rainProbability }}% rain</p>
    </article>
  `,
  styles: [`
    .day-card {
      background: white;
      border-radius: 1.25rem;
      padding: 1rem;
      text-align: center;
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.06);
      border: 1px solid rgba(148, 163, 184, 0.15);
      transition: transform 0.2s ease;
    }

    .day-card:hover {
      transform: translateY(-4px);
    }

    .day-card__day {
      margin: 0;
      font-weight: 700;
      color: #0f172a;
    }

    .day-card__icon {
      display: block;
      font-size: 2rem;
      margin: 0.5rem 0;
    }

    .day-card__temp {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 800;
      color: #0284c7;
    }

    .day-card__condition {
      margin: 0.35rem 0 0;
      color: #475569;
      font-weight: 600;
      font-size: 0.9rem;
    }

    .day-card__rain {
      margin: 0.25rem 0 0;
      color: #64748b;
      font-size: 0.85rem;
    }
  `]
})
export class WeatherDayCardComponent {
  @Input({ required: true }) day!: WeatherForecastDay;

  protected get icon(): string {
    return weatherIcon(this.day.conditionKey);
  }

  protected get dayLabel(): string {
    return formatDay(this.day.date);
  }
}
