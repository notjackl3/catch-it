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
        travelMode?: string;
        navigationInstruction?: { instructions?: string };
        distanceMeters?: number;
        staticDuration?: string;
        localizedValues?: {
          staticDuration?: { text?: string };
        };
        // Transit detail fields may or may not be present depending on travelMode/support.
        transitDetails?: any;
      }>;
    }>;
  }>;
};

export type RouteStep = {
  instruction: string;
  distanceMeters?: number;
  durationSeconds?: number;
  travelMode?: 'WALK' | 'TRANSIT' | string;
  transitDetails?: any;
};

export type RouteOption = {
  id: string;
  durationSeconds?: number;
  distanceMeters?: number;
  encodedPolyline?: string;
  path?: Array<{ latitude: number; longitude: number }>;
  steps: RouteStep[];
  /**
   * High-level, user-friendly itinerary lines. Intended to replace the verbose `steps` UI.
   * Example:
   *  - "Walk 4 min to Station A"
   *  - "8:05 AM Take Bus 36 toward South Common from Stop A → Stop B (arrive 8:25 AM)"
   */
  keyInstructions: string[];
  /**
   * Best-effort "start at" for this route.
   * - For transit: departure time of the first TRANSIT step (from transitDetails)
   * - Fallback: if request used arrivalTime and route duration is present, estimate = arrivalTime - duration
   */
  startAtISO?: string;
};

function parseDurationSeconds(duration?: string): number | undefined {
  if (!duration) return undefined;
  const m = duration.match(/^(\d+)s$/);
  if (!m) return undefined;
  return Number(m[1]);
}

function fmtMinutes(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min`;
}

function timeTextFromTransitDetails(td: any, which: 'departure' | 'arrival'): string | undefined {
  const key = which === 'departure' ? 'departureTime' : 'arrivalTime';
  const localized = td?.localizedValues?.[key]?.time?.text;
  if (typeof localized === 'string' && localized.length) return localized;

  const iso = td?.stopDetails?.[key];
  const d = iso ? new Date(iso) : null;
  if (d && Number.isFinite(d.getTime())) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return undefined;
}

function firstTransitDepartureISO(steps: RouteStep[]): string | undefined {
  for (const s of steps) {
    if (s.travelMode !== 'TRANSIT') continue;
    const iso = s.transitDetails?.stopDetails?.departureTime;
    if (typeof iso === 'string' && iso.length) return iso;
  }
  return undefined;
}

function estimateStartAtISOFromArrival(arrival: Date, durationSeconds?: number): string | undefined {
  if (!durationSeconds) return undefined;
  const ms = arrival.getTime() - durationSeconds * 1000;
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

function buildKeyInstructions(steps: RouteStep[]): string[] {
  const out: string[] = [];
  let pendingWalkSeconds = 0;

  for (const s of steps) {
    const mode = s.travelMode;
    if (mode === 'WALK') {
      pendingWalkSeconds += s.durationSeconds ?? 0;
      continue;
    }

    if (mode === 'TRANSIT' && s.transitDetails) {
      const td = s.transitDetails;
      const depStop = td?.stopDetails?.departureStop?.name;
      const arrStop = td?.stopDetails?.arrivalStop?.name;

      if (pendingWalkSeconds > 0) {
        out.push(`Walk ${fmtMinutes(pendingWalkSeconds)}${depStop ? ` to ${depStop}` : ''}`);
        pendingWalkSeconds = 0;
      }

      const depTime = timeTextFromTransitDetails(td, 'departure');
      const arrTime = timeTextFromTransitDetails(td, 'arrival');

      const vehicle =
        td?.transitLine?.vehicle?.name?.text ??
        td?.transitLine?.vehicle?.type ??
        'Transit';
      const lineShort = td?.transitLine?.nameShort ?? td?.transitLine?.name;
      const headsign = td?.headsign;

      const parts: string[] = [];
      parts.push('Take');
      parts.push(vehicle);
      if (lineShort) parts.push(String(lineShort));
      parts.push('at');
      if (depTime) parts.push(depTime);
      if (headsign) parts.push(`toward ${headsign}`);

      const fromTo: string[] = [];
      if (depStop) fromTo.push(`from ${depStop}`);
      if (arrStop) fromTo.push(`to ${arrStop}`);

      let line = parts.join(' ');
      if (fromTo.length) line += ` ${fromTo.join(' ')}`;
      if (arrTime) line += ` (arrive at ${arrTime})`;
      out.push(line);

      continue;
    }

    // Unknown or unsupported step type: fall back to the human string, but keep it minimal.
    if (pendingWalkSeconds > 0) {
      out.push(`Walk ${fmtMinutes(pendingWalkSeconds)}`);
      pendingWalkSeconds = 0;
    }
    if (s.instruction) out.push(s.instruction);
  }

  if (pendingWalkSeconds > 0) {
    out.push(`Walk ${fmtMinutes(pendingWalkSeconds)}`);
  }

  return out;
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
    travelMode: 'TRANSIT', // prioritize transit where available
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
        'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.travelMode,routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails',
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
          travelMode: s.travelMode,
          transitDetails: s.transitDetails,
        }))
      ) ?? [];
    const keyInstructions = buildKeyInstructions(steps);
    const durationSeconds = parseDurationSeconds(r.duration);
    const startAtISO =
      firstTransitDepartureISO(steps) ??
      (params.timeMode === 'arriveBy' ? estimateStartAtISOFromArrival(params.time, durationSeconds) : params.time.toISOString());

    return {
      id: String(idx),
      durationSeconds,
      distanceMeters: r.distanceMeters,
      encodedPolyline: encoded,
      path: encoded ? decodePolyline(encoded) : undefined,
      steps,
      keyInstructions,
      startAtISO,
    };
  });
}


