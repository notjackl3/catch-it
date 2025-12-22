import { Platform } from 'react-native';

function requiredEnv(val: string | undefined, name: string): string {
  if (!val) {
    throw new Error(
      `Missing env var ${name}. Add it to your .env and/or EAS Secrets.`
    );
  }
  return val;
}

function optionalEnv(val: string | undefined): string | undefined {
  return val && val.length > 0 ? val : undefined;
}

export const ENV = {
  // We must access process.env.EXPO_PUBLIC_* variables statically (e.g. process.env.EXPO_PUBLIC_KEY)
  // because the web bundler replaces these exact strings with their values at build time.
  // Dynamic access like process.env[name] will fail in static production builds.
  GOOGLE_API_KEY: requiredEnv(
    process.env.EXPO_PUBLIC_GOOGLE_API_KEY,
    'EXPO_PUBLIC_GOOGLE_API_KEY'
  ),
  GOOGLE_MAPS_IOS_KEY:
    Platform.OS === 'ios'
      ? requiredEnv(
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY,
          'EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY'
        )
      : optionalEnv(process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY),
} as const;
