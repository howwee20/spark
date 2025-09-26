import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'spark:device_id';

const generateDeviceId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

export const getDeviceId = async (): Promise<string> => {
  const existingId = await AsyncStorage.getItem(STORAGE_KEY);

  if (existingId) {
    return existingId;
  }

  const newId = generateDeviceId();
  await AsyncStorage.setItem(STORAGE_KEY, newId);

  return newId;
};
