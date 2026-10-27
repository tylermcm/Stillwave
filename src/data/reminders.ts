import { PermissionsAndroid, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { ProgramReminder } from '../types';

interface RemindersModule {
  sync(serialized: string): Promise<void>;
  consumeChannel(): string | null;
  addListener(name: 'reminderOpen', listener: () => void): { remove(): void };
}
export const remindersNative = Platform.OS === 'android' ? requireOptionalNativeModule<RemindersModule>('StillwaveReminders') : null;
export async function requestReminderNotifications(): Promise<boolean> {
  if (!remindersNative) return false;
  return Number(Platform.Version) < 33 || await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) === PermissionsAndroid.RESULTS.GRANTED;
}
export async function syncReminders(reminders: ProgramReminder[]) {
  if (remindersNative) await remindersNative.sync(JSON.stringify(reminders));
}
