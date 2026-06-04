import { useEffect, useState } from "react";

export function useLocalStorage<T>(key: string, initialValue: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return initialValue;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}
