// Persistent weather cache. The interface is async, so localStorage can be replaced (e.g. with IndexedDB)
// without changing the weather service. Only the weather service uses it.

const KEY_PREFIX = 'weather:v1:';

export const readWeatherCache = async <T>(key: string): Promise<T | null> => {
    try {
        const stored = localStorage.getItem(`${KEY_PREFIX}${key}`);
        return stored ? (JSON.parse(stored) as T) : null;
    } catch {
        return null;
    }
};

export const writeWeatherCache = async (key: string, value: unknown): Promise<void> => {
    try {
        localStorage.setItem(`${KEY_PREFIX}${key}`, JSON.stringify(value));
    } catch {
        // Ignore storage errors (private mode, quota), the data will be requested again
    }
};

export const removeWeatherCache = async (key: string): Promise<void> => {
    try {
        localStorage.removeItem(`${KEY_PREFIX}${key}`);
    } catch {
        // Ignore storage errors
    }
};
