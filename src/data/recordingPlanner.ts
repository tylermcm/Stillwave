import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { AppPreferences, Channel, Programme } from '../types';
import { captureWindow, preferences } from '../core/preferences';

export interface RecordingPlan {
  id: string; channelId: string; channelName: string; title: string; start: number; stop: number;
  description?: string; episode?: string; seriesId?: string; recordingId: string; error: string;
  status: 'scheduled' | 'starting' | 'recording' | 'completed' | 'interrupted' | 'failed' | 'conflict' | 'missed' | 'cancelled';
  captureStart?: number; captureStop?: number; paddingBefore?: number; paddingAfter?: number;
}
export interface SeriesRule { id: string; channelId: string; channelName: string; title: string; description?: string; paddingBefore?: number; paddingAfter?: number }
interface PlannerModule {
  schedule(serialized: string): Promise<string>; plans(): Promise<string>; cancel(id: string): Promise<void>;
  rules(): Promise<string>; addRule(serialized: string): Promise<string>; removeRule(id: string): Promise<void>;
  restore(): Promise<void>; precise(): boolean; storage(): Promise<{ totalBytes: number; freeBytes: number }>;
}
const native = Platform.OS === 'android' && Number(Platform.Version) >= 26 ? requireOptionalNativeModule<PlannerModule>('StillwaveRecordingPlanner') : null;
export const recordingPlanner = native ? {
  precise: () => native.precise(),
  restore: () => native.restore(),
  storage: () => native.storage(),
  plans: async (): Promise<RecordingPlan[]> => JSON.parse(await native.plans()),
  cancel: (id: string) => native.cancel(id),
  rules: async (): Promise<SeriesRule[]> => JSON.parse(await native.rules()),
  addRule: async (channel: Channel, programme: Programme, padding?: Partial<AppPreferences>): Promise<SeriesRule> => JSON.parse(await native.addRule(JSON.stringify({ channelId: channel.id, channelName: channel.name, title: programme.title, description: programme.description, paddingBefore: preferences(padding).paddingBefore, paddingAfter: preferences(padding).paddingAfter }))),
  removeRule: (id: string) => native.removeRule(id),
  schedule: async (channel: Channel, programme: Programme, seriesId?: string, retry = false, padding?: Partial<AppPreferences>): Promise<RecordingPlan> => JSON.parse(await native.schedule(JSON.stringify({
    channelId: channel.id, channelName: channel.name, url: channel.url, headers: channel.headers, title: programme.title,
    start: programme.start, stop: programme.stop, description: programme.description, episode: programme.episode, seriesId, retry,
    paddingBefore: preferences(padding).paddingBefore, paddingAfter: preferences(padding).paddingAfter,
    ...captureWindow(programme, preferences(padding)),
  }))),
} : null;
