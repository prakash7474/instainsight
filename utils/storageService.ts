import AsyncStorage from '@react-native-async-storage/async-storage';

export type StorageParseOptions<T> = {
  defaultValue: T;
  validate?: (value: unknown) => value is T;
};

export async function getJsonFromStorage<T>(
  key: string,
  options: StorageParseOptions<T>
): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return options.defaultValue;

    const parsed = JSON.parse(raw) as unknown;
    if (options.validate && !options.validate(parsed)) {
      return options.defaultValue;
    }
    return (parsed as T) ?? options.defaultValue;
  } catch {
    return options.defaultValue;
  }
}

export async function setJsonToStorage<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function removeFromStorage(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

