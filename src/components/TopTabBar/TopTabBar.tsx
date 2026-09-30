import { Row } from '@expo/ui/jetpack-compose';
import {
  fillMaxWidth,
  horizontalScroll,
  padding,
} from '@expo/ui/jetpack-compose/modifiers';
import Chip from '../Chip/Chip';
import { useTheme } from '@hooks/persisted/useTheme';

export interface TopTab<K extends string | number> {
  key: K;
  label: string;
  count?: number;
}

function TopTabBar<K extends string | number>({
  tabs,
  selectedKey,
  onSelect,
  showCounts,
}: {
  tabs: readonly TopTab<K>[];
  selectedKey: K;
  onSelect: (key: K) => void;
  showCounts?: boolean;
}) {
  const theme = useTheme();
  return (
    <Row
      horizontalArrangement={{ spacedBy: 8 }}
      modifiers={[fillMaxWidth(), horizontalScroll(), padding(16, 4, 16, 8)]}
    >
      {tabs.map(tab => (
        <Chip
          key={String(tab.key)}
          label={
            showCounts && tab.count !== undefined
              ? `${tab.label}  ${tab.count}`
              : tab.label
          }
          selected={tab.key === selectedKey}
          onPress={() => onSelect(tab.key)}
          theme={theme}
        />
      ))}
    </Row>
  );
}

export default TopTabBar;
