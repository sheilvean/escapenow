import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DestinationService } from '../../services/destination.service';
import { DestinationDetail } from '../../models/destination.models';
import { ScoreBadgeComponent } from '../../components/score-badge/score-badge.component';
import { WeatherForecastComponent } from '../../components/weather-forecast/weather-forecast.component';
import { LoadingSkeletonComponent } from '../../components/loading-skeleton/loading-skeleton.component';

@Component({
  selector: 'app-destination-details-page',
  standalone: true,
  imports: [
    RouterLink,
    ScoreBadgeComponent,
    WeatherForecastComponent,
    LoadingSkeletonComponent
  ],
  template: `
    @if (loading()) {
      <div class="page page--loading">
        <app-loading-skeleton />
      </div>
    } @else if (error()) {
      <div class="page page--error">
        <h1>Destination not found</h1>
        <p>{{ error() }}</p>
        <a routerLink="/discover">Back to discover</a>
      </div>
    } @else if (destination()) {
      <section class="hero" [style.backgroundImage]="'url(' + destination()!.imageUrl + ')'">
        <div class="hero__overlay"></div>
        <div class="hero__content">
          <a routerLink="/discover" class="back-link">← Back to discover</a>
          <h1>{{ destination()!.city }}</h1>
          <p>{{ destination()!.country }}</p>
          <app-score-badge [score]="destination()!.score" [highlight]="true" />
          <p class="hero__summary">{{ destination()!.recommendation }}</p>
        </div>
      </section>

      <div class="page">
        <app-weather-forecast [forecast]="destination()!.forecast" />

        <section class="why-now">
          <h2>Why go now?</h2>
          <ul>
            @for (reason of destination()!.reasons; track reason) {
              <li>{{ reason }}</li>
            }
          </ul>
        </section>

        <section class="actions">
          <button type="button" class="save-btn" (click)="showComingSoon()">Save this trip</button>
          <div class="future-features">
            <div>
              <strong>Check flights</strong>
              <span>Flight search — Coming soon</span>
            </div>
            <div>
              <strong>Generate weekend plan</strong>
              <span>Weekend itinerary — Coming soon</span>
            </div>
          </div>
        </section>

        @if (toast()) {
          <div class="toast">{{ toast() }}</div>
        }
      </div>
    }
  `,
  styles: [`
    .hero {
      position: relative;
      min-height: 420px;
      background-size: cover;
      background-position: center;
      display: flex;
      align-items: flex-end;
    }

    .hero__overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, rgba(15, 23, 42, 0.85), rgba(15, 23, 42, 0.2));
    }

    .hero__content {
      position: relative;
      z-index: 1;
      padding: 2rem 1.5rem 2.5rem;
      max-width: 1200px;
      margin: 0 auto;
      width: 100%;
      color: white;
    }

    .back-link {
      color: rgba(255, 255, 255, 0.85);
      text-decoration: none;
      font-weight: 600;
      display: inline-block;
      margin-bottom: 1rem;
    }

    .hero h1 {
      margin: 0;
      font-size: clamp(2.5rem, 6vw, 4rem);
    }

    .hero__content > p {
      margin: 0.35rem 0 1rem;
      font-size: 1.2rem;
      opacity: 0.9;
    }

    .hero__summary {
      max-width: 36rem;
      margin-top: 1rem;
      line-height: 1.6;
      font-size: 1.05rem;
    }

    .page {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
    }

    .page--loading,
    .page--error {
      padding-top: 2rem;
    }

    .page--error a {
      color: #0f766e;
      font-weight: 700;
      text-decoration: none;
    }

    .why-now {
      margin-top: 2.5rem;
      padding: 1.5rem;
      border-radius: 1.25rem;
      background: linear-gradient(135deg, #f0fdfa, #ecfeff);
      border: 1px solid rgba(45, 212, 191, 0.25);
    }

    .why-now h2 {
      margin: 0 0 1rem;
      color: #0f172a;
    }

    .why-now ul {
      margin: 0;
      padding-left: 1.2rem;
      color: #334155;
      line-height: 1.7;
      font-weight: 500;
    }

    .actions {
      margin-top: 2rem;
      display: grid;
      gap: 1rem;
    }

    .save-btn {
      border: none;
      border-radius: 999px;
      padding: 0.9rem 1.5rem;
      width: fit-content;
      background: linear-gradient(135deg, #0284c7, #0d9488);
      color: white;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 12px 25px rgba(2, 132, 199, 0.25);
    }

    .future-features {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
    }

    .future-features div {
      padding: 1rem 1.25rem;
      border-radius: 1rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      display: grid;
      gap: 0.25rem;
    }

    .future-features strong {
      color: #0f172a;
    }

    .future-features span {
      color: #64748b;
      font-size: 0.9rem;
      font-weight: 600;
    }

    .toast {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      background: #0f172a;
      color: white;
      padding: 0.85rem 1.25rem;
      border-radius: 0.75rem;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.25);
      animation: fadeUp 0.3s ease;
    }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 768px) {
      .future-features {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class DestinationDetailsPageComponent implements OnInit {
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly destination = signal<DestinationDetail | null>(null);
  protected readonly toast = signal<string | null>(null);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly destinationService: DestinationService
  ) {}

  ngOnInit(): void {
    const city = this.route.snapshot.paramMap.get('city');
    if (!city) {
      this.error.set('City was not provided.');
      this.loading.set(false);
      return;
    }

    this.destinationService.getDestination(city).subscribe({
      next: detail => {
        this.destination.set(detail);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('We could not find weather data for this destination.');
        this.loading.set(false);
      }
    });
  }

  protected showComingSoon(): void {
    this.toast.set('Save this trip — Coming soon');
    setTimeout(() => this.toast.set(null), 2500);
  }
}
