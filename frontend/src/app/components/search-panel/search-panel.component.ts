import { Component, EventEmitter, Output, signal } from '@angular/core';
import {
  DeparturePeriod,
  SearchPreferences,
  TemperaturePreference,
  WeatherPreference
} from '../../models/destination.models';

@Component({
  selector: 'app-search-panel',
  standalone: true,
  imports: [],
  template: `
    <section class="search-panel">
      <div class="search-panel__group">
        <h3>Departure period</h3>
        <div class="chip-row">
          @for (option of departureOptions; track option.value) {
            <button
              type="button"
              class="chip"
              [class.chip--active]="departurePeriod() === option.value"
              (click)="departurePeriod.set(option.value)">
              {{ option.label }}
            </button>
          }
        </div>
      </div>

      <div class="search-panel__grid">
        <div class="search-panel__group">
          <h3>Temperature</h3>
          <div class="chip-row">
            @for (option of temperatureOptions; track option.value) {
              <button
                type="button"
                class="chip"
                [class.chip--active]="temperaturePreference() === option.value"
                (click)="temperaturePreference.set(option.value)">
                {{ option.label }}
              </button>
            }
          </div>
        </div>

        <div class="search-panel__group">
          <h3>Weather priority</h3>
          <div class="chip-row">
            @for (option of weatherOptions; track option.value) {
              <button
                type="button"
                class="chip"
                [class.chip--active]="weatherPreference() === option.value"
                (click)="weatherPreference.set(option.value)">
                {{ option.label }}
              </button>
            }
          </div>
        </div>
      </div>

      <button type="button" class="cta" (click)="onSearch()">
        Find my city break
      </button>
    </section>
  `,
  styles: [`
    .search-panel {
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 1.5rem;
      padding: 1.5rem;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
    }

    .search-panel__grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1.25rem;
      margin-top: 1.25rem;
    }

    .search-panel__group h3 {
      margin: 0 0 0.75rem;
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #64748b;
      font-weight: 700;
    }

    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .chip {
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      color: #334155;
      border-radius: 999px;
      padding: 0.55rem 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .chip:hover {
      border-color: #99f6e4;
      background: #f0fdfa;
    }

    .chip--active {
      background: linear-gradient(135deg, #0ea5e9, #14b8a6);
      border-color: transparent;
      color: white;
      box-shadow: 0 8px 20px rgba(14, 165, 233, 0.25);
    }

    .cta {
      margin-top: 1.5rem;
      width: 100%;
      border: none;
      border-radius: 999px;
      padding: 1rem 1.5rem;
      font-size: 1rem;
      font-weight: 700;
      color: white;
      cursor: pointer;
      background: linear-gradient(135deg, #0284c7, #0d9488);
      box-shadow: 0 16px 30px rgba(2, 132, 199, 0.3);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .cta:hover {
      transform: translateY(-2px);
      box-shadow: 0 20px 35px rgba(2, 132, 199, 0.35);
    }

    @media (max-width: 768px) {
      .search-panel__grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class SearchPanelComponent {
  @Output() search = new EventEmitter<SearchPreferences>();

  protected readonly departurePeriod = signal<DeparturePeriod>('any-time-this-week');
  protected readonly temperaturePreference = signal<TemperaturePreference>('any');
  protected readonly weatherPreference = signal<WeatherPreference>('any');

  protected readonly departureOptions = [
    { value: 'next-weekend' as DeparturePeriod, label: 'Next weekend' },
    { value: 'in-3-4-days' as DeparturePeriod, label: 'In 3–4 days' },
    { value: 'any-time-this-week' as DeparturePeriod, label: 'Any time this week' }
  ];

  protected readonly temperatureOptions = [
    { value: 'warm' as TemperaturePreference, label: 'Warm' },
    { value: 'mild' as TemperaturePreference, label: 'Mild' },
    { value: 'any' as TemperaturePreference, label: "Doesn't matter" }
  ];

  protected readonly weatherOptions = [
    { value: 'sunny' as WeatherPreference, label: 'Mostly sunny' },
    { value: 'lowrain' as WeatherPreference, label: 'Low chance of rain' },
    { value: 'any' as WeatherPreference, label: "Doesn't matter" }
  ];

  protected onSearch(): void {
    this.search.emit({
      departurePeriod: this.departurePeriod(),
      temperaturePreference: this.temperaturePreference(),
      weatherPreference: this.weatherPreference()
    });
  }
}
