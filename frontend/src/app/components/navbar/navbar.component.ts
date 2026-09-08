import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="navbar">
      <a routerLink="/discover" class="navbar__brand">
        <span class="navbar__logo">✈</span>
        <span class="navbar__name">EscapeNow</span>
      </a>
      <nav class="navbar__links">
        <a routerLink="/discover" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
          Discover
        </a>
        <a routerLink="/config" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
          Config
        </a>
      </nav>
    </header>
  `,
  styles: [`
    .navbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.5rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    .navbar__brand {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      text-decoration: none;
      color: #0f172a;
      font-weight: 800;
      font-size: 1.2rem;
    }

    .navbar__logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 0.75rem;
      background: linear-gradient(135deg, #0ea5e9, #14b8a6);
      color: white;
      font-size: 1rem;
    }

    .navbar__links a {
      text-decoration: none;
      color: #475569;
      font-weight: 600;
      padding: 0.5rem 0.9rem;
      border-radius: 999px;
      transition: all 0.2s ease;
    }

    .navbar__links a.active,
    .navbar__links a:hover {
      color: #0f766e;
      background: rgba(20, 184, 166, 0.1);
    }
  `]
})
export class NavbarComponent {}
