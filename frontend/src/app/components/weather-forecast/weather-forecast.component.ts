import { Component, Input } from '@angular/core';
import { WeatherForecastDay } from '../../models/destination.models';
import { WeatherDayCardComponent } from '../weather-day-card/weather-day-card.component';

@Component({
  selector: 'app-weather-forecast',
  standalone: true,
  imports: [WeatherDayCardComponent],
  template: `
    <section class="forecast">
      <h2>7-day weather forecast</h2>
      <div class="forecast__grid">
        @for (day of forecast; track day.date) {
          <app-weather-day-card [day]="day" />
        }
      </div>
    </section>
  `,
  styles: [`
    .forecast h2 {
      margin: 0 0 1.25rem;
      font-size: 1.5rem;
      color: #0f172a;
    }

    .forecast__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 1rem;
    }
  `]
})
export class WeatherForecastComponent {
  @Input({ required: true }) forecast!: WeatherForecastDay[];
}
