export {};

declare global {
  type KakaoLatLng = unknown;
  type KakaoMap = {
    setBounds: (
      bounds: unknown,
      paddingTop?: number,
      paddingRight?: number,
      paddingBottom?: number,
      paddingLeft?: number
    ) => void;
  };
  type KakaoSetMap = { setMap: (map: unknown | null) => void };

  interface Window {
    kakao?: {
      maps: {
        load: (cb: () => void) => void;
        LatLng: new (lat: number, lng: number) => KakaoLatLng;
        Map: new (
          container: HTMLElement,
          options: { center: KakaoLatLng; level?: number }
        ) => KakaoMap;
        Marker: new (options: { map: KakaoMap; position: KakaoLatLng }) => KakaoSetMap;
        Polyline: new (options: {
          map: KakaoMap;
          path: KakaoLatLng[];
          strokeWeight?: number;
          strokeColor?: string;
          strokeOpacity?: number;
          strokeStyle?: string;
        }) => KakaoSetMap;
        CustomOverlay?: new (options: {
          map?: KakaoMap;
          position: KakaoLatLng;
          content: HTMLElement | string;
          xAnchor?: number;
          yAnchor?: number;
          zIndex?: number;
        }) => KakaoSetMap;
        LatLngBounds: new () => {
          extend: (latlng: KakaoLatLng) => void;
        };
        event: {
          addListener: (target: unknown, type: string, handler: () => void) => void;
        };
        services: {
          Status: { OK: string };
          SortBy?: { DISTANCE: string };
          Places: new () => {
            keywordSearch: (
              query: string,
              callback: (data: unknown[], status: string) => void,
              options?: { size?: number; page?: number }
            ) => void;
            categorySearch?: (
              code: string,
              callback: (data: unknown[], status: string) => void,
              options?: {
                location?: KakaoLatLng;
                radius?: number;
                sort?: string;
                size?: number;
                page?: number;
              }
            ) => void;
          };
          Geocoder?: new () => {
            coord2Address: (
              x: number,
              y: number,
              callback: (result: unknown[], status: string) => void
            ) => void;
          };
        };
      };
    };
  }
}

