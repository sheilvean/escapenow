import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'discover', pathMatch: 'full' },
  {
    path: 'discover',
    loadComponent: () =>
      import('./pages/discover-page/discover-page.component').then(m => m.DiscoverPageComponent)
  },
  {
    path: 'destination/:id',
    loadComponent: () =>
      import('./pages/destination-details-page/destination-details-page.component').then(
        m => m.DestinationDetailsPageComponent
      )
  },
  {
    path: 'config',
    loadComponent: () =>
      import('./pages/config-page/config-page.component').then(m => m.ConfigPageComponent)
  },
  { path: '**', redirectTo: 'discover' }
];
