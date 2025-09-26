import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { supabase } from '../lib/supabase';
import { getDeviceId } from '../utils/device';
import { withinRadius } from '../utils/geo';
import { getStatusColor, getStatusLabel, LotStatus } from '../utils/statusColor';

const COOLDOWN_PREFIX = 'spark:cooldown:';
const COOLDOWN_DURATION_MS = 20 * 60 * 1000;
const MAX_DISTANCE_METERS = 150;

type LotSheetLot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: LotStatus | null;
};

type LotSheetProps = {
  lot: LotSheetLot | null;
  visible: boolean;
  onClose: () => void;
  onStatusOptimistic: (lotId: string, status: LotStatus) => void;
  onStatusRevert: (lotId: string, status: LotStatus | null) => void;
};

type ButtonDescriptor = {
  status: LotStatus;
  label: string;
};

const STATUS_BUTTONS: ButtonDescriptor[] = [
  { status: 'empty', label: 'Empty' },
  { status: 'filling', label: 'Filling' },
  { status: 'tight', label: 'Tight' },
  { status: 'full', label: 'Full' },
];

const showMessage = (message: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert('Notice', message);
  }
};

const formatRemaining = (remainingMs: number) => {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
};

export function LotSheet({ lot, visible, onClose, onStatusOptimistic, onStatusRevert }: LotSheetProps) {
  const [submitting, setSubmitting] = useState<LotStatus | null>(null);

  if (!lot) {
    return null;
  }

  const handleSubmit = async (status: LotStatus) => {
    if (submitting) {
      return;
    }

    setSubmitting(status);

    const cooldownKey = `${COOLDOWN_PREFIX}${lot.id}`;
    const previousStatus = lot.status ?? null;
    let didOptimisticUpdate = false;

    try {
      const storedCooldown = await AsyncStorage.getItem(cooldownKey);
      const now = Date.now();

      if (storedCooldown) {
        const expiresAt = Number(storedCooldown);
        if (!Number.isNaN(expiresAt) && expiresAt > now) {
          const remaining = formatRemaining(expiresAt - now);
          showMessage(`Please wait ${remaining} before reporting again.`);
          setSubmitting(null);
          return;
        }
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        showMessage('Location permission is required to submit a report.');
        setSubmitting(null);
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const current = { lat: position.coords.latitude, lng: position.coords.longitude };
      const target = { lat: lot.lat, lng: lot.lng };

      if (!withinRadius(current, target, MAX_DISTANCE_METERS)) {
        showMessage('You must be within 150 meters of this lot to report its status.');
        setSubmitting(null);
        return;
      }

      onStatusOptimistic(lot.id, status);
      didOptimisticUpdate = true;

      const deviceId = await getDeviceId();

      const { error } = await supabase.from('lot_status_reports').insert({
        lot_id: lot.id,
        status,
        device_id: deviceId,
        lat: current.lat,
        lng: current.lng,
      });

      if (error) {
        onStatusRevert(lot.id, previousStatus);
        showMessage('Unable to submit report right now. Please try again.');
        return;
      }

      const nextExpiry = (Date.now() + COOLDOWN_DURATION_MS).toString();
      await AsyncStorage.setItem(cooldownKey, nextExpiry);

      showMessage(`Reported ${getStatusLabel(status)}.`);
      onClose();
    } catch {
      if (didOptimisticUpdate) {
        onStatusRevert(lot.id, previousStatus);
      }
      showMessage('Something went wrong while submitting your report.');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>{lot.name}</Text>
          <Text style={styles.subtitle}>How busy is this lot?</Text>
          <View style={styles.buttonGrid}>
            {STATUS_BUTTONS.map((button) => {
              const isLoading = submitting === button.status;
              return (
                <Pressable
                  key={button.status}
                  style={[styles.button, { backgroundColor: getStatusColor(button.status) }]}
                  disabled={!!submitting}
                  onPress={() => handleSubmit(button.status)}>
                  <Text style={styles.buttonText}>{button.label}</Text>
                  {isLoading ? <ActivityIndicator color="#fff" style={styles.spinner} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#555',
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  button: {
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    flexBasis: '48%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  spinner: {
    marginTop: 12,
  },
});
