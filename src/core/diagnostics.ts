export interface PlaybackEvidence {
  online: boolean;
  error?: string;
  state: string;
  bufferSeconds: number | null;
  stalledMs: number;
  eventLoopDelayMs: number;
  hasProgress: boolean;
}

export interface Diagnosis {
  area: 'source' | 'connection' | 'playback' | 'app' | 'unknown' | 'healthy';
  confidence: 'observed' | 'likely' | 'uncertain';
  title: string;
  explanation: string;
  action: string;
  evidence: string[];
}

export function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[address hidden]')
    .replace(/\b(authorization|cookie)\s*[:=]\s*[^\r\n]+/gi, '$1=[hidden]')
    .replace(/\b(username|user|password|pass|token|key|secret|signature)\s*[:=]\s*[^&\s;]+/gi, '$1=[hidden]')
    .slice(0, 600);
}

export function diagnosePlayback(input: PlaybackEvidence): Diagnosis {
  const error = input.error ?? '';
  const code = /\b(401|403|404|410|429|5\d{2})\b/.exec(error)?.[1];
  const evidence = [
    `Phone connection: ${input.online ? 'connected (does not prove the channel server is reachable)' : 'offline reported by the phone'}`,
    `Player state: ${input.state}`,
    `Video buffered: ${input.bufferSeconds === null ? 'not reported' : `${Math.round(input.bufferSeconds)} seconds`}`,
    `Playback clock unchanged for ${Math.floor(input.stalledMs / 1000)} seconds`,
    `App timer delay: ${Math.round(input.eventLoopDelayMs)} ms`,
    ...(error ? [`Player reported: ${sanitizeDiagnosticText(error)}`] : []),
  ];
  const report = (area: Diagnosis['area'], confidence: Diagnosis['confidence'], title: string, explanation: string, action: string): Diagnosis => ({ area, confidence, title, explanation, action, evidence });
  if (!input.online) return report('connection', 'observed', 'Your phone is offline', 'The phone reports that it has no internet connection.', 'Reconnect to Wi-Fi or mobile data. Playback will try again when the connection returns.');
  if (code === '401' || code === '403') return report('source', 'observed', 'The channel server refused access', `The server returned HTTP ${code}. The address may require a valid login, subscription, or permission for your location.`, 'Refresh your playlist and check the provider account. This response alone cannot tell us why access was refused.');
  if (code === '404' || code === '410') return report('source', 'observed', 'The channel address is missing', `The server returned HTTP ${code}: there is no stream at the requested address.`, 'Refresh your playlist or try another stream for this channel.');
  if (code === '429') return report('source', 'observed', 'The server asked us to slow down', 'The server returned HTTP 429, meaning it is limiting requests.', 'Wait before retrying. Check whether another device is using the same provider account.');
  if (code?.startsWith('5')) return report('source', 'observed', 'The channel server reported a problem', `The server or its delivery service returned HTTP ${code}.`, 'Try another channel and retry this one later.');
  if (/ssl|tls|certificate|secure connection/i.test(error)) return report('connection', 'observed', 'A secure connection could not be made', 'The player reported a certificate or secure-connection failure. The server, phone date, or network could be involved.', 'Check your phone’s date and try another network. We will not bypass certificate checks.');
  if (/unsupported|not supported|unrecognized.*format|no.*decoder/i.test(error)) return report('playback', 'observed', 'This phone cannot play this stream format', 'The native player reported an unsupported format or missing decoder.', 'Try an HLS (.m3u8) version or a different codec/quality from your provider.');
  if (/decoder|codec|renderer|stuckplayer/i.test(error)) return report('playback', 'likely', 'The video playback engine hit a problem', 'The phone’s decoder or player reported an error. This can be an app/player issue, a device limitation, or damaged video from the source.', 'Restart playback. If it repeats across working channels, the app or phone needs investigation.');
  if (input.eventLoopDelayMs >= 1500) return report('app', 'observed', 'The app’s controls were slow to respond', 'A foreground app timer ran late. The app or phone was busy; this is evidence of a responsiveness problem, not proof of a channel outage.', 'Close and reopen the player. If this happens during guide imports or across channels, report it as an app performance issue.');
  if (input.stalledMs >= 20_000 && (input.bufferSeconds ?? 0) >= 5) return report('playback', 'likely', 'The player may be stuck', 'The playback clock stopped even though the player reports video already buffered. The playback engine or decoder may be struggling.', 'We will restart the player. A moving audio clock can still hide frozen video; this check cannot inspect every decoded frame.');
  if (input.stalledMs >= 20_000 || error.length > 0) return report('unknown', 'uncertain', 'The channel could not play', 'There is not enough evidence to separate a slow channel server, an internet problem, or a player failure.', 'Try the server-response check, a different channel, then another network. If many known-working channels fail while other apps play them, investigate this app.');
  if (input.hasProgress && input.state === 'readyToPlay' && input.stalledMs < 4000) return report('healthy', 'observed', 'Playback is moving', 'The playback clock advanced in the last few seconds. This does not guarantee that every video frame or audio sample is healthy.', 'If the picture is frozen while audio continues, try Go live and report a playback problem.');
  return report('unknown', 'uncertain', 'Still checking the stream', 'The player is opening the channel or building a buffer. We do not have enough evidence to identify a problem yet.', 'Give it a moment. You can inspect this view again if playback does not start.');
}
