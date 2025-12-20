# Catch-It (iOS)

Expo + Dev Build app that renders **Google Maps** and calls **Google Places + Google Routes API** to plan trips.

## Prereqs

- Node + npm
- Expo CLI (via `npx expo ...`)
- For iPhone installation: an **Apple Developer account** (you said you’ll create this later)

## Setup

1) Install dependencies

```bash
npm install
```

2) Add env vars

- Copy `[env.example](env.example)` to `.env` (this repo ignores `.env`)
- Fill in:
  - `EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY`
  - `EXPO_PUBLIC_GOOGLE_API_KEY`

3) Google Cloud Console

Enable:
- Maps SDK for iOS
- Places API
- Routes API

Recommended keys:
- **Maps SDK for iOS key**: restrict to bundle id `com.jackle.catchit`
- **Web services key**: restrict to the specific APIs you enabled (still ships in the app binary because there’s no backend proxy)

## Run (Dev Client)

Start Metro for dev client:

```bash
npm run start:dev
```

## Build & install on iPhone (later, after Apple Dev account)

```bash
npx eas init
npm run eas:build:ios:dev
```

Then install the build onto your device (EAS internal distribution) and open it.

## Where the code lives

- `src/screens/PlanTripScreen.tsx`: origin/destination + arrive/depart time
- `src/api/google/places.ts`: Places Autocomplete + Place Details
- `src/api/google/routes.ts`: Routes API `computeRoutes` request + polyline decode
- `src/screens/RouteMapScreen.tsx`: map + polyline rendering


