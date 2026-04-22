export {};

declare global {
  interface Window {
    kakao?: {
      maps?: {
        load: (cb: () => void) => void;
        LatLng: new (lat: number, lng: number) => unknown;
        LatLngBounds: new () => { extend: (latlng: unknown) => void };
        Map: new (container: HTMLElement, options: { center: unknown; level: number }) => {
          setBounds: (bounds: unknown) => void;
          setCenter: (latlng: unknown) => void;
          setLevel: (level: number) => void;
        };
        Marker: new (options: { position: unknown }) => {
          setMap: (map: unknown | null) => void;
        };
        MarkerImage: new (src: string, size: unknown, options?: unknown) => unknown;
        Size: new (width: number, height: number) => unknown;
        Point: new (x: number, y: number) => unknown;
        Polyline: new (options: {
          path: unknown[];
          strokeWeight?: number;
          strokeColor?: string;
          strokeOpacity?: number;
          strokeStyle?: string;
        }) => {
          setMap: (map: unknown | null) => void;
        };
      };
    };
  }
}

