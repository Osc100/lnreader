import React, { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { Column } from '@expo/ui/jetpack-compose';
import {
  fillMaxWidth,
  height,
  padding,
  verticalScroll,
  weight,
} from '@expo/ui/jetpack-compose/modifiers';

import { TopTabBar } from '@components';
import DisplayTab from '@screens/settings/SettingsReaderScreen/tabs/DisplayTab';
import NavigationTab from '@screens/settings/SettingsReaderScreen/tabs/NavigationTab';
import PaginationTab from '@screens/settings/SettingsReaderScreen/tabs/PaginationTab';
import AccessibilityTab from '@screens/settings/SettingsReaderScreen/tabs/AccessibilityTab';
import TTSTab from './TTSTab';

const routes = [
  { key: 'display', title: 'Display' },
  { key: 'navigation', title: 'Navigation' },
  { key: 'pagination', title: 'Pagination' },
  { key: 'accessibility', title: 'Accessibility' },
  { key: 'tts', title: 'TTS' },
];

// Share of the window the sheet takes when fully open. A fixed height keeps
// the tab row in place between tabs; the sheet opens half-way and each tab
// scrolls on its own.
const SHEET_HEIGHT = 0.85;

interface ReaderBottomSheetV2Props {
  /** Fill the available height (side panels) instead of a sheet's height. */
  fill?: boolean;
  bottomInset?: number;
}

const ReaderBottomSheetV2: React.FC<ReaderBottomSheetV2Props> = ({
  fill = false,
  bottomInset = 0,
}) => {
  const [index, setIndex] = useState(0);
  const { height: windowHeight } = useWindowDimensions();

  return (
    <Column
      modifiers={[
        fillMaxWidth(),
        fill ? weight(1) : height(Math.round(windowHeight * SHEET_HEIGHT)),
      ]}
    >
      <TopTabBar
        tabs={routes.map((route, i) => ({ key: i, label: route.title }))}
        selectedKey={index}
        onSelect={setIndex}
      />
      <Column
        modifiers={[
          fillMaxWidth(),
          weight(1),
          verticalScroll(),
          padding(0, 0, 0, bottomInset + 16),
        ]}
      >
        {/* Only the open tab is mounted – the TTS tab alone enumerates the
            device's engines and voices over the bridge. */}
        {routes[index].key === 'display' ? <DisplayTab inReaderSheet /> : null}
        {routes[index].key === 'navigation' ? <NavigationTab /> : null}
        {routes[index].key === 'pagination' ? <PaginationTab /> : null}
        {routes[index].key === 'accessibility' ? <AccessibilityTab /> : null}
        {routes[index].key === 'tts' ? <TTSTab /> : null}
      </Column>
    </Column>
  );
};

export default React.memo(ReaderBottomSheetV2);
