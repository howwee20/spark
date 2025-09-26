import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';
import * as Location from 'expo-location';

import { supabase } from '../lib/supabase';
import { coordsToCellId } from '../utils/geocell';

export type PaceReport = {
  id: string;
  cell_id: string;
  created_at: string;
};

type Props = {
  onReportCreated?: (report: PaceReport) => void;
};

export default function PaceFab({ onReportCreated }: Props) {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location needed', 'We need your location to flag nearby PACE sightings.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      const cell_id = coordsToCellId(latitude, longitude);
      const { data, error } = await supabase
        .from('pace_reports')
        .insert({ cell_id })
        .select('id,cell_id,created_at')
        .single();
      if (error) throw error;
      if (data) {
        onReportCreated?.(data as PaceReport);
      }
      Alert.alert('PACE spotted', 'Thanks! Your report will show to others shortly.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Failed to report', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]} onPress={handlePress}>
      {loading ? (
        <ActivityIndicator color="#111827" />
      ) : (
        <Text style={styles.fabText}>PACE spotted</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    backgroundColor: '#f97316',
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  fabPressed: {
    opacity: 0.85,
  },
  fabText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 16,
  },
});
