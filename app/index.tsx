import React from 'react';
import { SafeAreaView, StatusBar } from 'react-native';
import MapScreen from '@/screens/MapScreen';

export default function Index() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <MapScreen />
    </SafeAreaView>
  );
}
