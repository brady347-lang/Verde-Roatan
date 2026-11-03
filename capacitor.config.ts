import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.verderoatan.plantintelligence',
  appName: 'Verde Roatán',
  webDir: 'dist',
  android: {
    allowMixedContent: false
  }
};

export default config;
