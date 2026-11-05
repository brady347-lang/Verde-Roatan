import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.verderoatan.plantintelligence',
  appName: 'Verde Roatán',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    // Android 15+ draws apps edge-to-edge under the status and gesture bars. Make the WebView keep
    // clear of them. Spread so older @capacitor/cli typings (without this option) still compile.
    ...({ adjustMarginsForEdgeToEdge: 'force' } as Record<string, unknown>)
  }
};

export default config;
