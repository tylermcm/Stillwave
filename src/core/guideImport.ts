import { Gunzip } from 'fflate';
import type { Channel, Guide } from '../types';
import { createXmltvParser } from './xmltv';

export const GUIDE_LIMITS = { compressed: 80 * 1024 * 1024, expanded: 768 * 1024 * 1024 };

/** Parse large country feeds without materializing their expanded XML string. */
export async function importGuideBytes(chunks: AsyncIterable<Uint8Array>, channels: Channel[], mappings: Record<string, string> = {}, now = Date.now(), limits = GUIDE_LIMITS): Promise<Guide> {
  const parser = createXmltvParser(channels, mappings, now);
  const decoder = new TextDecoder();
  let received = 0, expanded = 0, sinceYield = 0;
  let pending: Uint8Array = new Uint8Array(0), gzip: boolean | undefined;
  const consume = (bytes: Uint8Array) => {
    expanded += bytes.length;
    if (expanded > limits.expanded) throw new Error('The expanded guide is too large. Choose a smaller guide.');
    parser.write(decoder.decode(bytes, { stream: true }));
  };
  const unzip = new Gunzip(consume);
  for await (let bytes of chunks) {
    received += bytes.length;
    if (received > limits.compressed) throw new Error('This feed is too large. Choose a smaller guide.');
    if (gzip === undefined) {
      if (pending.length) { const joined = new Uint8Array(pending.length + bytes.length); joined.set(pending); joined.set(bytes, pending.length); bytes = joined; }
      if (bytes.length < 2) { pending = bytes; continue; }
      pending = new Uint8Array(0);
      gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
    }
    // Small inflater pushes prevent a single compressed chunk from expanding
    // hundreds of megabytes before its limit can be checked.
    for (let offset = 0; offset < bytes.length; offset += 1024) {
      const part = bytes.subarray(offset, offset + 1024);
      if (gzip) unzip.push(part, false); else consume(part);
      sinceYield += part.length;
      if (sinceYield >= 32_768) { sinceYield = 0; await new Promise(resolve => setTimeout(resolve, 0)); }
    }
  }
  if (gzip) unzip.push(new Uint8Array(0), true);
  else if (pending.length) consume(pending);
  parser.write(decoder.decode());
  return parser.finish();
}

const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const date = (ms: number) => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000';

/** Keep the station catalog for manual assignment, but cache only relevant shows. */
export function serializeGuide(guide: Guide): string {
  const rows = ['<?xml version="1.0" encoding="UTF-8"?><tv>'];
  for (const [id, names] of Object.entries(guide.channels)) rows.push(`<channel id="${escapeXml(id)}">${names.map(name => `<display-name>${escapeXml(name)}</display-name>`).join('')}</channel>`);
  for (const programmes of Object.values(guide.programmes)) for (const p of programmes) rows.push(`<programme channel="${escapeXml(p.channelId)}" start="${date(p.start)}" stop="${date(p.stop)}"><title>${escapeXml(p.title)}</title>${p.description ? `<desc>${escapeXml(p.description)}</desc>` : ''}${p.episode ? `<episode-num system="onscreen">${escapeXml(p.episode)}</episode-num>` : ''}</programme>`);
  rows.push('</tv>');
  return rows.join('\n');
}
