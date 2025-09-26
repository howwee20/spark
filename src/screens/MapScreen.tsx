import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Circle, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
// eslint-disable-next-line import/no-unresolved
import { supabase } from '@/lib/supabase';
// eslint-disable-next-line import/no-unresolved
import { getDeviceId } from '@/utils/device';

type LotStatus = 'empty' | 'filling' | 'tight' | 'full' | null;
type LotRow = { id: string; name: string; lat: number; lng: number; status: LotStatus; confidence: number | null };

const MSU_CENTER: Region = { latitude: 42.727, longitude: -84.483, latitudeDelta: 0.03, longitudeDelta: 0.03 };
const PROXIMITY_M = 150;
const COOLDOWN_MIN = 20;

function statusToColor(s: LotStatus) {
  if (s === 'empty') return '#22c55e';
  if (s === 'filling') return '#eab308';
  if (s === 'tight') return '#fb923c';
  if (s === 'full') return '#ef4444';
  return '#9ca3af'; // gray
}

function haversine(lat1:number, lon1:number, lat2:number, lon2:number) {
  const toRad = (d:number)=> d*Math.PI/180;
  const R = 6371000;
  const dLat = toRad(lat2-lat1); const dLon = toRad(lon2-lon1);
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
  const pollRef = useRef<NodeJS.Timer | null>(null);
  const [carma, setCarma] = useState<number | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [carmaLoading, setCarmaLoading] = useState(false);

  const applyCarma = async (delta: number, reason: string) => {
    const device_id = await getDeviceId();
    const { data, error } = await supabase.functions.invoke('apply_carma', {
      body: { phone_hash: null, device_id, delta, reason },
    });
    if (error) throw error;
    return data as { carma: number; tier: string };
  };

  async function fetchLots() {
    const { data, error } = await supabase
      .from('lots')
      .select('id,name,lat,lng,lot_current(status,confidence)')
      .returns<any>();
    if (error) throw error;
    const rows: LotRow[] = (data ?? []).map((r:any)=> ({
      id: r.id, name: r.name, lat: r.lat, lng: r.lng,
      status: r.lot_current?.status ?? null,
      confidence: r.lot_current?.confidence ?? 0
    }));
    setLots(rows);
  }

  useEffect(() => {
    fetchLots().catch((e)=> console.warn('fetchLots', e));
  }, []);

  useEffect(() => {
    let active = true;
    setCarmaLoading(true);
    applyCarma(0, 'initial_fetch')
      .then((res) => {
        if (!active || !res) return;
        setCarma(res.carma);
        setTier(res.tier);
      })
      .catch((err) => console.warn('fetchCarma', err))
      .finally(() => {
        if (active) setCarmaLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const channel = supabase.channel('realtime:lot_current')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lot_current' }, (payload:any) => {
        setLots(prev => {
          if (!prev) return prev;
          const idx = prev.findIndex(l => l.id === payload.new?.lot_id || payload.old?.lot_id);
          if (idx === -1) return prev;
          const next = [...prev];
          const cur = next[idx];
          next[idx] = {
            ...cur,
            status: payload.new?.status ?? null,
            confidence: payload.new?.confidence ?? 0
          };
          return next;
        });
      })
      .subscribe((status) => {
        const ok = status === 'SUBSCRIBED';
        setSubscribed(ok);
        if (!ok && !pollRef.current) {
          pollRef.current = setInterval(() => fetchLots().catch(()=>{}), 20000);
        } else if (ok && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      });

    return () => {
      supabase.removeChannel(channel);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const onSubmitStatus = async (status: Exclude<LotStatus, null>) => {
    if (!selected) return;

    // cooldown
    const key = `spark:cooldown:${selected.id}`;
    const now = Date.now();
    const existing = await AsyncStorage.getItem(key);
    if (existing) {
      const until = parseInt(existing, 10);
      if (until > now) {
        const remaining = Math.max(0, Math.round((until - now)/1000));
        const mm = Math.floor(remaining/60).toString().padStart(2, '0');
        const ss = (remaining%60).toString().padStart(2, '0');
        Alert.alert('Cooldown', `Try again in ${mm}:${ss}`);
        return;
      }
    }

    // permission & location
    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    if (perm !== 'granted') {
      Alert.alert('Location needed', 'We use your location to verify reports near lots.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const here = { lat: loc.coords.latitude, lng: loc.coords.longitude };
    const lot = { lat: selected.lat, lng: selected.lng };
    if (!withinRadius(here, lot, PROXIMITY_M)) {
      Alert.alert('Too far', 'You need to be near this lot to report.');
      return;
    }

    // insert
    const device_id = await getDeviceId();
    setLots(prev => prev?.map(l => l.id === selected.id ? { ...l, status } : l) ?? prev); // optimistic
    const { error } = await supabase.from('lot_status_reports').insert({
      lot_id: selected.id, status, device_id, lat: here.lat, lng: here.lng
    });
    if (error) {
      Alert.alert('Failed', error.message);
      return;
    }
    const until = now + COOLDOWN_MIN*60*1000;
    await AsyncStorage.setItem(key, String(until));
    setSelected(null);

    applyCarma(10, 'lot_report')
      .then((res) => {
        if (!res) return;
        setCarma(res.carma);
        setTier(res.tier);
      })
      .catch((err) => console.warn('apply_carma', err));
  };

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
              onPress={() => setSelected(l)}
            />
            {!!l.confidence && l.confidence > 0 && (
              <Circle
                center={{ latitude: l.lat, longitude: l.lng }}
                radius={50 + 100 * Math.min(1, l.confidence)}
                strokeColor="rgba(59,130,246,0.25)"
                fillColor="rgba(59,130,246,0.12)"
              />
            )}
          </React.Fragment>
        ))}
      </MapView>
    );
  }, [lots]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Spark</Text>
        <View style={styles.carmaChip}>
          <Text style={styles.carmaChipText}>
            {carmaLoading ? 'Carma: …' : `Carma: ${carma ?? 0}${tier ? ` (${tier})` : ''}`}
          </Text>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {content}
      </View>
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{selected?.name}</Text>
            <View style={styles.row}>
              <Pressable style={[styles.btn,{backgroundColor:'#22c55e'}]} onPress={()=>onSubmitStatus('empty')}>
                <Text style={styles.btnText}>Empty</Text>
              </Pressable>
              <Pressable style={[styles.btn,{backgroundColor:'#eab308'}]} onPress={()=>onSubmitStatus('filling')}>
                <Text style={styles.btnText}>Filling</Text>
              </Pressable>
            </View>
            <View style={styles.row}>
              <Pressable style={[styles.btn,{backgroundColor:'#fb923c'}]} onPress={()=>onSubmitStatus('tight')}>
                <Text style={styles.btnText}>Tight</Text>
              </Pressable>
              <Pressable style={[styles.btn,{backgroundColor:'#ef4444'}]} onPress={()=>onSubmitStatus('full')}>
                <Text style={styles.btnText}>Full</Text>
              </Pressable>
            </View>
            <Pressable style={styles.cancel} onPress={()=>setSelected(null)}>
              <Text style={{color:'#111827'}}>Cancel</Text>
            </Pressable>
            <Text style={styles.hint}>
              {subscribed ? 'Live' : 'Reconnecting… polling every 20s'}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header:{paddingHorizontal:16,paddingVertical:12,backgroundColor:'white',borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#e5e7eb',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  headerTitle:{fontSize:18,fontWeight:'700',color:'#111827'},
  carmaChip:{backgroundColor:'#111827',borderRadius:999,paddingHorizontal:12,paddingVertical:6},
  carmaChipText:{color:'white',fontWeight:'600'},
  modalWrap:{flex:1,backgroundColor:'rgba(0,0,0,0.3)',justifyContent:'center',alignItems:'center',padding:16},
  sheet:{backgroundColor:'white',borderRadius:16,padding:16,width:'100%',maxWidth:360},
  title:{fontSize:18,fontWeight:'600',marginBottom:12,textAlign:'center'},
  row:{flexDirection:'row',gap:12,justifyContent:'space-between',marginBottom:12},
  btn:{flex:1,paddingVertical:14,borderRadius:12,alignItems:'center'},
  btnText:{color:'white',fontWeight:'700'},
  cancel:{paddingVertical:12,alignItems:'center',borderRadius:10,backgroundColor:'#e5e7eb'},
  hint:{textAlign:'center',marginTop:8,color:'#6b7280',fontSize:12}
});
