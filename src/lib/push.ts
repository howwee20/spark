import { Platform, ToastAndroid, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';

import { getDeviceId } from '@/utils/device';

const REGISTERED_KEY = 'spark:push:registered';
const TESTED_KEY = 'spark:push:test:done';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const FUNCTIONS_URL = SUPABASE_URL?.replace('.supabase.co', '.functions.supabase.co');

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function showToast(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert(message);
  }
}

async function requestPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  return status === 'granted';
}

function getProjectId(): string | undefined {
  const easProjectId = Constants.easConfig?.projectId;
  if (easProjectId) return easProjectId;
  const configProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (configProjectId) return configProjectId;
  const envProjectId = process.env.EXPO_PUBLIC_EXPO_PROJECT_ID;
  return envProjectId;
}

let registering: Promise<boolean> | null = null;

async function register(): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !FUNCTIONS_URL) {
    console.warn('Missing Supabase env for push registration');
    return false;
  }

  const granted = await requestPermission();
  if (!granted) {
    return false;
  }

  if (!Device.isDevice) {
    console.warn('Push notifications require physical device');
    return false;
  }

  const projectId = getProjectId();
  if (!projectId) {
    console.warn('Missing Expo project ID for push notifications');
    return false;
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  const expoToken = tokenResponse.data;
  const deviceId = await getDeviceId();

  const payload = {
    device_id: deviceId,
    expo_token: expoToken,
    platform: Platform.OS,
  };

  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };

  const registerRes = await fetch(`${FUNCTIONS_URL}/registerDevice`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!registerRes.ok) {
    console.warn('registerDevice failed', registerRes.status);
    return false;
  }

  await AsyncStorage.setItem(REGISTERED_KEY, '1');

  const alreadyTested = await AsyncStorage.getItem(TESTED_KEY);
  if (!alreadyTested) {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const title = notification.request.content.title ?? '';
      if (title.toLowerCase().includes('spark test')) {
        showToast('Push connected!');
        AsyncStorage.setItem(TESTED_KEY, '1').catch(() => {});
        subscription.remove();
      }
    });

    try {
      await fetch(`${FUNCTIONS_URL}/testPush`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ device_id: deviceId }),
      });
    } catch (error) {
      console.warn('testPush failed', error);
    }

    // Ensure we don't leak the listener if the push never arrives
    setTimeout(() => {
      try {
        subscription.remove();
      } catch {
        // ignore
      }
    }, 15000);
  }

  return true;
}

export async function ensurePushRegistration(): Promise<boolean> {
  if (registering) {
    return registering;
  }

  registering = (async () => {
    try {
      const already = await AsyncStorage.getItem(REGISTERED_KEY);
      if (already) {
        return true;
      }
      return await register();
    } finally {
      registering = null;
    }
  })();

  return registering;
}
