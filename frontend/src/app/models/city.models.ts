export interface CatalogCity {
  id: string;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  imageUrl: string;
}

export interface CityWriteRequest {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  imageUrl: string;
}
