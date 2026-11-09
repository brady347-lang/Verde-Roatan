import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface RootWiseDeviceSensorsPlugin {
  startAmbientLight(): Promise<void>;
  stopAmbientLight(): Promise<void>;
  openLocationSettings(): Promise<void>;
  addListener(eventName: 'lightReading', listenerFunc: (event: { lux: number }) => void): Promise<PluginListenerHandle>;
  /** Emitted when the native layer could not re-register the light sensor after the app resumed. */
  addListener(eventName: 'lightSensorError', listenerFunc: (event: { message: string }) => void): Promise<PluginListenerHandle>;
}

export const RootWiseDeviceSensors = registerPlugin<RootWiseDeviceSensorsPlugin>('RootWiseDeviceSensors');
