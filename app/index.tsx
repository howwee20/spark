import React from 'react';
import { StatusBar } from 'react-native';
import MapScreen from '../src/screens/MapScreen';

export default function Index() {
  return (
    <>
      <StatusBar barStyle="dark-content" />
      <MapScreen />
    </>
  );
}
