import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Circle, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { getDeviceId } from '../utils/device';
import { coordsToCellId } from '../utils/geocell';

type LotStatus = 'empty' | 'filling' | 'tight' | 'full' | null;
type LotRow = { id: string; name: string; lat: number; lng: number; status: LotStatus; confidence: number | null; isFavorite?: boolean };

const MSU_CENTER: Region = { latitude: 42.727, longitude: -84.483, latitudeDelta: 0.03, longitudeDelta: 0.03 };
const PROXIMITY_M = 150;
const COOLDOWN_MIN = 20;
const PACE_DELAY_MIN = 3;
const PACE_WINDOW_MIN = 45;

function statusToColor(s: LotStatus) {
  if (s === 'empty') return '#22c55e';
  if (s === 'filling') return '#eab308';
  if (s === 'tight') return '#fb923c';
  if (s === 'full') return '#ef4444';
  return '#9ca3af';
}
function haversine(lat1:number, lon1:number, lat2:number, lon2:number) {
  const toRad = (d:number)=> d*Math.PI/180, R = 6371000;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function withinRadius(a:{lat:number,lng:number}, b:{lat:number,lng:number}, meters:number) {
  return haversine(a.lat,a.lng,b.lat,b.lng) <= meters;
}

export default function MapScreen() {
  const [lots, setLots] = useState<LotRow[] | null>(null);
  const [selected, setSelected] = useState<LotRow | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [carma, setCarma] = useState<number>(0);
  const [tier, setTier] = useState<number>(1);
  const [paceCells, setPaceCells] = useState<{ cell_id: string; created_at: string }[]>([]);
  const pollRef = useRef<NodeJS.Timer | null>(null);
  const deviceIdRef = useRef<string | null>(null);

  useEffect(() => { (async () => { deviceIdRef.current = await getDeviceId(); })(); }, []);

  async function fetchLots() {
    const { data, error } = await supabase
      .from('lots')
      .select('id,name,lat,lng,lot_current(status,confidence),favorites(lot_id)')
      .returns<any>();
    if (error) throw error;
    const rows: LotRow[] = (data ?? []).map((r:any)=> ({
      id: r.id, name: r.name, lat: r.lat, lng: r.lng,
      status: r.lot_current?.status ?? null,
      confidence: r.lot_current?.confidence ?? 0,
      isFavorite: Array.isArray(r.favorites) && r.favorites.length > 0
    }));
    setLots(rows);
  }

  async function fetchPace() {
    const { data, error } = await supabase
      .from('pace_reports')
      .select('cell_id, created_at')
      .gte('created_at', new Date(Date.now() - PACE_WINDOW_MIN*60*1000).toISOString());
    if (!error) setPaceCells(data ?? []);
  }

  useEffect(() => { fetchLots().catch(console.warn); fetchPace().catch(console.warn); }, []);

  // Realtime lots
  useEffect(() => {
    const channel = supabase.channel('realtime:lot_current')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lot_current' }, (payload:any) => {
        setLots(prev => {
          if (!prev) return prev;
          const lotId = payload.new?.lot_id ?? payload.old?.lot_id;
          const idx = prev.findIndex(l => l.id === lotId);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], status: payload.new?.status ?? null, confidence: payload.new?.confidence ?? 0 };
          return next;
        });
      })
      .subscribe(status => {
        const ok = status === 'SUBSCRIBED';
        setSubscribed(ok);
        if (!ok && !pollRef.current) {
          pollRef.current = setInterval(()=>fetchLots().catch(()=>{}), 20000);
        } else if (ok && pollRef.current) {
          clearInterval(pollRef.current); pollRef.current = null;
        }
      });
    return () => { supabase.removeChannel(channel); if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Realtime PACE
  useEffect(() => {
    const ch = supabase.channel('realtime:pace')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pace_reports' }, (p:any) => {
        setPaceCells(prev => [{ cell_id: p.new.cell_id, created_at: p.new.created_at }, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const onSubmitStatus = async (status: Exclude<LotStatus, null>) => {
    if (!selected) return;
    const key = `spark:cooldown:${selected.id}`;
    const now = Date.now();
    const existing = await AsyncStorage.getItem(key);
    if (existing) {
      const until = parseInt(existing,10);
      if (until > now) {
        const remaining = Math.max(0, Math.round((until-now)/1000));
        const mm = String(Math.floor(remaining/60)).padStart(2,'0');
        const ss = String(remaining%60).padStart(2,'0');
        Alert.alert('Cooldown', `Try again in ${mm}:${ss}`); return;
      }
    }
    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    if (perm !== 'granted') { Alert.alert('Location needed', 'We use your location to verify reports near lots.'); return; }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const here = { lat: loc.coords.latitude, lng: loc.coords.longitude };
    const lot = { lat: selected.lat, lng: selected.lng };
    if (!withinRadius(here, lot, PROXIMITY_M)) { Alert.alert('Too far', 'You need to be near this lot to report.'); return; }

    const device_id = deviceIdRef.current ?? (await getDeviceId());
    setLots(prev => prev?.map(l => l.id === selected.id ? { ...l, status } : l) ?? prev);
    const { error } = await supabase.from('lot_status_reports').insert({
      lot_id: selected.id, status, device_id, lat: here.lat, lng: here.lng
    });
    if (error) { Alert.alert('Failed', error.message); return; }

    // carma +10
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/apply_carma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ device_id, delta: 10, reason: 'lot_report' })
      });
      const json = await res.json().catch(()=>null);
      if (json && typeof json.carma === 'number') { setCarma(json.carma); setTier(json.tier ?? 1); }
    } catch {}

    const until = now + COOLDOWN_MIN*60*1000;
    await AsyncStorage.setItem(key, String(until));
    setSelected(null);
  };

  const onPace = async () => {
    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    if (perm !== 'granted') { Alert.alert('Location needed', 'We use your location to create a coarse safety alert.'); return; }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const cell_id = coordsToCellId(loc.coords.latitude, loc.coords.longitude);
    await supabase.from('pace_reports').insert({ cell_id });
  };

  const toggleFavorite = async (lot: LotRow) => {
    if (!lots) return;
    const currentlyFav = !!lot.isFavorite;
    if (currentlyFav) {
      await supabase.from('favorites').delete().eq('lot_id', lot.id);
    } else {
      await supabase.from('favorites').insert({ lot_id: lot.id });
    }
    setLots(prev => prev?.map(l => l.id === lot.id ? { ...l, isFavorite: !currentlyFav } : l) ?? prev);
  };

  const visiblePace = useMemo(() => {
    const now = Date.now();
    return paceCells.filter(c => {
      const t = new Date(c.created_at).getTime();
      const ageMin = (now - t)/60000;
      return ageMin >= PACE_DELAY_MIN && ageMin <= PACE_WINDOW_MIN;
    });
  }, [paceCells]);

  const content = useMemo(() => {
    if (!lots) return <ActivityIndicator style={{ marginTop: 24 }} />;
    return (
      <MapView style={{ flex: 1 }} initialRegion={MSU_CENTER}>
        {lots.map(l => (
          <React.Fragment key={l.id}>
            <Marker
              coordinate={{ latitude: l.lat, longitude: l.lng }}
              title={l.name}
              pinColor={statusToColor(l.status)}
              onCalloutPress={() => toggleFavorite(l)}
              onPress={() => setSelected(l)}
              description={l.isFavorite ? '★ Favorite' : 'Tap to set status • Tap callout to star'}
            />
            {!!l.confidence && l.confidence > 0 && (
              <Circle
                center={{ latitude: l.lat, longitude: l.lng }}
                radius={50 + 100 * Math.min(1, Number(l.confidence))}
                strokeColor="rgba(59,130,246,0.25)"
                fillColor="rgba(59,130,246,0.12)"
              />
            )}
          </React.Fragment>
        ))}
        {visiblePace.map((c, i) => {
          const [latStr,lngStr] = c.cell_id.split(',');
          const lat = parseFloat(latStr), lng = parseFloat(lngStr);
          if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
          return (
            <Circle
              key={`${c.cell_id}-${i}`}
              center={{ latitude: lat, longitude: lng }}
              radius={220}
              strokeColor="rgba(239,68,68,0.25)"
              fillColor="rgba(239,68,68,0.12)"
            />
          );
        })}
      </MapView>
    );
  }, [lots, visiblePace]);

  return (
    <View style={{ flex: 1 }}>
      {/* header chip */}
      <View style={styles.header}>
        <Text style={styles.headerText}>Carma: {carma}  ·  Tier {tier}</Text>
      </View>
      {content}
      {/* status sheet */}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={()=>setSelected(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{selected?.name}</Text>
            <View style={styles.row}>
              <Pressable style={[styles.btn,{backgroundColor:'#22c55e'}]} onPress={()=>onSubmitStatus('empty')}><Text style={styles.btnText}>Empty</Text></Pressable>
              <Pressable style={[styles.btn,{backgroundColor:'#eab308'}]} onPress={()=>onSubmitStatus('filling')}><Text style={styles.btnText}>Filling</Text></Pressable>
            </View>
            <View style={styles.row}>
              <Pressable style={[styles.btn,{backgroundColor:'#fb923c'}]} onPress={()=>onSubmitStatus('tight')}><Text style={styles.btnText}>Tight</Text></Pressable>
              <Pressable style={[styles.btn,{backgroundColor:'#ef4444'}]} onPress={()=>onSubmitStatus('full')}><Text style={styles.btnText}>Full</Text></Pressable>
            </View>
            <Pressable style={styles.cancel} onPress={()=>setSelected(null)}><Text style={{color:'#111827'}}>Cancel</Text></Pressable>
            <Text style={styles.hint}>{subscribed ? 'Live' : 'Reconnecting… polling every 20s'}</Text>
          </View>
        </View>
      </Modal>

      {/* PACE FAB */}
      <Pressable onPress={onPace} style={styles.fab}>
        <Text style={styles.fabText}>PACE</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header:{ position:'absolute', top:16, left:16, zIndex:2, backgroundColor:'rgba(17,24,39,0.85)', paddingHorizontal:12, paddingVertical:6, borderRadius:12 },
  headerText:{ color:'white', fontWeight:'700' },
  modalWrap:{flex:1,backgroundColor:'rgba(0,0,0,0.3)',justifyContent:'center',alignItems:'center',padding:16},
  sheet:{backgroundColor:'white',borderRadius:16,padding:16,width:'100%',maxWidth:360},
  title:{fontSize:18,fontWeight:'600',marginBottom:12,textAlign:'center'},
  row:{flexDirection:'row',gap:12,justifyContent:'space-between',marginBottom:12},
  btn:{flex:1,paddingVertical:14,borderRadius:12,alignItems:'center'},
  btnText:{color:'white',fontWeight:'700'},
  cancel:{paddingVertical:12,alignItems:'center',borderRadius:10,backgroundColor:'#e5e7eb'},
  hint:{textAlign:'center',marginTop:8,color:'#6b7280',fontSize:12},
  fab:{ position:'absolute', right:16, bottom:30, backgroundColor:'#ef4444', paddingHorizontal:18, paddingVertical:14, borderRadius:24, elevation:6 },
  fabText:{ color:'white', fontWeight:'800', letterSpacing:1 }
});
