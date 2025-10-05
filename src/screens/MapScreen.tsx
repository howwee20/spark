import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from 'react-native';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';
import * as Location from 'expo-location';

import { supabase } from '../lib/supabase';
import { MSU_REGION, distanceMeters, nowMs } from '../utils/geo';
import { LOTS, type Lot } from '../data/lots';

type LotStatus = 'OPEN' | 'FILLING' | 'FULL';

type Signal = {
  id: string;
  lotId: string;
  status: LotStatus;
  createdAt: number;
  source: 'post' | 'agree' | 'update';
};

type LotConsensus = {
  status: LotStatus;
  margin: number;
  confidence: number;
  updatedAt: number;
  pending?: { status: LotStatus; seenAt: number } | null;
};

const LOT_STATUSES: LotStatus[] = ['OPEN', 'FILLING', 'FULL'];

const STATUS_LABEL: Record<LotStatus, string> = {
  OPEN: 'OPEN',
  FILLING: 'FILLING',
  FULL: 'FULL',
};

const STATUS_COLOR: Record<LotStatus, string> = {
  OPEN: '#22c55e',
  FILLING: '#eab308',
  FULL: '#ef4444',
};


const SIGMOID = (x: number) => 1 / (1 + Math.exp(-x));

const INITIAL_CONSENSUS: Record<string, LotConsensus> = LOTS.reduce((acc, lot) => {
  acc[lot.id] = {
    status: 'OPEN',
    margin: 0,
    confidence: 0.25,
    updatedAt: nowMs(),
    pending: null,
  };
  return acc;
}, {} as Record<string, LotConsensus>);

const MAX_SIGNAL_AGE_MIN = 180;

