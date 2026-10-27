import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { DvrSnapshot, Recording } from '../core/dvr';

interface DvrModule {
  open(owner: string, channelId: string, name: string, url: string, headers: Record<string, string>): Promise<DvrSnapshot>;
  release(owner: string): void;
  snapshot(id: string): Promise<DvrSnapshot>;
  tuningConflict(id: string): Promise<string | null>;
  startRecording(id: string, title: string, stopAt: number): Promise<Recording>;
  stopRecording(id: string): Promise<void>;
  listRecordings(): Promise<Recording[]>;
  recordingSource(id: string): Promise<Recording & { uri: string }>;
  savePosition(id: string, seconds: number): Promise<void>;
  deleteRecording(id: string): Promise<void>;
}

export const dvr = Platform.OS === 'android' && Number(Platform.Version) >= 26 ? requireOptionalNativeModule<DvrModule>('StillwaveDvr') : null;
export const dvrUnavailableReason = Platform.OS === 'android'
  ? Number(Platform.Version) < 26 ? 'Local DVR needs Android 8 or newer. This channel can still play normally.' : 'Local DVR is not included in this build.'
  : 'Local DVR is available in the Android APK. Web and iOS playback do not record yet.';
