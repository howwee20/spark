import { Fragment, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, Region } from 'react-native-maps';

import { supabase } from '@/src/lib/supabase';
import { LotStatus, statusToColor, statusToLabel } from '@/src/utils/status';

type LotCurrentRow = {
  status: LotStatus | null;
  confidence: number | null;
};

type RawLotRow = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  lot_current: LotCurrentRow | LotCurrentRow[] | null;
};

type LotMarker = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  status: LotStatus | null;
  confidence: number;
};

const INITIAL_REGION: Region = {
  latitude: 42.727,
  longitude: -84.483,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

const DEFAULT_CONFIDENCE = 0;

function normalizeLot(row: RawLotRow): LotMarker {
  const statusRow = Array.isArray(row.lot_current)
    ? row.lot_current[0] ?? null
    : row.lot_current;

  return {
    id: row.id,
    name: row.name,
    latitude: row.lat,
    longitude: row.lng,
    status: statusRow?.status ?? null,
    confidence: statusRow?.confidence ?? DEFAULT_CONFIDENCE,
  };
}

function hexToRgba(hexColor: string, alpha: number) {
  const sanitized = hexColor.replace('#', '');
  const normalized =
    sanitized.length === 3
      ? sanitized
          .split('')
          .map((char) => char + char)
          .join('')
      : sanitized;
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function MapScreen() {
  const [lots, setLots] = useState<LotMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadLots = async () => {
      setLoading(true);
      try {
        const { data, error: fetchError } = await supabase
          .from('lots')
          .select('id,name,lat,lng,lot_current(status,confidence)')
          .order('name');

        if (fetchError) {
          throw fetchError;
        }

        const normalizedLots = (data ?? []).map(normalizeLot);

        if (isMounted) {
          setLots(normalizedLots);
          setError(null);
        }
      } catch (err) {
        console.error('Failed to load lots', err);
        if (isMounted) {
          setError('Unable to load parking lots. Please try again.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadLots();

    return () => {
      isMounted = false;
    };
  }, []);

  const haloShapes = useMemo(() => {
    return lots.map((lot) => {
      const color = statusToColor(lot.status);
      const radius = 30 + lot.confidence * 170;
      return {
        lot,
        color,
        fill: hexToRgba(color, 0.18),
        stroke: hexToRgba(color, 0.45),
        radius,
      };
    });
  }, [lots]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView style={StyleSheet.absoluteFillObject} initialRegion={INITIAL_REGION}>
        {haloShapes.map(({ lot, color, fill, stroke, radius }) => (
          <Fragment key={lot.id}>
            <Circle
              center={{ latitude: lot.latitude, longitude: lot.longitude }}
              radius={radius}
              strokeWidth={1}
              strokeColor={stroke}
              fillColor={fill}
            />
            <Marker
              coordinate={{ latitude: lot.latitude, longitude: lot.longitude }}
              title={lot.name}
              description={`${statusToLabel(lot.status)} • Confidence ${Math.round(lot.confidence * 100)}%`}
              pinColor={color}
            />
          </Fragment>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
