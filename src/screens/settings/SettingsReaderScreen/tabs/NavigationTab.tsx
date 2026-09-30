import React from 'react';
import { useWindowDimensions } from 'react-native';
import { Column } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';
import defaultTo from 'lodash-es/defaultTo';
import { useChapterGeneralSettings, useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import { List, Button, SwitchItem, TextInput } from '@components/index';
import VolumeUpIcon from '@expo/material-symbols/volume_up.xml';
import HeightIcon from '@expo/material-symbols/height.xml';
import SwipeLeftIcon from '@expo/material-symbols/swipe_left.xml';
import TouchAppIcon from '@expo/material-symbols/touch_app.xml';
import AllInclusiveIcon from '@expo/material-symbols/all_inclusive.xml';
import AutoplayIcon from '@expo/material-symbols/autoplay.xml';

const NavigationTab: React.FC = () => {
  const theme = useTheme();
  const {
    useVolumeButtons = false,
    volumeButtonsOffset = null,
    verticalSeekbar = true,
    swipeGestures = false,
    autoScroll = false,
    autoScrollInterval = 10,
    autoScrollOffset = null,
    tapToScroll = false,
    continuousChapters = true,
    pageReader = false,
    setChapterGeneralSettings,
  } = useChapterGeneralSettings();

  const { height: screenHeight } = useWindowDimensions();

  const areAutoScrollSettingsDefault =
    autoScrollInterval === 10 && autoScrollOffset === null;

  return (
    <Column modifiers={[fillMaxWidth()]}>
      <Column modifiers={[fillMaxWidth()]}>
        <List.SubHeader theme={theme}>Navigation Controls</List.SubHeader>
        {/* Pages turn by taps and the volume keys; scrolling-only options are off. */}
        <SwitchItem
          label={getString(
            pageReader
              ? 'readerScreen.bottomSheet.volumeButtonsTurnPages'
              : 'readerScreen.bottomSheet.volumeButtonsScroll',
          )}
          icon={VolumeUpIcon}
          description={getString(
            pageReader
              ? 'readerScreen.bottomSheet.volumeButtonsTurnPagesDescription'
              : 'readerScreen.bottomSheet.volumeButtonsScrollDescription',
          )}
          value={useVolumeButtons}
          onPress={() =>
            setChapterGeneralSettings({ useVolumeButtons: !useVolumeButtons })
          }
          theme={theme}
        />
        {useVolumeButtons && !pageReader && (
          <Column modifiers={[fillMaxWidth(), padding(16, 4, 16, 8)]}>
            <TextInput
              label={getString('readerSettings.volumeButtonOffset')}
              keyboardType="number"
              value={defaultTo(
                volumeButtonsOffset
                  ? Math.round(volumeButtonsOffset / screenHeight)
                  : null,
                0.75,
              ).toString()}
              onChangeText={text => {
                if (!isNaN(Number(text))) {
                  setChapterGeneralSettings({
                    volumeButtonsOffset: Math.round(
                      Number(text) * screenHeight,
                    ),
                  });
                }
              }}
            />
          </Column>
        )}
        <SwitchItem
          label={getString('readerScreen.bottomSheet.verticalSeekbar')}
          icon={HeightIcon}
          description={getString(
            'readerScreen.bottomSheet.verticalSeekbarDescription',
          )}
          value={verticalSeekbar}
          onPress={() =>
            setChapterGeneralSettings({ verticalSeekbar: !verticalSeekbar })
          }
          theme={theme}
        />
        <SwitchItem
          label={getString('readerScreen.bottomSheet.swipeGestures')}
          icon={SwipeLeftIcon}
          description={getString(
            'readerScreen.bottomSheet.swipeGesturesDescription',
          )}
          value={swipeGestures}
          disabled={pageReader}
          onPress={() =>
            setChapterGeneralSettings({ swipeGestures: !swipeGestures })
          }
          theme={theme}
        />
        <SwitchItem
          label={getString(
            pageReader
              ? 'readerScreen.bottomSheet.tapToTurnPages'
              : 'readerScreen.bottomSheet.tapToScroll',
          )}
          icon={TouchAppIcon}
          description={getString(
            pageReader
              ? 'readerScreen.bottomSheet.tapToTurnPagesDescription'
              : 'readerScreen.bottomSheet.tapToScrollDescription',
          )}
          value={tapToScroll}
          onPress={() =>
            setChapterGeneralSettings({ tapToScroll: !tapToScroll })
          }
          theme={theme}
        />
        <SwitchItem
          label={getString('readerSettings.continuousChapters')}
          icon={AllInclusiveIcon}
          description={getString('readerSettings.continuousChaptersDesc')}
          value={continuousChapters}
          disabled={pageReader}
          onPress={() =>
            setChapterGeneralSettings({
              continuousChapters: !continuousChapters,
            })
          }
          theme={theme}
        />
      </Column>

      <Column modifiers={[fillMaxWidth()]}>
        <List.SubHeader theme={theme}>
          {getString('readerScreen.bottomSheet.autoscroll')}
        </List.SubHeader>
        <SwitchItem
          label={getString('readerScreen.bottomSheet.autoscroll')}
          icon={AutoplayIcon}
          description={getString(
            'readerScreen.bottomSheet.autoscrollDescription',
          )}
          value={autoScroll}
          disabled={pageReader}
          onPress={() => setChapterGeneralSettings({ autoScroll: !autoScroll })}
          theme={theme}
        />
        {autoScroll && !pageReader && (
          <>
            <Column modifiers={[fillMaxWidth(), padding(16, 4, 16, 8)]}>
              <TextInput
                label={getString('readerSettings.autoScrollInterval')}
                keyboardType="number"
                value={defaultTo(autoScrollInterval, 10).toString()}
                onChangeText={text => {
                  if (text) {
                    setChapterGeneralSettings({
                      autoScrollInterval: Number(text),
                    });
                  }
                }}
              />
            </Column>
            <Column modifiers={[fillMaxWidth(), padding(16, 4, 16, 8)]}>
              <TextInput
                label={getString('readerSettings.autoScrollOffset')}
                keyboardType="number"
                value={defaultTo(
                  autoScrollOffset,
                  Math.round(screenHeight),
                ).toString()}
                onChangeText={text => {
                  if (text) {
                    setChapterGeneralSettings({
                      autoScrollOffset: Number(text),
                    });
                  }
                }}
              />
            </Column>
            {!areAutoScrollSettingsDefault && (
              <Column modifiers={[fillMaxWidth(), padding(16, 4, 16, 8)]}>
                <Button
                  title={getString('common.reset')}
                  onPress={() => {
                    setChapterGeneralSettings({ autoScrollInterval: 10 });
                    setChapterGeneralSettings({ autoScrollOffset: null });
                  }}
                />
              </Column>
            )}
          </>
        )}
      </Column>
    </Column>
  );
};

export default NavigationTab;
