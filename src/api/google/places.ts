import { ENV } from '../../config/env';
import { googleFetchJson } from './http';

export type LatLng = { lat: number; lng: number };

export type PlaceAutocompletePrediction = {
  placeId: string;
  description: string;
};

type PlacesAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
    };
  }>;
};

// Places API (New) - Autocomplete
export async function placesAutocomplete(input: string): Promise<PlaceAutocompletePrediction[]> {
  if (!input.trim()) return [];

  const url = 'https://places.googleapis.com/v1/places:autocomplete';
  const body = {
    input,
    // Add locationBias, includedPrimaryTypes, etc later.
  };

  const data = await googleFetchJson<PlacesAutocompleteResponse>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': ENV.GOOGLE_API_KEY,
      // Field mask keeps responses smaller/cheaper.
      'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
    },
    body: JSON.stringify(body),
  });

  const out: PlaceAutocompletePrediction[] = [];
  for (const s of data.suggestions ?? []) {
    const p = s.placePrediction;
    const placeId = p?.placeId;
    const description = p?.text?.text;
    if (placeId && description) out.push({ placeId, description });
  }
  return out;
}

type PlaceDetailsResponse = {
  location?: { latitude?: number; longitude?: number };
  displayName?: { text?: string };
  formattedAddress?: string;
};

export type PlaceDetails = {
  placeId: string;
  name: string;
  address?: string;
  location: LatLng;
};

// Places API (New) - Place Details
export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  const data = await googleFetchJson<PlaceDetailsResponse>(url, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': ENV.GOOGLE_API_KEY,
      'X-Goog-FieldMask':
        'location,displayName.text,formattedAddress',
    },
  });

  const lat = data.location?.latitude;
  const lng = data.location?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new Error('Place details missing lat/lng');
  }

  return {
    placeId,
    name: data.displayName?.text ?? 'Selected place',
    address: data.formattedAddress,
    location: { lat, lng },
  };
}


