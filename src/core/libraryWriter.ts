import type { Library } from '../types';

export type SnapshotName = 'channels' | 'guide' | 'guides' | 'library';

export function createLibraryWriter(write: (name: SnapshotName, data: unknown) => Promise<void>) {
  let queue = Promise.resolve();
  let savedChannels: Library['channels'] | undefined;
  let savedGuide: Library['guide'];
  let initializedGuide = false;
  let savedSources: Library['guideSources'];
  const save = (library: Library): Promise<void> => {
    queue = queue.catch(() => {}).then(async () => {
      // Favorites/settings should never serialize the entire EPG or playlist.
      if (savedChannels !== library.channels) {
        await write('channels', library.channels);
        savedChannels = library.channels;
      }
      if (!initializedGuide || savedGuide !== library.guide) {
        await write('guide', library.guide ?? null);
        savedGuide = library.guide;
        initializedGuide = true;
      }
      if (savedSources !== library.guideSources) {
        await write('guides', library.guideSources);
        savedSources = library.guideSources;
      }
      const { channels: _channels, guide: _guide, guideSources: _sources, ...metadata } = library;
      await write('library', metadata);
    });
    return queue;
  };
  save.seed = (library: Library) => {
    savedChannels = library.channels;
    savedGuide = library.guide;
    initializedGuide = true;
    savedSources = library.guideSources;
  };
  return save;
}
