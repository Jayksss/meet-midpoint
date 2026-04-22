export type SelectedPlace = {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
};

export type MapPoint = SelectedPlace & { rowIndex: number };

export const DEFAULT_MAP_CENTER = { lat: 37.4979, lng: 127.0276 } as const;

