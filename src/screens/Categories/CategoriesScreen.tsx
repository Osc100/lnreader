import { StyleSheet } from 'react-native';
import React, { useEffect, useOptimistic, useTransition } from 'react';
import { useNavigation } from '@react-navigation/native';
import DraggableFlatList, {
  RenderItemParams,
} from 'react-native-draggable-flatlist';

import { AppHost, Appbar, EmptyView, Fab, Screen } from '@components/index';
import AddCategoryModal from './components/AddCategoryModal';

import { updateCategoryOrderInDb } from '@database/queries/CategoryQueries';
import { useBoolean } from '@hooks';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';

import CategoryCard from './components/CategoryCard';
import CategorySkeletonLoading from './components/CategorySkeletonLoading';
import { useLibraryContext } from '@components/Context/LibraryContext';
import { ExtendedCategory } from '@screens/library/hooks/useLibrary';
import AddIcon from '@expo/material-symbols/add.xml';

const CategoriesScreen = () => {
  const { categories, setCategories, refreshCategories, isLoading } =
    useLibraryContext();
  const theme = useTheme();
  const { goBack } = useNavigation();

  const {
    value: categoryModalVisible,
    setTrue: showCategoryModal,
    setFalse: closeCategoryModal,
  } = useBoolean();

  useEffect(() => {
    refreshCategories();
  }, [refreshCategories]);

  const userCategories = React.useMemo(() => {
    if (!categories || categories.length === 0) {
      return [];
    }

    return categories;
  }, [categories]);

  // The dropped order shows at once and stays until the saved order replaces
  // it, so the list never renders the old order in between.
  const [optimisticCategories, setOptimisticCategories] =
    useOptimistic(userCategories);
  const [, startTransition] = useTransition();

  const onDragEnd = ({ data }: { data: ExtendedCategory[] }) => {
    if (!categories || categories.length === 0) {
      return;
    }

    startTransition(async () => {
      setOptimisticCategories(data);
      await updateCategoryOrderInDb(data);
      startTransition(() => setCategories(data));
    });
  };

  const renderItem = ({
    item,
    drag,
    isActive,
  }: RenderItemParams<ExtendedCategory>) => (
    <CategoryCard
      category={item}
      getCategories={refreshCategories}
      drag={drag}
      isActive={isActive}
    />
  );

  return (
    <Screen
      topBar={
        <Appbar
          title={getString('categories.header')}
          handleGoBack={goBack}
          theme={theme}
        />
      }
      list={
        isLoading ? undefined : (
          <DraggableFlatList
            data={optimisticCategories}
            contentContainerStyle={styles.contentCtn}
            renderItem={renderItem}
            keyExtractor={item => item.id.toString()}
            onDragEnd={onDragEnd}
            activationDistance={10}
            autoscrollSpeed={100}
            ListEmptyComponent={
              <AppHost style={styles.empty}>
                <EmptyView
                  icon="Σ(ಠ_ಠ)"
                  description={getString('categories.emptyMsg')}
                  theme={theme}
                />
              </AppHost>
            }
          />
        )
      }
      floatingAction={
        <Fab
          extended
          label={getString('common.add')}
          onPress={showCategoryModal}
          icon={AddIcon}
        />
      }
      overlays={
        <AddCategoryModal
          visible={categoryModalVisible}
          closeModal={closeCategoryModal}
          onSuccess={refreshCategories}
        />
      }
    >
      {isLoading ? (
        <CategorySkeletonLoading width={360.7} height={89.5} theme={theme} />
      ) : null}
    </Screen>
  );
};

export default CategoriesScreen;

const styles = StyleSheet.create({
  contentCtn: {
    flexGrow: 1,
    paddingBottom: 270,
    paddingVertical: 16,
  },
  empty: {
    flex: 1,
  },
});
