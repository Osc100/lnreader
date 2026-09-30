import React, { useMemo, useState } from 'react';
import { Column, Row } from '@expo/ui/jetpack-compose';
import {
  fillMaxWidth,
  padding,
  weight,
} from '@expo/ui/jetpack-compose/modifiers';

import { useLibrarySettings, useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import { Checkbox, SortItem } from '@components/Checkbox/Checkbox';
import {
  DisplayModes,
  displayModesList,
  LibraryFilter,
  libraryFilterList,
  LibrarySortOrder,
  librarySortOrderList,
} from '@screens/library/constants/constants';
import { RadioButton } from '@components/RadioButton/RadioButton';
import BottomSheet from '@components/BottomSheet/BottomSheet';
import { AppText, Slider, TopTabBar } from '@components';

interface LibraryBottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

const FirstRoute = () => {
  const theme = useTheme();
  const {
    filter,
    setLibrarySettings,
    downloadedOnlyMode = false,
  } = useLibrarySettings();

  return (
    <Column modifiers={[fillMaxWidth()]}>
      {libraryFilterList.map(item => (
        <Checkbox
          key={`filter_${item.filter}`}
          label={item.label}
          status={filter === item.filter}
          onPress={() =>
            setLibrarySettings({
              filter: filter === item.filter ? undefined : item.filter,
            })
          }
          disabled={
            item.filter === LibraryFilter.Downloaded && downloadedOnlyMode
          }
          theme={theme}
        />
      ))}
    </Column>
  );
};

const SecondRoute = () => {
  const theme = useTheme();
  const { sortOrder = LibrarySortOrder.DateAdded_DESC, setLibrarySettings } =
    useLibrarySettings();

  return (
    <Column modifiers={[fillMaxWidth()]}>
      {librarySortOrderList.map((item, index) => (
        <SortItem
          key={`sort_${index}_${item.ASC}`}
          label={item.label}
          status={
            sortOrder === item.ASC
              ? 'asc'
              : sortOrder === item.DESC
              ? 'desc'
              : undefined
          }
          onPress={() =>
            setLibrarySettings({
              sortOrder: sortOrder === item.ASC ? item.DESC : item.ASC,
            })
          }
          theme={theme}
        />
      ))}
    </Column>
  );
};

const ThirdRoute = () => {
  const theme = useTheme();
  const {
    showDownloadBadges = true,
    showNumberOfNovels = false,
    showUnreadBadges = true,
    showContinueReadingButton = false,
    displayMode = DisplayModes.Comfortable,
    novelsPerRow = 3,
    setLibrarySettings,
  } = useLibrarySettings();

  const sectionHeader = (title: string) => (
    <AppText
      variant="labelLarge"
      color={theme.onSurfaceVariant}
      modifiers={[padding(16, 12, 16, 4)]}
    >
      {title}
    </AppText>
  );

  return (
    <Column modifiers={[fillMaxWidth()]}>
      {sectionHeader(getString('libraryScreen.bottomSheet.display.overlays'))}
      <Checkbox
        label={getString('libraryScreen.bottomSheet.display.downloadBadges')}
        status={showDownloadBadges}
        onPress={() =>
          setLibrarySettings({
            showDownloadBadges: !showDownloadBadges,
          })
        }
        theme={theme}
      />
      <Checkbox
        label={getString('libraryScreen.bottomSheet.display.unreadBadges')}
        status={showUnreadBadges}
        onPress={() =>
          setLibrarySettings({
            showUnreadBadges: !showUnreadBadges,
          })
        }
        theme={theme}
      />
      <Checkbox
        label={getString('libraryScreen.bottomSheet.display.showNoOfItems')}
        status={showNumberOfNovels}
        onPress={() =>
          setLibrarySettings({
            showNumberOfNovels: !showNumberOfNovels,
          })
        }
        theme={theme}
      />
      <Checkbox
        label={getString(
          'libraryScreen.bottomSheet.display.continueReadingButton',
        )}
        status={showContinueReadingButton}
        onPress={() =>
          setLibrarySettings({
            showContinueReadingButton: !showContinueReadingButton,
          })
        }
        theme={theme}
      />
      {sectionHeader(
        getString('libraryScreen.bottomSheet.display.displayMode'),
      )}
      {displayModesList.map(item => (
        <RadioButton
          key={`display_mode_${item.value}`}
          label={item.label}
          status={displayMode === item.value}
          onPress={() => setLibrarySettings({ displayMode: item.value })}
          theme={theme}
        />
      ))}
      {displayMode !== DisplayModes.List ? (
        <Column modifiers={[fillMaxWidth(), padding(16, 8, 16, 8)]}>
          <Row modifiers={[fillMaxWidth()]}>
            <AppText
              variant="bodyMedium"
              color={theme.onSurfaceVariant}
              modifiers={[weight(1)]}
            >
              {getString('generalSettingsScreen.itemsPerRowLibrary')}
            </AppText>
            <AppText variant="labelLarge">{String(novelsPerRow)}</AppText>
          </Row>
          <Slider
            value={novelsPerRow}
            min={1}
            max={5}
            step={1}
            showStops
            onSlidingComplete={value =>
              setLibrarySettings({ novelsPerRow: value })
            }
          />
        </Column>
      ) : null}
    </Column>
  );
};

const LibraryBottomSheet: React.FC<LibraryBottomSheetProps> = ({
  visible,
  onDismiss,
}) => {
  const [index, setIndex] = useState(0);
  const routes = useMemo(
    () => [
      { key: 'first', title: getString('common.filter') },
      { key: 'second', title: getString('common.sort') },
      { key: 'third', title: getString('common.display') },
    ],
    [],
  );

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss}>
      <TopTabBar
        tabs={routes.map((route, i) => ({ key: i, label: route.title }))}
        selectedKey={index}
        onSelect={setIndex}
      />
      {routes[index].key === 'first' ? <FirstRoute /> : null}
      {routes[index].key === 'second' ? <SecondRoute /> : null}
      {routes[index].key === 'third' ? <ThirdRoute /> : null}
    </BottomSheet>
  );
};

export default LibraryBottomSheet;
