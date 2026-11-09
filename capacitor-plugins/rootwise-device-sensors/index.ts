import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface RootWiseDeviceSensorsPlugin {
  startAmbientLight(): Promise<void>;
  stopAmbientLight(): Promise<void>;
  startCompass(): Promise<void>;
  stopCompass(): Promise<void>;
  openLocationSettings(): Promise<void>;
  addListener(eventName: 'lightReading', listenerFunc: (event: { lux: number }) => void): Promise<PluginListenerHandle>;
  /** Emitted when the native layer could not re-register the light sensor after the app resumed. */
  addListener(eventName: 'compassReading', listenerFunc: (event: { heading: number; pitch: number; roll: number; accuracy: number }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'lightSensorError', listenerFunc: (event: { message: string }) => void): Promise<PluginListenerHandle>;
}

export const RootWiseDeviceSensors = registerPlugin<RootWiseDeviceSensorsPlugin>('RootWiseDeviceSensors');
