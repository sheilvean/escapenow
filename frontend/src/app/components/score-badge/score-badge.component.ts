import { Component, Input } from '@angular/core';
import { scoreLabel } from '../../utils/weather.utils';

@Component({
  selector: 'app-score-badge',
  standalone: true,
  imports: [],
  template: `
    <div class="score-badge" [class.score-badge--highlight]="highlight">
      <span class="score-badge__value">{{ score }}</span>
      <span class="score-badge__label">City Break Score</span>
      <span class="score-badge__tier">{{ scoreLabel(score) }}</span>
    </div>
  `,
  styles: [`
    .score-badge {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: 0.15rem;
      padding: 0.75rem 1rem;
      border-radius: 1rem;
      background: linear-gradient(135deg, #fff7ed, #ffedd5);
      border: 1px solid rgba(251, 146, 60, 0.25);
      min-width: 7rem;
    }

    .score-badge--highlight {
      background: linear-gradient(135deg, #0f766e, #14b8a6);
      border-color: transparent;
      color: white;
      box-shadow: 0 12px 30px rgba(20, 184, 166, 0.35);
    }

    .score-badge--highlight .score-badge__label,
    .score-badge--highlight .score-badge__tier {
      color: rgba(255, 255, 255, 0.9);
    }

    .score-badge__value {
      font-size: 1.75rem;
      font-weight: 800;
      line-height: 1;
    }

    .score-badge__label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #9a3412;
      font-weight: 600;
    }

    .score-badge__tier {
      font-size: 0.75rem;
      color: #c2410c;
      font-weight: 500;
    }
  `]
})
export class ScoreBadgeComponent {
  @Input({ required: true }) score!: number;
  @Input() highlight = false;

  protected readonly scoreLabel = scoreLabel;
}
