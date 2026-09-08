import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'discover', pathMatch: 'full' },
  {
    path: 'discover',
    loadComponent: () =>
      import('./pages/discover-page/discover-page.component').then(m => m.DiscoverPageComponent)
  },
  {
    path: 'destination/:city',
    loadComponent: () =>
      import('./pages/destination-details-page/destination-details-page.component').then(
        m => m.DestinationDetailsPageComponent
      )
  },
  { path: '**', redirectTo: 'discover' }
];