export default function MapScreen() {
  const mapRef = useRef<MapView | null>(null);
  const [mapRegion, setMapRegion] = useState<Region>(MSU_REGION);
  const [query, setQuery] = useState('');
  const [focusedLotId, setFocusedLotId] = useState<string | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [consensus, setConsensus] = useState<Record<string, LotConsensus>>(INITIAL_CONSENSUS);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [composer, setComposer] = useState<{ mode: 'post' | 'update'; lotId: string | null } | null>(null);
  const [clock, setClock] = useState(nowMs());

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as Lot[];
    return LOTS.filter(
      (lot) => lot.name.toLowerCase().includes(q) || lot.id.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query]);

  const visibleLots = useMemo(() => {
    const center = { lat: mapRegion.latitude, lng: mapRegion.longitude };
    const ranked = LOTS.map((lot) => ({
      lot,
      d2: (lot.lat - center.lat) ** 2 + (lot.lng - center.lng) ** 2,
    }))
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, 20)
      .map((entry) => entry.lot);

    if (!focusedLotId) {
      return ranked;
    }

    const focused = LOTS.find((lot) => lot.id === focusedLotId);
    if (!focused) {
      return ranked;
    }

    const merged = new Map<string, Lot>();
    ranked.forEach((lot) => merged.set(lot.id, lot));
    merged.set(focused.id, focused);
    return Array.from(merged.values());
  }, [focusedLotId, mapRegion]);

  useEffect(() => {
    const handle = setInterval(() => {
      setClock(nowMs());
    }, 30_000);
    return () => clearInterval(handle);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResultsOpen(false);
      if (!selectedLotId) {
        setFocusedLotId(null);
      }
    }
  }, [query, selectedLotId]);

  useEffect(() => {
    if (selectedLotId) {
      setFocusedLotId(selectedLotId);
    }
  }, [selectedLotId]);

  useEffect(() => {
    setSignals((prev) => {
      const now = nowMs();
      return prev.filter((signal) => (now - signal.createdAt) / 60000 <= MAX_SIGNAL_AGE_MIN);
    });
  }, [clock]);

  useEffect(() => {
    setConsensus((prev) => {
      const now = nowMs();
      const next: Record<string, LotConsensus> = {};
      LOTS.forEach((lot) => {
        const prior = prev[lot.id] ?? INITIAL_CONSENSUS[lot.id];
        next[lot.id] = computeConsensusForLot(lot.id, prior, signals, now);
      });
      return next;
    });
  }, [signals, clock]);

  const selectedLot = useMemo(
    () => LOTS.find((lot) => lot.id === selectedLotId) ?? null,
    [selectedLotId]
  );
  const selectedConsensus = selectedLot ? consensus[selectedLot.id] : null;

  const handleSelectLot = useCallback((id: string) => {
    const lot = LOTS.find((item) => item.id === id);
    if (!lot) return;
    setFocusedLotId(id);
    setResultsOpen(false);
    setQuery(lot.name);
    mapRef.current?.animateToRegion(
      {
        latitude: lot.lat,
        longitude: lot.lng,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      },
      300
    );
  }, []);

  const handleClearQuery = useCallback(() => {
    setQuery('');
    setResultsOpen(false);
    if (!selectedLotId) {
      setFocusedLotId(null);
    }
  }, [selectedLotId]);

  const hasSearch = query.trim().length > 0;

  const ensurePresence = useCallback(async (lot: Lot) => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Location required', 'Allow location to post accurate lot updates.');
      return null;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const here = { lat: loc.coords.latitude, lng: loc.coords.longitude };
    const distance = distanceMeters(here, { lat: lot.lat, lng: lot.lng });
    if (distance > 200) {
      Alert.alert('Too far away', 'You must be within 200 meters of this lot to submit.');
      return null;
    }
    return { here, distance };
  }, []);

  const pushSignal = useCallback(
    async (lot: Lot, status: LotStatus, source: Signal['source']) => {
      const timestamp = nowMs();
      const entry: Signal = {
        id: `${lot.id}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        lotId: lot.id,
        status,
        createdAt: timestamp,
        source,
      };
      setSignals((prev) => [...prev, entry]);
      try {
        await supabase.from('parking_signals').insert({
          lot_id: lot.id,
          status,
          source,
          recorded_at: new Date(timestamp).toISOString(),
        });
      } catch (error) {
        console.warn('Supabase signal insert failed', error);
      }
    },
    []
  );

  const handleAgree = useCallback(async () => {
    if (!selectedLot || !selectedConsensus) return;
    const presence = await ensurePresence(selectedLot);
    if (!presence) return;
    await pushSignal(selectedLot, selectedConsensus.status, 'agree');
    setSelectedLotId(null);
  }, [ensurePresence, pushSignal, selectedConsensus, selectedLot]);

  const handleComposerStatus = useCallback(
    async (status: LotStatus) => {
      if (!composer) return;
      const lot = composer.lotId
        ? LOTS.find((item) => item.id === composer.lotId)
        : null;
      if (!lot) return;
      const presence = await ensurePresence(lot);
      if (!presence) return;
      await pushSignal(lot, status, composer.mode === 'post' ? 'post' : 'update');
      setComposer(null);
    },
    [composer, ensurePresence, pushSignal]
  );

  const handleUpdateFromSheet = useCallback(() => {
    if (!selectedLot) return;
    setComposer({ mode: 'update', lotId: selectedLot.id });
    setSelectedLotId(null);
  }, [selectedLot]);

  const openPostComposer = useCallback(() => {
    setComposer({ mode: 'post', lotId: null });
  }, []);

  const composerLot = useMemo(() => {
    if (!composer) return null;
    if (!composer.lotId) return null;
    return LOTS.find((lot) => lot.id === composer.lotId) ?? null;
  }, [composer]);

  return (
    <SafeAreaView style={styles.container}>
      <MapView
        ref={(ref) => {
          mapRef.current = ref;
        }}
        style={styles.map}
        initialRegion={MSU_REGION}
        onRegionChangeComplete={(region) => setMapRegion(region)}
        onPress={() => {
          setResultsOpen(false);
          if (!hasSearch && !selectedLotId) {
            setFocusedLotId(null);
          }
        }}
        onLongPress={(event) => {
          console.log('center', event.nativeEvent.coordinate);
        }}
      >
        {visibleLots.map((lot) => {
          const snapshot = consensus[lot.id] ?? INITIAL_CONSENSUS[lot.id];
          const minutesAgo = Math.max(0, Math.round((clock - snapshot.updatedAt) / 60000));
          const timeLabel = minutesAgo < 1 ? 'Just now' : `${minutesAgo}m ago`;
          const confidence = snapshot.confidence;
          const radius = 70 + 140 * confidence;
          const isConfident = confidence >= 0.6;
          const isFocused = focusedLotId === lot.id;
          const isDimmed = hasSearch && !isFocused;
          const circleStrokeOpacity = (isDimmed ? 0.35 : 0.65).toFixed(2);
          const circleFillOpacity = (isDimmed ? 0.04 : 0.08).toFixed(2);
          return (
            <React.Fragment key={lot.id}>
              <Marker
                coordinate={{ latitude: lot.lat, longitude: lot.lng }}
                onPress={(event) => {
                  event.stopPropagation();
                  setFocusedLotId(lot.id);
                  setSelectedLotId(lot.id);
                  setResultsOpen(false);
                }}
                opacity={isDimmed ? 0.35 : 1}
              >
                <View style={[styles.markerPill, isFocused && styles.markerPillFocused]}>
                  <Text style={[styles.markerText, { color: STATUS_COLOR[snapshot.status] }]}> 
                    [{STATUS_LABEL[snapshot.status]}]
                  </Text>
                  <Text style={styles.markerSub}>{timeLabel}</Text>
                </View>
              </Marker>
              <Circle
                center={{ latitude: lot.lat, longitude: lot.lng }}
                radius={radius}
                strokeColor={`rgba(37, 99, 235, ${circleStrokeOpacity})`}
                strokeWidth={2}
                strokeDasharray={isConfident ? undefined : [12, 8]}
                fillColor={`rgba(37, 99, 235, ${circleFillOpacity})`}
              />
            </React.Fragment>
          );
        })}
      </MapView>

      <View style={styles.searchWrap}>
        <TextInput
          placeholder="Search lot (e.g., Lot 89, Ramp 2)…"
          placeholderTextColor="#888"
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setResultsOpen(true);
          }}
          onFocus={() => setResultsOpen(true)}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable style={styles.clearBtn} onPress={handleClearQuery} accessibilityLabel="Clear search">
            <Text style={styles.clearBtnText}>✕</Text>
          </Pressable>
        )}
      </View>

      {resultsOpen && results.length > 0 && (
        <View style={styles.resultsCard}>
          {results.map((lot) => (
            <Pressable key={lot.id} style={styles.resultRow} onPress={() => handleSelectLot(lot.id)}>
              <Text style={styles.resultName}>{lot.name}</Text>
              <Text style={styles.resultId}>{lot.id}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable style={styles.fab} onPress={openPostComposer} accessibilityRole="button" accessibilityLabel="Report parking status">
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <Modal transparent animationType="fade" visible={!!selectedLot} onRequestClose={() => setSelectedLotId(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{selectedLot?.name}</Text>
            <Text style={styles.sheetStatusLabel}>
              Current: {selectedConsensus ? STATUS_LABEL[selectedConsensus.status] : 'OPEN'}
            </Text>
            <View style={styles.sheetActions}>
              <Pressable style={[styles.actionBtn, styles.agree]} onPress={handleAgree}>
                <Text style={styles.actionText}>Agree</Text>
              </Pressable>
              <Pressable style={[styles.actionBtn, styles.update]} onPress={handleUpdateFromSheet}>
                <Text style={styles.actionText}>Update</Text>
              </Pressable>
            </View>
            <Pressable style={styles.closeBtn} onPress={() => setSelectedLotId(null)}>
              <Text style={styles.closeText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="slide"
        visible={!!composer}
        onRequestClose={() => setComposer(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.composer}>
            <Text style={styles.composerTitle}>
              {composer?.mode === 'update' ? 'Update lot status' : 'Post parking status'}
            </Text>
            {!composerLot && (
              <View style={styles.listContainer}>
                <Text style={styles.listHeader}>Pick a lot</Text>
                <FlatList
                  data={LOTS}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <Pressable
                      style={styles.listItem}
                      onPress={() => setComposer((prev) => (prev ? { ...prev, lotId: item.id } : prev))}
                    >
                      <Text style={styles.listItemName}>{item.name}</Text>
                      <Text style={styles.listItemMeta}>Tap to choose</Text>
                    </Pressable>
                  )}
                />
              </View>
            )}
            {composerLot && (
              <View>
                <Text style={styles.selectedLot}>{composerLot.name}</Text>
                <View style={styles.statusRow}>
                  {LOT_STATUSES.map((status) => (
                    <Pressable
                      key={status}
                      style={[styles.statusBtn, { borderColor: STATUS_COLOR[status] }]}
                      onPress={() => handleComposerStatus(status)}
                    >
                      <Text style={[styles.statusBtnText, { color: STATUS_COLOR[status] }]}>
                        {STATUS_LABEL[status]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            <Pressable style={styles.closeComposer} onPress={() => setComposer(null)}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function computeConsensusForLot(
  lotId: string,
  prior: LotConsensus,
  signals: Signal[],
  now: number
): LotConsensus {
  const relevant = signals.filter((signal) => signal.lotId === lotId);
  const fresh = relevant.filter((signal) => (now - signal.createdAt) / 60000 <= MAX_SIGNAL_AGE_MIN);
  const weights: Record<LotStatus, number> = {
    OPEN: 0,
    FILLING: 0,
    FULL: 0,
  };

  fresh.forEach((signal) => {
    const ageMin = (now - signal.createdAt) / 60000;
    const weight = Math.exp(-ageMin / 15);
    weights[signal.status] += weight;
  });

  const ordered = LOT_STATUSES.map((status) => ({ status, weight: weights[status] })).sort(
    (a, b) => b.weight - a.weight
  );

  const top = ordered[0];
  const runner = ordered[1];
  const margin = Math.max(0, top.weight - (runner?.weight ?? 0));
  const hasSignals = fresh.length > 0;
  const confidence = hasSignals ? SIGMOID(6 * margin) : 0.25;

  let status = prior.status;
  let pending = prior.pending ?? null;
  let updatedAt = prior.updatedAt;

  if (top.weight === 0 && !hasSignals) {
    pending = null;
  } else if (top.status === prior.status) {
    pending = null;
  } else if (margin > 0) {
    if (pending && pending.status === top.status) {
      status = top.status;
      pending = null;
      updatedAt = now;
    } else {
      pending = { status: top.status, seenAt: now };
    }
  } else {
    pending = null;
  }

  return {
    status,
    margin,
    confidence,
    updatedAt,
    pending,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  map: {
    flex: 1,
  },
  markerPill: {
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    gap: 4,
  },
  markerPillFocused: {
    borderColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  markerText: {
    fontWeight: '700',
  },
  markerSub: {
    fontSize: 12,
    color: '#4b5563',
  },
  searchWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: Platform.OS === 'ios' ? 60 : 24,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    zIndex: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  clearBtn: {
    marginLeft: 8,
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  clearBtnText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 12,
  },
  resultsCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: (Platform.OS === 'ios' ? 60 : 24) + 56,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    maxHeight: 280,
    zIndex: 9,
  },
  resultRow: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
  },
  resultName: {
    fontWeight: '700',
    color: '#111827',
  },
  resultId: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 32,
    backgroundColor: '#111827',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  fabText: {
    color: 'white',
    fontSize: 28,
    fontWeight: '700',
    marginTop: -4,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  sheetStatusLabel: {
    textAlign: 'center',
    color: '#6b7280',
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  agree: {
    backgroundColor: '#16a34a',
  },
  update: {
    backgroundColor: '#f59e0b',
  },
  actionText: {
    color: 'white',
    fontWeight: '700',
  },
  closeBtn: {
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
  },
  closeText: {
    color: '#111827',
    fontWeight: '600',
  },
  composer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 20,
    gap: 16,
  },
  composerTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  listContainer: {
    maxHeight: 280,
  },
  listHeader: {
    fontWeight: '600',
    marginBottom: 12,
  },
  listItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  listItemName: {
    fontWeight: '600',
    color: '#111827',
  },
  listItemMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  selectedLot: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusBtn: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statusBtnText: {
    fontWeight: '700',
  },
  closeComposer: {
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
  },
});
