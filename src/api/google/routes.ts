import polyline from '@mapbox/polyline';
import { ENV } from '../../config/env';
import type { LatLng } from './places';
import { googleFetchJson } from './http';

export type TimeMode = 'departAt' | 'arriveBy';

type ComputeRoutesResponse = {
  routes?: Array<{
    duration?: string; // seconds
    distanceMeters?: number;
    polyline?: { encodedPolyline?: string };
    description?: string;
    legs?: Array<{
      steps?: Array<{
        navigationInstruction?: { instructions?: string };
        distanceMeters?: number;
        staticDuration?: string;
        // Transit detail fields may or may not be present depending on travelMode/support.
        transitDetails?: unknown;
      }>;
    }>;
  }>;
};

export type RouteStep = {
  instruction: string;
  distanceMeters?: number;
  durationSeconds?: number;
};

export type RouteOption = {
  id: string;
  durationSeconds?: number;
  distanceMeters?: number;
  encodedPolyline?: string;
  path?: Array<{ latitude: number; longitude: number }>;
  steps: RouteStep[];
};

function parseDurationSeconds(duration?: string): number | undefined {
  if (!duration) return undefined;
  const m = duration.match(/^(\d+)s$/);
  if (!m) return undefined;
  return Number(m[1]);
}

function decodePolyline(encoded: string): Array<{ latitude: number; longitude: number }> {
  // polyline.decode returns [lat, lng][]
  return polyline.decode(encoded).map(([lat, lng]) => ({
    latitude: lat,
    longitude: lng,
  }));
}

export type ComputeRoutesParams = {
  origin: LatLng;
  destination: LatLng;
  timeMode: TimeMode;
  time: Date;
};

export async function computeRoutes(params: ComputeRoutesParams): Promise<RouteOption[]> {
  const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';

  // NOTE: travelMode/transit support can vary. We're sending TRANSIT because it's your target.
  // If Google returns errors/empty routes in your region, you can change travelMode here.
  const body: any = {
    origin: { 
        location: { 
            latLng: { 
                latitude: params.origin.lat, 
                longitude: params.origin.lng } } },
    destination: {
      location: { 
        latLng: { 
            latitude: params.destination.lat, 
            longitude: params.destination.lng } },
    },
    travelMode: 'TRANSIT',
    computeAlternativeRoutes: true,
    languageCode: 'en',
    units: 'METRIC',
  };

  const iso = params.time.toISOString();
  if (params.timeMode === 'departAt') body.departureTime = iso;
  else body.arrivalTime = iso;

  const data = await googleFetchJson<ComputeRoutesResponse>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': ENV.GOOGLE_API_KEY,
      // Keep response small but usable for drawing and basic itinerary text.
      'X-Goog-FieldMask':
        'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration',
    },
    body: JSON.stringify(body),
  });

  const routes = data.routes ?? [];
  return routes.map((r, idx) => {
    const encoded = r.polyline?.encodedPolyline;
    const steps =
      r.legs?.flatMap((l) =>
        (l.steps ?? []).map<RouteStep>((s) => ({
          instruction: s.navigationInstruction?.instructions ?? 'Step',
          distanceMeters: s.distanceMeters,
          durationSeconds: parseDurationSeconds(s.staticDuration),
        }))
      ) ?? [];

    return {
      id: String(idx),
      durationSeconds: parseDurationSeconds(r.duration),
      distanceMeters: r.distanceMeters,
      encodedPolyline: encoded,
      path: encoded ? decodePolyline(encoded) : undefined,
      steps,
    };
  });
}


