declare module '@mapbox/polyline' {
  // Minimal typings used by this project.
  // polyline.decode returns an array of [lat, lng] pairs.
  export function decode(
    str: string,
    precision?: number
  ): Array<[number, number]>;

  // polyline.encode expects an array of [lat, lng] pairs.
  export function encode(
    coordinates: Array<[number, number]>,
    precision?: number
  ): string;
}


