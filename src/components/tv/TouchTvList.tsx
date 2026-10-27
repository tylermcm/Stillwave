import { useEffect, useRef, type ReactElement } from 'react';
import { FlatList, Platform } from 'react-native';

/** Native drag/momentum scrolling; selecting an offscreen row still reveals it. */
export function TouchTvList<T>({ data, selected, rowHeight, scale, renderRow, keyFor, testID }: {
  data: T[]; selected: number; rowHeight: number; scale: number; renderRow: (item: T, index: number, markTouchSelection?: () => void) => ReactElement;
  keyFor: (item: T) => string; testID: string;
}) {
  const list = useRef<FlatList<T>>(null);
  const touchSelection = useRef<number | undefined>(undefined);
  const viewport = useRef({ offset: 0, height: 0 });
  useEffect(() => {
    const touched = touchSelection.current;
    touchSelection.current = undefined;
    if (touched === selected) return;
    if (!data.length || selected < 0 || selected >= data.length) return;
    const { offset, height } = viewport.current;
    if (!height) {
      list.current?.scrollToOffset({ offset: selected * rowHeight, animated: false });
      return;
    }
    if (selected * rowHeight < offset || (selected + 1) * rowHeight > offset + height) {
      list.current?.scrollToIndex({ index: selected, animated: true, viewPosition: .5 });
    }
  }, [selected, rowHeight]);
  return <FlatList ref={list} testID={testID} tabIndex={0} data={data} extraData={renderRow} style={{ flex: 1 }}
    keyExtractor={keyFor} renderItem={({ item, index }) => renderRow(item, index, () => { touchSelection.current = index; })}
    getItemLayout={(_, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
    onLayout={event => { viewport.current.height = event.nativeEvent.layout.height / (Platform.OS === 'web' ? scale : 1); }}
    onScroll={event => {
      // Scroll measurements use content coordinates even when the TV canvas is
      // scaled down. Web onLayout can instead report the transformed height.
      viewport.current = { offset: event.nativeEvent.contentOffset.y, height: event.nativeEvent.layoutMeasurement.height };
    }} scrollEventThrottle={16}
    initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
    nestedScrollEnabled directionalLockEnabled decelerationRate="normal"
    keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator />;
}
