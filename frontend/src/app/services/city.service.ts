import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CatalogCity, CityWriteRequest } from '../models/city.models';

@Injectable({ providedIn: 'root' })
export class CityService {
  private readonly apiBase = '/api/cities';

  constructor(private readonly http: HttpClient) {}

  list(): Observable<CatalogCity[]> {
    return this.http.get<CatalogCity[]>(this.apiBase);
  }

  create(city: CityWriteRequest): Observable<CatalogCity> {
    return this.http.post<CatalogCity>(this.apiBase, city);
  }

  update(id: string, city: CityWriteRequest): Observable<CatalogCity> {
    return this.http.put<CatalogCity>(`${this.apiBase}/${encodeURIComponent(id)}`, city);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${encodeURIComponent(id)}`);
  }
}
