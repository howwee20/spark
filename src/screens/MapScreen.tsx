import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, Region } from 'react-native-maps';

import { LotSheet } from '../components/LotSheet';
import { supabase } from '../lib/supabase';
import { LotStatus, getStatusColor } from '../utils/statusColor';

const INITIAL_REGION: Region = {
  latitude: 42.727,
  longitude: -84.483,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

type Lot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: LotStatus | null;
  confidence: number | null;
};

type RawLot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  lot_current?:
    | null
    | {
        status: LotStatus | null;
        confidence: number | null;
      }
    | {
        status: LotStatus | null;
        confidence: number | null;
      }[];
};

const DEFAULT_ERROR = 'Unable to load parking lot data.';

const toRgba = (hex: string, alpha: number) => {
  const value = hex.replace('#', '');
  const normalized = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;

  const intValue = parseInt(normalized, 16);
  const r = (intValue >> 16) & 255;
  const g = (intValue >> 8) & 255;
  const b = intValue & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const extractLot = (item: RawLot): Lot => {
  const current = Array.isArray(item.lot_current) ? item.lot_current[0] : item.lot_current;

  return {
    id: item.id,
    name: item.name,
    lat: item.lat,
    lng: item.lng,
    status: current?.status ?? null,
    confidence: current?.confidence ?? null,
  };
};

export default function MapScreen() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);

  const loadLots = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: supabaseError } = await supabase
      .from('lots')
      .select('id,name,lat,lng,lot_current(status,confidence)');

    if (supabaseError) {
      setError(DEFAULT_ERROR);
      setLots([]);
      setLoading(false);
      return;
    }

    const mapped = (data ?? []).map(extractLot);
    setLots(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLots();
  }, [loadLots]);

  const selectedLot = useMemo(() => {
    if (!selectedLotId) {
      return null;
    }
    return lots.find((lot) => lot.id === selectedLotId) ?? null;
  }, [lots, selectedLotId]);

  const handleStatusOptimistic = useCallback((lotId: string, status: LotStatus) => {
    setLots((previous) => previous.map((lot) => (lot.id === lotId ? { ...lot, status } : lot)));
  }, []);

  const handleStatusRevert = useCallback((lotId: string, status: LotStatus | null) => {
    setLots((previous) => previous.map((lot) => (lot.id === lotId ? { ...lot, status } : lot)));
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={INITIAL_REGION}
        showsUserLocation
        showsMyLocationButton>
        {lots.map((lot) => {
          const pinColor = getStatusColor(lot.status);
          const confidence = lot.confidence ?? 0;
          const radius = Math.max(10, confidence * 150);
          const fillColor = toRgba(pinColor, 0.16);
          const strokeColor = toRgba(pinColor, 0.4);

          return (
            <Fragment key={lot.id}>
              {confidence > 0 ? (
                <Circle
                  center={{ latitude: lot.lat, longitude: lot.lng }}
                  radius={radius}
                  strokeColor={strokeColor}
                  fillColor={fillColor}
                />
              ) : null}
              <Marker
                coordinate={{ latitude: lot.lat, longitude: lot.lng }}
                pinColor={pinColor}
                onPress={() => setSelectedLotId(lot.id)}
                title={lot.name}
              />
            </Fragment>
          );
        })}
      </MapView>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#2c3e50" />
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <LotSheet
        lot={selectedLot}
        visible={!!selectedLot}
        onClose={() => setSelectedLotId(null)}
        onStatusOptimistic={handleStatusOptimistic}
        onStatusRevert={handleStatusRevert}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(231, 76, 60, 0.9)',
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
  },
});
