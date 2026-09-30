import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Box, Column, Row, Surface } from '@expo/ui/jetpack-compose';
import {
  clickable,
  fillMaxHeight,
  fillMaxSize,
  fillMaxWidth,
  height,
  padding,
  weight,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import { InteractionManager, Share, StyleSheet, View } from 'react-native';
import { Drawer } from 'react-native-drawer-layout';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';

import {
  useChapterGeneralSettings,
  useChapterReaderSettings,
  useTheme,
} from '@hooks/persisted';
import { useBackHandler } from '@hooks/index';
import { getString } from '@i18n/translations';
import type { ChapterScreenProps } from '@navigators/types';
import { resolveUrl } from '@services/plugin/fetch';
import { showToast } from '@utils/showToast';
import KeepScreenAwake from './components/KeepScreenAwake';
import ChapterDrawer from './components/ChapterDrawer';
import ChapterLoadingScreen from './ChapterLoadingScreen/ChapterLoadingScreen';
import ReaderAppbar from './components/ReaderAppbar';
import ReaderFooter, { ReaderSideSeekbar } from './components/ReaderFooter';
import ReaderTtsController from './components/ReaderTtsController';
import ReaderBottomSheet from './components/ReaderBottomSheet/ReaderBottomSheet';
import WebViewReader, {
  type ReaderTextAction,
} from './components/WebViewReader';
import {
  ChapterContextProvider,
  useChapterContext,
  useReaderChromeHidden,
} from './ChapterContext';
import CloseIcon from '@expo/material-symbols/close.xml';
import PublicIcon from '@expo/material-symbols/public.xml';
import RefreshIcon from '@expo/material-symbols/refresh.xml';
import {
  AppHost,
  IconButtonV2,
  AppText,
  ErrorScreenV2,
  OverlayHost,
  BottomSheet,
  Dialog,
  TextInput,
  useScreenInsets,
} from '@components';
import { useWindowLayout } from '@hooks/common/useWindowLayout';

const SIDE_PANEL_WIDTH = 400;

const Chapter = ({ route, navigation }: ChapterScreenProps) => (
  <ChapterContextProvider
    novel={route.params.novel}
    initialChapter={route.params.chapter}
  >
    <ReaderDrawerLayout route={route} navigation={navigation} />
  </ChapterContextProvider>
);

const ReaderDrawerLayout = ({ route, navigation }: ChapterScreenProps) => {
  const theme = useTheme();
  const { loading } = useChapterContext();
  const [open, setOpen] = useState(false);
  /**
   * The drawer renders a list of every chapter in the novel. Mounting it up
   * front competes with the chapter load for the JS thread, so it is deferred
   * until the chapter is on screen -- but it is mounted *before* the drawer is
   * first opened rather than on the tap that opens it. `Drawer` keeps a closed
   * panel laid out (it is only translated off-screen), so the list measures
   * and renders its first rows out of sight instead of during the open
   * animation, which is what left the panel empty on slower devices.
   */
  const [drawerMounted, setDrawerMounted] = useState(false);

  useEffect(() => {
    if (loading || drawerMounted) {
      return;
    }
    const handle = InteractionManager.runAfterInteractions(() =>
      setDrawerMounted(true),
    );
    return () => handle.cancel();
  }, [drawerMounted, loading]);

  useBackHandler(() => {
    if (open) {
      setOpen(false);
      return true;
    }
    return false;
  });

  const openDrawer = useCallback(() => {
    setDrawerMounted(true);
    setOpen(true);
  }, []);

  const closeDrawer = useCallback(() => setOpen(false), []);

  const renderDrawerContent = useCallback(
    () => (drawerMounted ? <ChapterDrawer onClose={closeDrawer} /> : null),
    [closeDrawer, drawerMounted],
  );

  /**
   * `react-native-drawer-layout` paints the panel white by default and applies
   * `drawerStyle` last, so the panel itself has to carry the drawer's surface
   * colour. Left transparent, the reader showed through the panel for every
   * frame before the content painted.
   */
  const drawerStyle = useMemo(
    () => ({ backgroundColor: theme.surfaceContainerLow }),
    [theme.surfaceContainerLow],
  );

  return (
    <Drawer
      drawerStyle={drawerStyle}
      open={open}
      onOpen={openDrawer}
      onClose={closeDrawer}
      renderDrawerContent={renderDrawerContent}
    >
      <ChapterContent
        route={route}
        navigation={navigation}
        openDrawer={openDrawer}
      />
    </Drawer>
  );
};

const ReaderSidePanel = ({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) => {
  const theme = useTheme();
  const { top, bottom, right } = useScreenInsets();
  return (
    <AppHost style={StyleSheet.absoluteFill}>
      <Row modifiers={[fillMaxSize()]}>
        {/* A tap beside the panel closes it; the page stays clear so changes
            stay visible while they apply. */}
        <Box
          modifiers={[
            weight(1),
            fillMaxHeight(),
            clickable(onClose, { indication: false }),
          ]}
        />
        <Surface
          color={theme.surfaceContainerLow}
          contentColor={theme.onSurface}
          modifiers={[width(SIDE_PANEL_WIDTH + right), fillMaxHeight()]}
        >
          <Column modifiers={[fillMaxHeight(), padding(0, top, right, bottom)]}>
            <Row
              verticalAlignment="center"
              modifiers={[fillMaxWidth(), height(64), padding(16, 0, 4, 0)]}
            >
              <AppText variant="titleLarge" modifiers={[weight(1)]}>
                {title}
              </AppText>
              <IconButtonV2
                name={CloseIcon}
                accessibilityLabel={getString('common.close')}
                onPress={onClose}
                theme={theme}
              />
            </Row>
            <Column modifiers={[fillMaxWidth(), weight(1)]}>{children}</Column>
          </Column>
        </Surface>
      </Row>
    </AppHost>
  );
};

/** Adds a text replacement rule for the selected text. */
const ReplaceTextDialog = ({
  text,
  onSubmit,
  onDismiss,
}: {
  text: string;
  onSubmit: (replacement: string) => void;
  onDismiss: () => void;
}) => {
  const [replacement, setReplacement] = useState('');
  return (
    <Dialog.Root visible onDismiss={onDismiss}>
      <Dialog.Title>
        {`${getString('common.replaceText')}: “${text.slice(0, 60)}”`}
      </Dialog.Title>
      <Dialog.Content>
        <TextInput
          value={replacement}
          label={getString('common.replaceWith')}
          onChangeText={setReplacement}
          onSubmit={() => onSubmit(replacement)}
          autoFocus
        />
      </Dialog.Content>
      <Dialog.Actions>
        <Dialog.Action onPress={onDismiss}>
          {getString('common.cancel')}
        </Dialog.Action>
        <Dialog.Action onPress={() => onSubmit(replacement)}>
          {getString('common.save')}
        </Dialog.Action>
      </Dialog.Actions>
    </Dialog.Root>
  );
};

type ChapterContentProps = ChapterScreenProps & {
  openDrawer: () => void;
};

export const ChapterContent = ({
  navigation,
  openDrawer,
}: ChapterContentProps) => {
  const layout = useWindowLayout();
  const { bottom } = useScreenInsets();
  const { theme: readerBackground } = useChapterReaderSettings();
  const { novel, chapter, loading, error, hideHeader, refetch, selection } =
    useChapterContext();
  const [replacing, setReplacing] = useState<string>();
  const hidden = useReaderChromeHidden();
  const { keepScreenOn } = useChapterGeneralSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>();
  const wide = layout.useNavigationRail;

  useBackHandler(
    useCallback(() => {
      if (settingsOpen) {
        setSettingsOpen(false);
        return true;
      }
      if (searchQuery !== undefined) {
        setSearchQuery(undefined);
        return true;
      }
      return false;
    }, [settingsOpen, searchQuery]),
  );

  // Search belongs to the chrome: it closes when the chrome hides.
  const [wasHidden, setWasHidden] = useState(hidden);
  if (wasHidden !== hidden) {
    setWasHidden(hidden);
    if (hidden && searchQuery !== undefined) {
      setSearchQuery(undefined);
    }
  }

  const openSettings = useCallback(() => {
    // The page stays clean beside the side panel; the sheet keeps the bars.
    if (wide && !hidden) {
      hideHeader();
    }
    setSettingsOpen(true);
  }, [hidden, hideHeader, wide]);

  const chapterUrl = resolveUrl(novel.pluginId, chapter.path);
  const openInWebView = useCallback(
    () =>
      navigation.navigate('WebviewScreen', {
        name: novel.name,
        url: chapter.path,
        pluginId: novel.pluginId,
      }),
    [chapter.path, navigation, novel.name, novel.pluginId],
  );

  const onTextAction = (action: ReaderTextAction, selectedText: string) => {
    const text = (selectedText || selection.text || '').trim();
    selection.clear();
    if (!text) {
      return;
    }
    switch (action) {
      case 'copy':
        void Clipboard.setStringAsync(text);
        showToast(
          getString('common.copiedToClipboard', { name: text.slice(0, 40) }),
        );
        break;
      case 'search':
        if (hidden) {
          hideHeader();
        }
        setSearchQuery(text);
        break;
      case 'remove':
        selection.remove(text);
        break;
      case 'replace':
        setReplacing(text);
        break;
    }
  };

  if (error) {
    return (
      <AppHost style={styles.container}>
        <ErrorScreenV2
          error={error}
          actions={[
            {
              iconName: RefreshIcon,
              title: getString('common.retry'),
              onPress: refetch,
            },
            {
              iconName: PublicIcon,
              title: 'WebView',
              onPress: openInWebView,
            },
          ]}
        />
      </AppHost>
    );
  }

  const closeSettings = () => setSettingsOpen(false);
  const searching = searchQuery !== undefined;

  return (
    <View style={[styles.container, { backgroundColor: readerBackground }]}>
      {keepScreenOn ? <KeepScreenAwake /> : null}
      <WebViewReader onTextAction={onTextAction} />
      {loading ? <ChapterLoadingScreen /> : null}
      <ReaderAppbar
        visible={!hidden}
        onBack={navigation.goBack}
        searchQuery={searchQuery}
        onToggleSearch={() =>
          setSearchQuery(current => (current === undefined ? '' : undefined))
        }
        openInWebView={openInWebView}
        openInBrowser={() => void Linking.openURL(chapterUrl)}
        shareChapter={() => void Share.share({ message: chapterUrl })}
      />
      <ReaderFooter
        visible={!hidden && !searching}
        onOpenChapters={openDrawer}
        onOpenSettings={openSettings}
      />
      <ReaderSideSeekbar visible={!hidden && !searching} />
      <ReaderTtsController />
      {wide && settingsOpen ? (
        <ReaderSidePanel
          title={getString('readerSettings.title')}
          onClose={closeSettings}
        >
          <ReaderBottomSheet fill />
        </ReaderSidePanel>
      ) : null}
      <OverlayHost>
        <BottomSheet
          visible={!wide && settingsOpen}
          onDismiss={closeSettings}
          scrollable={false}
        >
          <ReaderBottomSheet bottomInset={bottom} />
        </BottomSheet>
        {replacing !== undefined ? (
          <ReplaceTextDialog
            text={replacing}
            onSubmit={replacement => {
              selection.replace(replacing, replacement);
              setReplacing(undefined);
            }}
            onDismiss={() => setReplacing(undefined)}
          />
        ) : null}
      </OverlayHost>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
});

export default Chapter;
