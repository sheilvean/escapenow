import { Component } from '@angular/core';

@Component({
  selector: 'app-loading-skeleton',
  standalone: true,
  template: `
    <div class="skeleton-grid">
      @for (item of placeholders; track item) {
        <article class="skeleton-card">
          <div class="skeleton-card__image shimmer"></div>
          <div class="skeleton-card__body">
            <div class="shimmer line line--lg"></div>
            <div class="shimmer line"></div>
            <div class="shimmer line line--short"></div>
          </div>
        </article>
      }
    </div>
  `,
  styles: [`
    .skeleton-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1.5rem;
    }

    .skeleton-card {
      border-radius: 1.25rem;
      overflow: hidden;
      background: white;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
    }

    .skeleton-card__image {
      height: 180px;
    }

    .skeleton-card__body {
      padding: 1.25rem;
      display: grid;
      gap: 0.75rem;
    }

    .line {
      height: 14px;
      border-radius: 999px;
    }

    .line--lg { width: 70%; height: 18px; }
    .line--short { width: 45%; }

    .shimmer {
      background: linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%);
      background-size: 200% 100%;
      animation: shimmer 1.4s infinite;
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `]
})
export class LoadingSkeletonComponent {
  protected readonly placeholders = [1, 2, 3, 4, 5];
}
