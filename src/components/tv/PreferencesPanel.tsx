import type { AppPreferences } from '../../types';
import { PADDING_MINUTES } from '../../core/preferences';
import { OptionsPanel } from './OptionsPanel';

export function PreferencesPanel({ value, onChange, onClose }: { value: AppPreferences; onChange: (value: AppPreferences) => void; onClose: () => void }) {
  const nextPadding = (current: number) => PADDING_MINUTES[(PADDING_MINUTES.indexOf(current as never) + 1) % PADDING_MINUTES.length]!;
  return <OptionsPanel title="Preferences" description="Saved on this device. Padding applies to new recordings and series rules. Existing schedules keep their capture times." onClose={onClose} actions={[
    ...(['compact', 'comfortable', 'large'] as const).map(guideSize => ({ label: `${value.guideSize === guideSize ? '✓ ' : ''}Guide size · ${guideSize === 'large' ? 'Large Text' : guideSize === 'compact' ? 'Compact' : 'Comfortable'}`, run: () => onChange({ ...value, guideSize }) })),
    ...(['guide', 'favorites', 'lastChannel'] as const).map(startup => ({ label: `${value.startup === startup ? '✓ ' : ''}Open app to · ${startup === 'guide' ? 'Guide' : startup === 'favorites' ? 'Favorites' : 'Play last channel'}`, run: () => onChange({ ...value, startup }) })),
    { label: `Start recording early · ${value.paddingBefore} min (change)`, run: () => onChange({ ...value, paddingBefore: nextPadding(value.paddingBefore) }) },
    { label: `Finish recording late · ${value.paddingAfter} min (change)`, run: () => onChange({ ...value, paddingAfter: nextPadding(value.paddingAfter) }) },
  ]} />;
}
