import { SaxesParser } from 'saxes';

export type CatalogStation = { site: string; site_id: string; xmltv_id: string; lang: string; name: string };
export function parseStationCatalog(xml: string): CatalogStation[] {
  const rows: CatalogStation[] = [];
  const parser = new SaxesParser({ xmlns: false });
  let current: CatalogStation | undefined;
  parser.on('doctype', () => { throw new Error('Catalog document types are unsupported.'); });
  parser.on('opentag', tag => {
    if (tag.name !== 'channel') return;
    current = { site: String(tag.attributes.site ?? ''), site_id: String(tag.attributes.site_id ?? ''), xmltv_id: String(tag.attributes.xmltv_id ?? ''), lang: String(tag.attributes.lang ?? ''), name: '' };
  });
  parser.on('text', text => { if (current) current.name += text; });
  parser.on('closetag', tag => { if (tag.name === 'channel' && current) { rows.push(current); current = undefined; } });
  parser.write(xml).close();
  return rows;
}
