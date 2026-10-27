import test from 'node:test';
import assert from 'node:assert/strict';
import { guideWindow, moveGuide, programmeAt, type TvGuideRow } from '../src/core/tvGuide';
import { recordingConflict, recordingMatchesProgramme, seriesEpisodes, tvDvrItems } from '../src/core/tvDvr';
import type { RecordingPlan } from '../src/data/recordingPlanner';
const minute = 60_000;
const channel = { id: 'one', name: 'One', number: '11', url: 'https://example.com/live.m3u8', group: 'News', headers: {}, kind: 'hls' as const };
const programme = { channelId: 'guide-one', title: 'A show', start: 60 * minute, stop: 90 * minute };
const rows: TvGuideRow[] = [
  { channel, number: '11', programmes: [programme, { ...programme, start: 90 * minute, stop: 120 * minute }] },
  { channel: { ...channel, id: 'two' }, number: '12', programmes: [{ ...programme, start: 0, stop: 120 * minute }] },
];
test('guide vertical navigation keeps its focused time and horizontal movement follows actual program lengths', () => {
  const cursor = { channel: 0, programme: 1, rowTop: 0, windowStart: 60 * minute };
  assert.equal(moveGuide(cursor, rows, 0, 1).programme, 0);
  assert.equal(moveGuide(moveGuide(cursor, rows, 0, 1), rows, 0, -1).programme, 0);
  assert.equal(moveGuide(cursor, rows, -1, 0).programme, 0);
  assert.equal(programmeAt(rows[0]!.programmes, 100 * minute), 1);
});
test('guide scrolls to offscreen rows and future shows without losing a long program title', () => {
  const expanded = Array.from({length: 40}, (_, i) => ({ ...rows[0]!, channel: { ...channel, id: String(i) }, programmes: [{ ...programme, start: 8 * 3600_000, stop: 12 * 3600_000 }] }));
  const cursor = guideWindow({channel: 32, programme: 0, rowTop: 0, windowStart: 0}, expanded);
  assert.equal(cursor.rowTop, 27);
  assert.equal(cursor.windowStart, 8 * 3600_000);
});
const plan: RecordingPlan = { id:'plan', channelId:'one',channelName:'One',title:'A show',start:programme.start,stop:programme.stop,status:'scheduled',recordingId:'',error:'' };
test('series uses real guide episodes, keeps cancellations, and never duplicates an already queued episode', () => {
  const rules = [{ id:'rule',channelId:'one',channelName:'One',title:' a SHOW ' }];
  const cancelled = { ...plan, status:'cancelled' as const };
  const queued = seriesEpisodes(rules, rows, [cancelled], 0);
  assert.equal(queued.length, 1);
  assert.equal(queued[0]?.programme.start, 90 * minute);
  assert.equal(queued[0]?.ruleId, 'rule');
});
test('DVR conflict message follows the native single-recording limit and actual deadline', () => {
  const record = { id:'record',channel:'Other',channelId:'other',title:'Live game',createdAt:0,status:'recording' as const,note:'',duration:60,bytes:100,position:0,stopAt:100 * minute };
  assert.match(recordingConflict([record],[plan],50 * minute)!,/before Live game ends/);
  assert.match(recordingConflict([{...record,channelId:'one'}],[plan],50 * minute)!,/Only one stream/);
  assert.equal(recordingConflict([{...record,stopAt:30 * minute}],[plan],20 * minute),undefined);
});
test('DVR lists show real resume position, recording state, failed schedules, and hide cancellations', () => {
  const record = {id:'saved',channel:'One',title:'A show',createdAt:Date.now(),status:'completed' as const,note:'',duration:3600,bytes:1_000_000_000,position:1800};
  const saved = tvDvrItems('recordings',[record],[],[],Date.now())[0]!;
  assert.equal(saved.progress,0.5); assert.equal(saved.description,'Stopped at 30 min.'); assert.equal(saved.kind,'saved');
  const scheduled = tvDvrItems('scheduled',[],[{...plan,status:'cancelled'},{...plan,id:'failed',status:'failed',error:'Offline'}],[],0);
  assert.equal(scheduled.length,1); assert.equal(scheduled[0]?.description,'Offline');
});
test('a live recording marks only its actual episode, never future episodes sharing the same title', () => {
  const record = { id:'record',channel:'One',channelId:'one',title:'A show',createdAt:0,status:'recording' as const,note:'',duration:60,bytes:100,position:0,programmeStart:programme.start };
  assert.equal(recordingMatchesProgramme(record,'one',programme,70*minute),true);
  assert.equal(recordingMatchesProgramme(record,'one',{...programme,start:90*minute,stop:120*minute},70*minute),false);
  assert.equal(recordingMatchesProgramme({...record,programmeStart:0},'one',{...programme,title:'New show'},70*minute),true);
});
