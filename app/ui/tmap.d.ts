export {};

declare global {
  interface Window {
    __TMAP_SDK_LOADED__?: boolean;
    __TMAP_SDK_LOAD_ERROR__?: string;
    Tmapv2?: {
      LatLng: new (lat: number, lng: number) => unknown;
      LatLngBounds: new () => {
        extend: (latlng: unknown) => void;
      };
      Map: new (
        elementId: string,
        options: {
          center: unknown;
          width: string;
          height: string;
          zoom?: number;
          https?: boolean;
        }
      ) => {
        setCenter: (c: unknown) => void;
        setZoom: (z: number) => void;
        fitBounds?: (b: unknown) => void;
      };
      Marker: new (options: {
        position: unknown;
        map: unknown;
        title?: string;
        label?: string;
        icon?: string;
        iconSize?: { width: number; height: number };
        offset?: { x: number; y: number };
      }) => { setMap: (m: unknown | null) => void };
      Polyline: new (options: {
        path: unknown[];
        strokeColor?: string;
        strokeWeight?: number;
        strokeOpacity?: number;
        map: unknown;
        zIndex?: number;
      }) => { setMap: (m: unknown | null) => void };
    };
  }
}
