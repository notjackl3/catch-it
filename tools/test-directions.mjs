#!/usr/bin/env node
/**
 * Usage:
 *   node tools/test-directions.mjs "Origin text" "Destination text" --arrive "2025-12-21T18:30:00Z"
 *
 * NPM:
 *   npm run test:directions -- "Origin" "Destination" --arrive "2025-12-21T18:30:00Z"
 *
 * Env:
 *   EXPO_PUBLIC_GOOGLE_API_KEY=... (or in .env at repo root)
 */

import fs from 'node:fs';
import path from 'node:path';

function loadDotEnvIfPresent() {
  // Load catch-it/.env if present (very small parser).
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function usageAndExit(msg) {
  if (msg) console.error(msg);
  console.error(
    [
      '',
      'Usage:',
      '  npm run test:directions -- "Origin text" "Destination text" --arrive "2025-12-21T18:30:00Z"',
      '  npm run test:directions -- "Origin text" "Destination text" --depart "2025-12-21T17:30:00Z"',
      '',
      'Optional:',
      '  --mode TRANSIT|DRIVE|WALK|BICYCLE',
      '  --fieldMask "routes"   (default: routes)',
      '  --out "path.json"     (write JSON to a file instead of printing)',
      '  --raw                 (print raw JSON only; ignored if --out is set)',
    ].join('\n')
  );
  process.exit(1);
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function defaultOutPath() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve(process.cwd(), 'tmp', `routes-${ts}.json`);
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${url}\n${text}`);
  }
  return await res.json();
}

async function placesAutocompleteTop(apiKey, input) {
  const url = 'https://places.googleapis.com/v1/places:autocomplete';
  const data = await fetchJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
    },
    body: JSON.stringify({ input }),
  });

  const first = data?.suggestions?.[0]?.placePrediction;
  const placeId = first?.placeId;
  const description = first?.text?.text;
  if (!placeId) return null;
  return { placeId, description: description ?? input };
}

async function placeDetails(apiKey, placeId) {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(
    placeId
  )}`;
  const data = await fetchJson(url, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'location,displayName.text,formattedAddress',
    },
  });

  const lat = data?.location?.latitude;
  const lng = data?.location?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new Error(`Place details missing lat/lng for placeId=${placeId}`);
  }

  return {
    placeId,
    name: data?.displayName?.text ?? placeId,
    address: data?.formattedAddress,
    lat,
    lng,
  };
}

async function computeRoutes(apiKey, body, fieldMask) {
  const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';
  return await fetchJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(body),
  });
}

async function main() {
  loadDotEnvIfPresent();

  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const originText = args[0];
  const destinationText = args[1];
  if (!originText || !destinationText) usageAndExit('Missing origin/destination.');

  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
  if (!apiKey) usageAndExit('Missing env var EXPO_PUBLIC_GOOGLE_API_KEY');

  const outPath = argValue('--out');
  const arrive = argValue('--arrive');
  const depart = argValue('--depart');
  if (arrive && depart) usageAndExit('Use only one: --arrive or --depart');

  const mode = (argValue('--mode') ?? 'TRANSIT').toUpperCase();
  const fieldMask = argValue('--fieldMask') ?? 'routes';
  const raw = hasFlag('--raw');

  const timeISO = arrive ?? depart ?? new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const timeKey = arrive ? 'arrivalTime' : 'departureTime';

  const originPred = await placesAutocompleteTop(apiKey, originText);
  const destPred = await placesAutocompleteTop(apiKey, destinationText);
  if (!originPred) throw new Error(`No autocomplete result for origin: "${originText}"`);
  if (!destPred) throw new Error(`No autocomplete result for destination: "${destinationText}"`);

  const origin = await placeDetails(apiKey, originPred.placeId);
  const destination = await placeDetails(apiKey, destPred.placeId);

  const body = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    travelMode: mode,
    computeAlternativeRoutes: true,
    [timeKey]: timeISO,
  };

  const resp = await computeRoutes(apiKey, body, fieldMask);

  const jsonText = JSON.stringify(resp, null, 2) + '\n';

  // If --out is set, always write to file and keep console short.
  if (outPath) {
    const resolved = path.resolve(process.cwd(), outPath);
    ensureDirForFile(resolved);
    fs.writeFileSync(resolved, jsonText, 'utf8');
    console.log(`Wrote response to: ${resolved}`);
    return;
  }

  // Default: allow printing raw JSON (for piping to jq, etc.)
  if (raw) {
    process.stdout.write(jsonText);
    return;
  }

  console.log('--- Input ---');
  console.log({ originText, destinationText, mode, [timeKey]: timeISO, fieldMask });
  console.log('--- Autocomplete top match ---');
  console.log({
    origin: { placeId: originPred.placeId, description: originPred.description },
    destination: { placeId: destPred.placeId, description: destPred.description },
  });
  console.log('--- Place details (lat/lng) ---');
  console.log({
    origin: { name: origin.name, address: origin.address, lat: origin.lat, lng: origin.lng },
    destination: {
      name: destination.name,
      address: destination.address,
      lat: destination.lat,
      lng: destination.lng,
    },
  });
  console.log('--- Routes API response ---');
  // If the response is too large, use --out (or pipe to a file):
  //   npm run test:directions -- "A" "B" --arrive "..." --raw > out.json
  process.stdout.write(jsonText);
}

main().catch((e) => {
  console.error(e?.stack ?? String(e));
  process.exit(1);
});


