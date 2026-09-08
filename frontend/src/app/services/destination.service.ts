import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  DestinationDetail,
  DestinationRecommendation,
  SearchPreferences
} from '../models/destination.models';

@Injectable({ providedIn: 'root' })
export class DestinationService {
  private readonly apiBase = '/api/destinations';

  constructor(private readonly http: HttpClient) {}

  getRecommendations(preferences: SearchPreferences): Observable<DestinationRecommendation[]> {
    const { startDate, endDate } = this.resolveDateWindow(preferences.departurePeriod);
    let params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate);

    if (preferences.temperaturePreference !== 'any') {
      params = params.set('temperaturePreference', preferences.temperaturePreference);
    }

    if (preferences.weatherPreference !== 'any') {
      params = params.set('weatherPreference', preferences.weatherPreference);
    }

    return this.http.get<DestinationRecommendation[]>(`${this.apiBase}/recommendations`, { params });
  }

  getDestination(city: string): Observable<DestinationDetail> {
    const today = this.formatDate(new Date());
    const end = this.formatDate(this.addDays(new Date(), 6));
    const params = new HttpParams().set('startDate', today).set('endDate', end);
    return this.http.get<DestinationDetail>(`${this.apiBase}/${encodeURIComponent(city)}`, { params });
  }

  private resolveDateWindow(period: SearchPreferences['departurePeriod']): { startDate: string; endDate: string } {
    const today = new Date();

    if (period === 'in-3-4-days') {
      return {
        startDate: this.formatDate(this.addDays(today, 3)),
        endDate: this.formatDate(this.addDays(today, 4))
      };
    }

    if (period === 'next-weekend') {
      const daysUntilSaturday = (6 - today.getDay() + 7) % 7 || 7;
      const saturday = this.addDays(today, daysUntilSaturday);
      const sunday = this.addDays(saturday, 1);
      return {
        startDate: this.formatDate(saturday),
        endDate: this.formatDate(sunday)
      };
    }

    return {
      startDate: this.formatDate(today),
      endDate: this.formatDate(this.addDays(today, 6))
    };
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
