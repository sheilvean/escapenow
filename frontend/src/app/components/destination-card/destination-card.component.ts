import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DestinationRecommendation } from '../../models/destination.models';
import { ScoreBadgeComponent } from '../score-badge/score-badge.component';
import { weatherIcon } from '../../utils/weather.utils';

@Component({
  selector: 'app-destination-card',
  standalone: true,
  imports: [CommonModule, RouterLink, ScoreBadgeComponent],
  template: `
    <article class="destination-card" [class.destination-card--best]="isBestMatch">
      @if (isBestMatch) {
        <span class="destination-card__badge">Best match</span>
      }

      <div class="destination-card__image-wrap">
        <img [src]="destination.imageUrl" [alt]="destination.city" loading="lazy" />
        <div class="destination-card__overlay">
          <div class="destination-card__temp">
            <span class="destination-card__icon">{{ icon }}</span>
            <strong>{{ destination.averageTemperature | number:'1.0-0' }}°C</strong>
          </div>
        </div>
      </div>

      <div class="destination-card__content">
        <div class="destination-card__header">
          <div>
            <h3>{{ destination.city }}</h3>
            <p>{{ destination.country }}</p>
          </div>
          <app-score-badge [score]="destination.score" [highlight]="isBestMatch" />
        </div>

        <div class="destination-card__weather">
          <span>{{ destination.weatherCondition }}</span>
          <span>{{ destination.rainProbability }}% rain</span>
        </div>

        <p class="destination-card__recommendation">{{ destination.recommendation }}</p>

        <a class="destination-card__cta" [routerLink]="['/destination', destination.city]">
          View forecast
        </a>
      </div>
    </article>
  `,
  styles: [`
    .destination-card {
      position: relative;
      border-radius: 1.5rem;
      overflow: hidden;
      background: white;
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
      transition: transform 0.25s ease, box-shadow 0.25s ease;
      animation: fadeUp 0.5s ease both;
    }

    .destination-card:hover {
      transform: translateY(-6px);
      box-shadow: 0 24px 50px rgba(15, 23, 42, 0.12);
    }

    .destination-card--best {
      border: 2px solid rgba(20, 184, 166, 0.45);
      box-shadow: 0 24px 55px rgba(20, 184, 166, 0.18);
    }

    .destination-card__badge {
      position: absolute;
      top: 1rem;
      left: 1rem;
      z-index: 2;
      background: linear-gradient(135deg, #0f766e, #14b8a6);
      color: white;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 0.4rem 0.75rem;
      border-radius: 999px;
    }

    .destination-card__image-wrap {
      position: relative;
      height: 200px;
      overflow: hidden;
    }

    .destination-card__image-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.4s ease;
    }

    .destination-card:hover img {
      transform: scale(1.05);
    }

    .destination-card__overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, rgba(15, 23, 42, 0.55), transparent 55%);
    }

    .destination-card__temp {
      position: absolute;
      bottom: 1rem;
      left: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: white;
      font-size: 1.5rem;
    }

    .destination-card__icon {
      font-size: 1.75rem;
    }

    .destination-card__content {
      padding: 1.25rem;
      display: grid;
      gap: 0.85rem;
    }

    .destination-card__header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
    }

    .destination-card__header h3 {
      margin: 0;
      font-size: 1.35rem;
      color: #0f172a;
    }

    .destination-card__header p {
      margin: 0.2rem 0 0;
      color: #64748b;
      font-weight: 500;
    }

    .destination-card__weather {
      display: flex;
      gap: 1rem;
      color: #334155;
      font-weight: 600;
      font-size: 0.95rem;
    }

    .destination-card__recommendation {
      margin: 0;
      color: #475569;
      line-height: 1.5;
    }

    .destination-card__cta {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      padding: 0.75rem 1rem;
      border-radius: 999px;
      background: #f0fdfa;
      color: #0f766e;
      font-weight: 700;
      text-decoration: none;
      transition: background 0.2s ease;
    }

    .destination-card__cta:hover {
      background: #ccfbf1;
    }

    @keyframes fadeUp {
      from {
        opacity: 0;
        transform: translateY(16px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `]
})
export class DestinationCardComponent {
  @Input({ required: true }) destination!: DestinationRecommendation;
  @Input() isBestMatch = false;

  protected get icon(): string {
    return weatherIcon(this.destination.weatherConditionKey);
  }
}
