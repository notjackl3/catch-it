function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `Missing env var ${name}. Add it to your .env and/or EAS Secrets.`
    );
  }
  return val;
}

function optionalEnv(name: string): string | undefined {
  const val = process.env[name];
  return val && val.length > 0 ? val : undefined;
}

export const ENV = {
  // Optional for Expo Go mode (we removed the native map screen).
  GOOGLE_MAPS_IOS_KEY: optionalEnv('EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY'),
  GOOGLE_API_KEY: requiredEnv('EXPO_PUBLIC_GOOGLE_API_KEY'),
} as const;


