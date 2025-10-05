import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  onMap?: () => void;
  onSearch?: () => void;
  onFavs?: () => void;
  active?: 'map' | 'search' | 'favs';
};

export default function BottomNav({ onMap, onSearch, onFavs, active = 'map' }: Props) {
  return (
    <SafeAreaView style={styles.wrap} edges={['bottom']}>
      <View style={styles.row}>
        <Tab label="Map"    active={active === 'map'}    onPress={onMap} />
        <Tab label="Search" active={active === 'search'} onPress={onSearch} />
        <Tab label="Favs"   active={active === 'favs'}   onPress={onFavs} />
      </View>
    </SafeAreaView>
  );
}

function Tab({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: 'white',
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
    paddingBottom: Platform.OS === 'android' ? 8 : 0,
  },
  row: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
  },
  tabText: {
    fontWeight: '700', color: '#6B7280',
  },
  tabTextActive: {
    color: '#0F2F27',
  },
});
