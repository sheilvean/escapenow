import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CityService } from '../../services/city.service';
import { CatalogCity } from '../../models/city.models';

@Component({
  selector: 'app-config-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="page">
      <p class="eyebrow">Operator tooling</p>
      <h1>City catalog</h1>
      <p class="lede">
        Add, edit or remove destinations. This page is unauthenticated demo configuration — not an
        admin product. Anyone who can open it can change the catalog.
      </p>

      @if (error()) {
        <p class="banner banner--error">{{ error() }}</p>
      }

      <form class="form" [formGroup]="form" (ngSubmit)="save()">
        <h2>{{ editingId() ? 'Edit city' : 'Add a city' }}</h2>
        <label>
          Name
          <input type="text" formControlName="name" />
        </label>
        <label>
          Country
          <input type="text" formControlName="country" />
        </label>
        <div class="form__coords">
          <label>
            Latitude
            <input type="number" step="any" formControlName="latitude" />
          </label>
          <label>
            Longitude
            <input type="number" step="any" formControlName="longitude" />
          </label>
        </div>
        <label>
          Image URL
          <input type="url" formControlName="imageUrl" />
        </label>
        <div class="form__actions">
          <button type="submit" class="primary" [disabled]="form.invalid || saving()">
            {{ editingId() ? 'Save changes' : 'Add city' }}
          </button>
          @if (editingId()) {
            <button type="button" class="secondary" (click)="cancelEdit()">Cancel</button>
          }
        </div>
      </form>

      @if (loading()) {
        <p>Loading cities…</p>
      } @else {
        <ul class="catalog">
          @for (city of cities(); track city.id) {
            <li>
              <div>
                <strong>{{ city.name }}</strong>
                <span>{{ city.country }}</span>
              </div>
              <div class="catalog__actions">
                <button type="button" (click)="edit(city)">Edit</button>
                <button type="button" class="danger" (click)="remove(city)">Delete</button>
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [`
    .page {
      max-width: 760px;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
    }

    .eyebrow {
      margin: 0 0 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 0.75rem;
      font-weight: 700;
      color: #0d9488;
    }

    h1 {
      margin: 0;
      font-size: clamp(2rem, 5vw, 2.75rem);
      color: #0f172a;
    }

    .lede {
      margin: 1rem 0 2rem;
      color: #475569;
      line-height: 1.6;
    }

    .banner {
      padding: 0.85rem 1rem;
      border-radius: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .banner--error {
      background: #fef2f2;
      color: #991b1b;
    }

    .form {
      display: grid;
      gap: 0.85rem;
      padding: 1.5rem;
      border-radius: 1.25rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      margin-bottom: 2rem;
    }

    .form h2 {
      margin: 0;
      font-size: 1.15rem;
    }

    label {
      display: grid;
      gap: 0.35rem;
      font-weight: 600;
      color: #334155;
    }

    input {
      border: 1px solid #cbd5e1;
      border-radius: 0.75rem;
      padding: 0.7rem 0.85rem;
      background: white;
    }

    .form__coords {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.85rem;
    }

    .form__actions {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    button {
      border: none;
      border-radius: 999px;
      padding: 0.7rem 1.15rem;
      font-weight: 700;
      cursor: pointer;
    }

    .primary {
      background: linear-gradient(135deg, #0284c7, #0d9488);
      color: white;
    }

    .primary:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .secondary {
      background: #e2e8f0;
      color: #0f172a;
    }

    .catalog {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.75rem;
    }

    .catalog li {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: center;
      padding: 1rem 1.15rem;
      border-radius: 1rem;
      background: white;
      border: 1px solid #e2e8f0;
    }

    .catalog li div:first-child {
      display: grid;
      gap: 0.15rem;
    }

    .catalog span {
      color: #64748b;
      font-weight: 500;
    }

    .catalog__actions {
      display: flex;
      gap: 0.5rem;
    }

    .catalog__actions button {
      background: #f0fdfa;
      color: #0f766e;
    }

    .danger {
      background: #fef2f2 !important;
      color: #b91c1c !important;
    }

    @media (max-width: 640px) {
      .form__coords,
      .catalog li {
        grid-template-columns: 1fr;
        display: grid;
      }
    }
  `]
})
export class ConfigPageComponent implements OnInit {
  protected readonly cities = signal<CatalogCity[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);

  private readonly formBuilder = inject(FormBuilder);
  private readonly cityService = inject(CityService);

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    country: ['', Validators.required],
    latitude: [0, [Validators.required, Validators.min(-90), Validators.max(90)]],
    longitude: [0, [Validators.required, Validators.min(-180), Validators.max(180)]],
    imageUrl: ['', Validators.required]
  });

  ngOnInit(): void {
    this.refresh();
  }

  protected save(): void {
    if (this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    const request$ = this.editingId()
      ? this.cityService.update(this.editingId()!, value)
      : this.cityService.create(value);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelEdit();
        this.refresh();
      },
      error: () => {
        this.saving.set(false);
        this.error.set('Could not save the city. Check the values and try again.');
      }
    });
  }

  protected edit(city: CatalogCity): void {
    this.editingId.set(city.id);
    this.form.setValue({
      name: city.name,
      country: city.country,
      latitude: city.latitude,
      longitude: city.longitude,
      imageUrl: city.imageUrl
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({
      name: '',
      country: '',
      latitude: 0,
      longitude: 0,
      imageUrl: ''
    });
  }

  protected remove(city: CatalogCity): void {
    this.error.set(null);
    this.cityService.delete(city.id).subscribe({
      next: () => {
        if (this.editingId() === city.id) {
          this.cancelEdit();
        }
        this.refresh();
      },
      error: () => this.error.set('Could not delete that city.')
    });
  }

  private refresh(): void {
    this.loading.set(true);
    this.cityService.list().subscribe({
      next: cities => {
        this.cities.set(cities);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(
          'Could not load the catalog. Start the backend with: dotnet run --project src/EscapeNow.Api/EscapeNow.Api.csproj'
        );
        this.loading.set(false);
        this.cities.set([]);
      }
    });
  }
}
