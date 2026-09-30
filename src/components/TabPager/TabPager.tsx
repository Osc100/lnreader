import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Column,
  HorizontalPager,
  RNHostView,
  type HorizontalPagerHandle,
} from '@expo/ui/jetpack-compose';
import {
  fillMaxSize,
  fillMaxWidth,
  padding,
  weight,
} from '@expo/ui/jetpack-compose/modifiers';
import { useTheme } from '@hooks/persisted/useTheme';
import AppHost from '../AppHost/AppHost';
import { SegmentedControl } from '../SegmentedControl';
import TopTabBar, { type TopTab } from '../TopTabBar/TopTabBar';

export interface TabPagerProps {
  tabs: readonly TopTab<number>[];
  index: number;
  onIndexChange: (index: number) => void;
  /** React Native content for the page at `index`, mounted on first visit. */
  renderPage: (index: number) => ReactNode;
  showCounts?: boolean;
  swipeEnabled?: boolean;
  /** A full-width segmented control instead of chips, for a few fixed tabs. */
  segmented?: boolean;
}

const TabPager = ({
  tabs,
  index,
  onIndexChange,
  renderPage,
  showCounts,
  swipeEnabled = true,
  segmented = false,
}: TabPagerProps) => {
  const theme = useTheme();
  const pager = useRef<HorizontalPagerHandle>(null);
  const pagerIndex = useRef(index);
  const [visited, setVisited] = useState<ReadonlySet<number>>(
    () => new Set([index]),
  );

  const visit = (page: number) =>
    setVisited(pages => (pages.has(page) ? pages : new Set(pages).add(page)));
  if (!visited.has(index)) {
    setVisited(new Set(visited).add(index));
  }

  useEffect(() => {
    if (pagerIndex.current !== index) {
      pagerIndex.current = index;
      void pager.current?.animateScrollToPage(index);
    }
  }, [index]);

  return (
    <AppHost style={styles.fill}>
      <Column modifiers={[fillMaxSize()]}>
        {tabs.length && segmented ? (
          <SegmentedControl
            options={tabs.map(tab => ({
              value: tab.key,
              label:
                showCounts && tab.count !== undefined
                  ? `${tab.label}  ${tab.count}`
                  : tab.label,
            }))}
            value={index}
            onChange={onIndexChange}
            theme={theme}
            modifiers={[fillMaxWidth(), padding(16, 4, 16, 8)]}
          />
        ) : tabs.length ? (
          <TopTabBar
            tabs={tabs}
            selectedKey={index}
            onSelect={onIndexChange}
            showCounts={showCounts}
          />
        ) : null}
        <HorizontalPager
          ref={pager}
          initialPage={index}
          userScrollEnabled={swipeEnabled}
          onCurrentPageChange={visit}
          onSettledPageChange={page => {
            if (pagerIndex.current !== page) {
              pagerIndex.current = page;
              onIndexChange(page);
            }
          }}
          modifiers={[fillMaxWidth(), weight(1)]}
        >
          {tabs.map((tab, page) => (
            <RNHostView key={tab.key}>
              <View style={styles.fill}>
                {visited.has(page) ? renderPage(page) : null}
              </View>
            </RNHostView>
          ))}
        </HorizontalPager>
      </Column>
    </AppHost>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

export default TabPager;
