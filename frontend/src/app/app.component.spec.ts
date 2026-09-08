import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';

// The shell owns two things: the navbar and the outlet the routed pages render into. Both are
// asserted through the rendered DOM rather than through the component's fields, so rewriting how
// the shell is written does not break the test but changing what it renders does.
describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      // The navbar links with routerLink, which needs a Router to resolve against.
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('creates the shell', () => {
    const fixture = TestBed.createComponent(AppComponent);

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the navbar', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('app-navbar')).not.toBeNull();
    expect(compiled.querySelector('.navbar__name')?.textContent).toContain('EscapeNow');
  });

  it('renders an outlet for the routed page', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('main router-outlet')).not.toBeNull();
  });
});
