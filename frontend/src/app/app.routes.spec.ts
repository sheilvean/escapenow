import { routes } from './app.routes';

describe('routes', () => {
  it('identifies destinations by UUID rather than city name', () => {
    const destination = routes.find(route => route.path?.startsWith('destination/'));

    expect(destination?.path).toBe('destination/:id');
  });

  it('exposes configuration as a first-class route before the wildcard', () => {
    const configIndex = routes.findIndex(route => route.path === 'config');
    const wildcardIndex = routes.findIndex(route => route.path === '**');

    expect(configIndex).toBeGreaterThan(-1);
    expect(wildcardIndex).toBeGreaterThan(configIndex);
  });
});
