import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface RootWiseDeviceSensorsPlugin {
  startAmbientLight(): Promise<void>;
  stopAmbientLight(): Promise<void>;
  openLocationSettings(): Promise<void>;
  addListener(eventName: 'lightReading', listenerFunc: (event: { lux: number }) => void): Promise<PluginListenerHandle>;
}

export const RootWiseDeviceSensors = registerPlugin<RootWiseDeviceSensorsPlugin>('RootWiseDeviceSensors');
