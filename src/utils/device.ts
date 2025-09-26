import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

const KEY = 'spark:device_id';

export async function getDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(KEY);
    if (existing) return existing;
    const id = uuidv4();
    await AsyncStorage.setItem(KEY, id);
    return id;
  } catch {
    return uuidv4(); // ephemeral fallback
  }
}
