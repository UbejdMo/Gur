import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json. EXPO_BASE_URL sets the path the web build is served from:
 * the GitHub Pages deploy uses "/Gur" (https://ubejdmo.github.io/Gur/); local builds use the root.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const baseUrl = process.env.EXPO_BASE_URL;
  return {
    ...config,
    name: config.name ?? 'Gur',
    slug: config.slug ?? 'gur',
    experiments: { ...config.experiments, ...(baseUrl ? { baseUrl } : {}) },
  };
};
