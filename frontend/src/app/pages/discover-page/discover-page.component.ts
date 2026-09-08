import { Component, signal } from '@angular/core';
import { SearchPanelComponent } from '../../components/search-panel/search-panel.component';
import { DestinationCardComponent } from '../../components/destination-card/destination-card.component';
import { LoadingSkeletonComponent } from '../../components/loading-skeleton/loading-skeleton.component';
import { DestinationService } from '../../services/destination.service';
import { DestinationRecommendation, SearchPreferences } from '../../models/destination.models';

@Component({
  selector: 'app-discover-page',
  standalone: true,
  imports: [
    SearchPanelComponent,
    DestinationCardComponent,
    LoadingSkeletonComponent
  ],
  template: `
    <section class="hero">
      <div class="hero__content">
        <p class="hero__eyebrow">Spontaneous European escapes</p>
        <h1>Where should you escape this week?</h1>
        <p class="hero__subtitle">
          Find the best European city break based on the weather for the next 7 days.
        </p>
        <app-search-panel (search)="onSearch($event)" />
      </div>
    </section>

    <section class="results">
      @if (loading()) {
        <app-loading-skeleton />
      } @else if (error()) {
        <div class="results__message results__message--error">
          <h2>Could not load recommendations</h2>
          <p>{{ error() }}</p>
          <button type="button" class="retry" (click)="retry()">Try again</button>
        </div>
      } @else if (hasSearched() && recommendations().length === 0) {
        <div class="results__message">
          <h2>No destinations found</h2>
          <p>Try adjusting your preferences and search again.</p>
        </div>
      } @else if (recommendations().length > 0) {
        <div class="results__header">
          <h2>Top picks for your escape</h2>
          <p>Ranked by weather, temperature and rain probability.</p>
        </div>
        <div class="results__grid">
          @for (destination of recommendations(); track destination.city; let i = $index) {
            <app-destination-card
              [destination]="destination"
              [isBestMatch]="i === 0"
              [style.animationDelay.ms]="i * 80" />
          }
        </div>
      } @else {
        <div class="results__placeholder">
          <h2>Your next adventure starts here</h2>
          <p>Tell us when you want to leave and we'll surface the sunniest European city breaks.</p>
        </div>
      }
    </section>

    <section class="coming-soon">
      <article class="coming-soon__card">
        <h3>Check flights</h3>
        <p>Flight search — Coming soon</p>
      </article>
      <article class="coming-soon__card">
        <h3>Weekend itinerary</h3>
        <p>Generate weekend plan — Coming soon</p>
      </article>
    </section>
  `,
  styles: [`
    .hero {
      padding: 2rem 1.5rem 3rem;
      background:
        radial-gradient(circle at top right, rgba(14, 165, 233, 0.15), transparent 45%),
        radial-gradient(circle at 20% 80%, rgba(20, 184, 166, 0.12), transparent 40%),
        linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
    }

    .hero__content {
      max-width: 760px;
      margin: 0 auto;
    }

    .hero__eyebrow {
      margin: 0 0 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 0.75rem;
      font-weight: 700;
      color: #0d9488;
    }

    .hero h1 {
      margin: 0;
      font-size: clamp(2rem, 5vw, 3.25rem);
      line-height: 1.1;
      color: #0f172a;
    }

    .hero__subtitle {
      margin: 1rem 0 1.75rem;
      font-size: 1.1rem;
      line-height: 1.6;
      color: #475569;
      max-width: 38rem;
    }

    .results {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 1.5rem 3rem;
    }

    .results__header h2,
    .results__placeholder h2,
    .results__message h2 {
      margin: 0;
      font-size: 1.75rem;
      color: #0f172a;
    }

    .results__header p,
    .results__placeholder p,
    .results__message p {
      margin: 0.5rem 0 0;
      color: #64748b;
    }

    .results__header {
      margin-bottom: 1.5rem;
    }

    .results__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.5rem;
    }

    .results__placeholder,
    .results__message {
      text-align: center;
      padding: 3rem 1rem;
      border-radius: 1.5rem;
      background: #f8fafc;
      border: 1px dashed #cbd5e1;
    }

    .results__message--error {
      border-color: #fecaca;
      background: #fef2f2;
    }

    .retry {
      margin-top: 1rem;
      border: none;
      border-radius: 999px;
      padding: 0.75rem 1.25rem;
      background: #0f766e;
      color: white;
      font-weight: 700;
      cursor: pointer;
    }

    .coming-soon {
      max-width: 1200px;
      margin: 0 auto 4rem;
      padding: 0 1.5rem;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
    }

    .coming-soon__card {
      padding: 1.5rem;
      border-radius: 1.25rem;
      background: linear-gradient(135deg, #f8fafc, #eef2ff);
      border: 1px solid rgba(148, 163, 184, 0.2);
    }

    .coming-soon__card h3 {
      margin: 0 0 0.35rem;
      color: #0f172a;
    }

    .coming-soon__card p {
      margin: 0;
      color: #64748b;
      font-weight: 600;
    }

    @media (max-width: 768px) {
      .coming-soon {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class DiscoverPageComponent {
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hasSearched = signal(false);
  protected readonly recommendations = signal<DestinationRecommendation[]>([]);

  private lastPreferences: SearchPreferences | null = null;

  constructor(private readonly destinationService: DestinationService) {}

  protected onSearch(preferences: SearchPreferences): void {
    this.lastPreferences = preferences;
    this.loading.set(true);
    this.error.set(null);
    this.hasSearched.set(true);

    this.destinationService.getRecommendations(preferences).subscribe({
      next: results => {
        this.recommendations.set(results);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not reach the API. Start the backend with: dotnet run --project src/EscapeNow.Api/EscapeNow.Api.csproj');
        this.loading.set(false);
        this.recommendations.set([]);
      }
    });
  }

  protected retry(): void {
    if (this.lastPreferences) {
      this.onSearch(this.lastPreferences);
    }
  }
}
