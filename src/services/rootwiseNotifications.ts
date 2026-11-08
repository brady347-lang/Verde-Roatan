import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';

type RootWiseSound =
  | 'signature'
  | 'plantIdentified'
  | 'careReminder'
  | 'importantAlert'
  | 'knowledgeUpdate'
  | 'savedSuccess';

const CHANNELS: Record<RootWiseSound, { id: string; name: string; sound: string }> = {
  signature: { id: 'rootwise_signature_v1', name: 'RootWise updates', sound: '01_rootwise_signature' },
  plantIdentified: { id: 'rootwise_plant_identified_v1', name: 'Plant identified', sound: '02_plant_identified' },
  careReminder: { id: 'rootwise_care_reminder_v1', name: 'Landscape care reminders', sound: '03_landscape_care_reminder' },
  importantAlert: { id: 'rootwise_important_alert_v1', name: 'Important alerts', sound: '04_important_alert' },
  knowledgeUpdate: { id: 'rootwise_knowledge_update_v1', name: 'Botanical Knowledge Center', sound: '05_knowledge_center_update' },
  savedSuccess: { id: 'rootwise_saved_success_v1', name: 'Saved successfully', sound: '06_saved_success' }
};

let channelsReady = false;
let permissionGranted = false;

async function prepareNotifications(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') {
      permission = await LocalNotifications.requestPermissions();
    }
    if (permission.display !== 'granted') return false;
    permissionGranted = true;

    if (Capacitor.getPlatform() === 'android' && !channelsReady) {
      for (const channel of Object.values(CHANNELS)) {
        await LocalNotifications.createChannel({
          id: channel.id,
          name: channel.name,
          description: channel.name,
          importance: 4,
          sound: channel.sound,
          visibility: 1
        });
      }
      channelsReady = true;
    }
    return true;
  } catch (error) {
    console.warn('RootWise native notifications are unavailable.', error);
    return false;
  }
}

export async function notifyRootWise(
  sound: RootWiseSound,
  title: string,
  body: string
): Promise<void> {
  if (!await prepareNotifications()) return;
  const channel = CHANNELS[sound];
  const notification: LocalNotificationSchema = {
    id: Date.now() % 2147483000,
    title,
    body,
    schedule: { at: new Date(Date.now() + 500) },
    channelId: channel.id,
    smallIcon: 'ic_stat_icon_config_sample',
    extra: { source: 'rootwise', sound }
  };
  try {
    await LocalNotifications.schedule({ notifications: [notification] });
  } catch (error) {
    console.warn('Could not schedule RootWise notification.', error);
  }
}

export const rootWiseNotificationSounds = Object.freeze({
  plantIdentified: (plantName: string, language: 'en' | 'es' = 'en') =>
    notifyRootWise('plantIdentified', language === 'es' ? 'Planta identificada' : 'Plant identified', plantName),
  savedSuccess: (itemName: string, language: 'en' | 'es' = 'en') =>
    notifyRootWise('savedSuccess', language === 'es' ? 'Guardado correctamente' : 'Saved successfully', itemName),
  careReminder: (message: string, language: 'en' | 'es' = 'en') =>
    notifyRootWise('careReminder', language === 'es' ? 'Recordatorio de cuidado' : 'Landscape care reminder', message),
  importantAlert: (message: string, language: 'en' | 'es' = 'en') =>
    notifyRootWise('importantAlert', language === 'es' ? 'Alerta importante' : 'Important RootWise alert', message),
  knowledgeUpdate: (message: string, language: 'en' | 'es' = 'en') =>
    notifyRootWise('knowledgeUpdate', language === 'es' ? 'Centro de conocimiento actualizado' : 'Botanical Knowledge Center updated', message)
});
