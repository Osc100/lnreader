import { Pressable, StyleSheet, View } from 'react-native';
import React from 'react';
import { Box, Row } from '@expo/ui/jetpack-compose';
import {
  alpha,
  background,
  clickable,
  clip,
  fillMaxSize,
  padding,
  Shapes,
  weight,
} from '@expo/ui/jetpack-compose/modifiers';

import { Category } from '@database/types';
import { useTheme } from '@hooks/persisted';
import AddCategoryModal from './AddCategoryModal';
import { useBoolean } from '@hooks';
import { AppHost, AppText } from '@components';
import IconButton from '@components/IconButtonV2/IconButtonV2';
import DeleteCategoryModal from './DeleteCategoryModal';
import DeleteIcon from '@expo/material-symbols/delete.xml';
import DragHandleIcon from '@expo/material-symbols/drag_handle.xml';
import EditIcon from '@expo/material-symbols/edit.xml';

// Compose cards inside the draggable React Native list need a fixed height.
const CARD_HEIGHT = 64;
const DRAG_HANDLE_WIDTH = 56;

interface CategoryCardProps {
  category: Category;
  getCategories: () => Promise<void>;
  drag: () => void;
  isActive: boolean;
}

const CategoryCard: React.FC<CategoryCardProps> = ({
  category,
  getCategories,
  drag,
  isActive,
}) => {
  const theme = useTheme();

  const {
    value: categoryModalVisible,
    setTrue: showCategoryModal,
    setFalse: closeCategoryModal,
  } = useBoolean();

  const {
    value: deletecategoryModalVisible,
    setTrue: showDeleteCategoryModal,
    setFalse: closeDeleteCategoryModal,
  } = useBoolean();

  const opacity = category.id <= 2 ? 0.4 : 1;

  return (
    <View style={[styles.cardCtn, isActive && styles.activeCard]}>
      <AppHost style={styles.card}>
        <Row
          verticalAlignment="center"
          modifiers={[
            fillMaxSize(),
            clip(Shapes.RoundedCorner(12)),
            background(theme.secondaryContainer),
            padding(8, 8, 8, 8),
          ]}
        >
          <IconButton
            name={DragHandleIcon}
            color={theme.onSurface}
            onPress={() => undefined}
            theme={theme}
          />
          <Box modifiers={[weight(1), padding(8, 4, 16, 4)]}>
            <AppText
              color={theme.onSurface}
              maxLines={1}
              modifiers={
                category.id <= 2 ? undefined : [clickable(showCategoryModal)]
              }
            >
              {category.name}
            </AppText>
          </Box>
          {category.id <= 2 && (
            <AppText
              variant="labelSmall"
              color={theme.onTertiaryContainer}
              modifiers={[
                clip(Shapes.Circle),
                background(theme.tertiaryContainer),
                padding(8, 2, 8, 2),
              ]}
            >
              System
            </AppText>
          )}

          <Box modifiers={[padding(16, 0, 0, 0), alpha(opacity)]}>
            <IconButton
              name={EditIcon}
              color={category.id <= 2 ? theme.outline : theme.onSurface}
              onPress={showCategoryModal}
              disabled={category.id <= 2}
              theme={theme}
            />
          </Box>

          <Box modifiers={[padding(16, 0, 0, 0), alpha(opacity)]}>
            <IconButton
              name={DeleteIcon}
              color={category.id <= 2 ? theme.outline : theme.onSurface}
              onPress={showDeleteCategoryModal}
              disabled={category.id <= 2}
              theme={theme}
            />
          </Box>
        </Row>
        <AddCategoryModal
          isEditMode
          category={category}
          visible={categoryModalVisible}
          closeModal={closeCategoryModal}
          onSuccess={getCategories}
        />
        <DeleteCategoryModal
          category={category}
          visible={deletecategoryModalVisible}
          closeModal={closeDeleteCategoryModal}
          onSuccess={getCategories}
        />
      </AppHost>
      {/* Compose buttons have no press-in event, which dragging starts on. */}
      <Pressable style={styles.dragHandle} onPressIn={drag} />
    </View>
  );
};

export default CategoryCard;

const styles = StyleSheet.create({
  cardCtn: {
    height: CARD_HEIGHT,
    marginBottom: 8,
    marginHorizontal: 16,
  },
  card: {
    flex: 1,
  },
  dragHandle: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAG_HANDLE_WIDTH,
  },
  activeCard: {
    opacity: 0.8,
    elevation: 8,
  },
});
