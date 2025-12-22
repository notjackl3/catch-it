import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  // NOTE: These env vars are intentionally EXPO_PUBLIC_* because you chose to call Google web APIs directly from the app (no backend proxy). That means the key will be present in the app binary.
  const googleMapsIOSKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY ?? '';

  return {
    ...config,
    name: config.name ?? 'catch-it', // part of URL that points to the app
    slug: config.slug ?? 'catch-it', // name of the app
    version: config.version ?? '1.0.0',
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.jackle.catchit',
      supportsTablet: true,
      config: {
        ...(config.ios?.config as any), // keep the existing client config
        googleMapsApiKey: googleMapsIOSKey,
      } as any,
      infoPlist: { 
        ...config.ios?.infoPlist,
        NSLocationWhenInUseUsageDescription:
          'Catch-It uses your location to show your position on the map and to plan routes from your current location.',
      },
    },
    android: {
      ...config.android,
      config: {
        ...(config.android?.config as any),
        googleMaps: {
          ...(config.android?.config as any)?.googleMaps,
          apiKey: googleMapsIOSKey,
        },
      } as any,
    },
    web: {
      bundler: "metro",
      output: "single",
    },
  };
};
