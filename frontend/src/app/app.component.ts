import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent],
  template: `
    <div class="app-shell">
      <app-navbar />
      <main>
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    .app-shell {
      min-height: 100vh;
      background: #ffffff;
    }

    main {
      min-height: calc(100vh - 4.5rem);
    }
  `]
})
export class AppComponent {}
