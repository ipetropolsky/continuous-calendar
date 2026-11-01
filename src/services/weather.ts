import {
    Cloud,
    CloudDrizzle,
    CloudFog,
    CloudLightning,
    CloudRain,
    CloudSnow,
    CloudSun,
    type LucideIcon,
    Sun,
} from 'lucide-react';

// Weather and geocoding are provided by Open-Meteo (https://open-meteo.com), no API key required

export interface City {
    id: number;
    name: string;
    country?: string;
    admin1?: string;
    latitude: number;
    longitude: number;
}

export interface DayWeather {
    code: number;
    tMax: number;
    tMin: number;
}

export type WeatherByDate = Record<string, DayWeather>; // Keyed by YYYY-MM-DD

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

// Forecast API covers ~3 months of the past and 16 days ahead (including today)
const FORECAST_PAST_DAYS = 92;
const FORECAST_FUTURE_DAYS = 15;

const LAST_CITY_STORAGE_KEY = 'lastCity';

const language = navigator.language.slice(0, 2);

// Format date to YYYY-MM-DD string
const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

const toCity = (raw: City): City => ({
    id: raw.id,
    name: raw.name,
    country: raw.country,
    admin1: raw.admin1,
    latitude: raw.latitude,
    longitude: raw.longitude,
});

export const formatCityLabel = (city: City): string =>
    [city.name, city.admin1 !== city.name ? city.admin1 : null, city.country].filter(Boolean).join(', ');

export const searchCities = async (query: string, signal?: AbortSignal): Promise<City[]> => {
    const params = new URLSearchParams({ name: query, count: '6', language });
    const response = await fetch(`${GEOCODING_URL}/search?${params}`, { signal });
    if (!response.ok) {
        throw new Error(`City search failed: ${response.status}`);
    }
    const data: { results?: City[] } = await response.json();
    return (data.results ?? []).map(toCity);
};

export const getCityById = async (id: number): Promise<City | null> => {
    const params = new URLSearchParams({ id: id.toString(), language });
    const response = await fetch(`${GEOCODING_URL}/get?${params}`);
    if (!response.ok) {
        return null;
    }
    return toCity(await response.json());
};

const fetchDaily = async (url: string, city: City, start: Date, end: Date): Promise<WeatherByDate> => {
    const params = new URLSearchParams({
        latitude: city.latitude.toString(),
        longitude: city.longitude.toString(),
        daily: 'weather_code,temperature_2m_max,temperature_2m_min',
        timezone: 'auto',
        start_date: formatDate(start),
        end_date: formatDate(end),
    });
    const response = await fetch(`${url}?${params}`);
    if (!response.ok) {
        throw new Error(`Weather request failed: ${response.status}`);
    }
    const data: {
        daily: {
            time: string[];
            weather_code: (number | null)[];
            temperature_2m_max: (number | null)[];
            temperature_2m_min: (number | null)[];
        };
    } = await response.json();

    const result: WeatherByDate = {};
    data.daily.time.forEach((date, index) => {
        const code = data.daily.weather_code[index];
        if (code === null) {
            return;
        }
        result[date] = {
            code,
            tMax: data.daily.temperature_2m_max[index] ?? NaN,
            tMin: data.daily.temperature_2m_min[index] ?? NaN,
        };
    });
    return result;
};

const weatherCache = new Map<string, Promise<WeatherByDate>>();

// Daily weather for a date range: archive for the old past, forecast for the recent past and the next 16 days.
// Dates beyond the forecast horizon are skipped.
export const fetchDailyWeather = (city: City, start: Date, end: Date): Promise<WeatherByDate> => {
    const cacheKey = `${city.id}:${formatDate(start)}:${formatDate(end)}`;
    const cached = weatherCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const forecastStart = addDays(today, -FORECAST_PAST_DAYS);
    const forecastEnd = addDays(today, FORECAST_FUTURE_DAYS);

    const requests: Promise<WeatherByDate>[] = [];
    if (start < forecastStart) {
        const archiveEnd = end < forecastStart ? end : addDays(forecastStart, -1);
        requests.push(fetchDaily(ARCHIVE_URL, city, start, archiveEnd));
    }
    if (end >= forecastStart && start <= forecastEnd) {
        requests.push(
            fetchDaily(
                FORECAST_URL,
                city,
                start > forecastStart ? start : forecastStart,
                end < forecastEnd ? end : forecastEnd
            )
        );
    }

    const promise = Promise.all(requests).then((results) => Object.assign({}, ...results) as WeatherByDate);
    // Allow retry on failure
    promise.catch(() => weatherCache.delete(cacheKey));
    weatherCache.set(cacheKey, promise);
    return promise;
};

// WMO weather interpretation codes
export const getWeatherInfo = (code: number): { icon: LucideIcon; description: string; color: string } => {
    if (code === 0) {
        return { icon: Sun, description: 'Clear sky', color: 'text-amber-500' };
    }
    if (code <= 2) {
        return { icon: CloudSun, description: 'Partly cloudy', color: 'text-amber-500' };
    }
    if (code === 3) {
        return { icon: Cloud, description: 'Overcast', color: 'text-slate-500' };
    }
    if (code === 45 || code === 48) {
        return { icon: CloudFog, description: 'Fog', color: 'text-slate-500' };
    }
    if (code >= 51 && code <= 57) {
        return { icon: CloudDrizzle, description: 'Drizzle', color: 'text-sky-500' };
    }
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
        return { icon: CloudRain, description: 'Rain', color: 'text-sky-600' };
    }
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
        return { icon: CloudSnow, description: 'Snow', color: 'text-sky-400' };
    }
    if (code >= 95) {
        return { icon: CloudLightning, description: 'Thunderstorm', color: 'text-violet-600' };
    }
    return { icon: Cloud, description: 'Cloudy', color: 'text-slate-500' };
};

export const loadLastCity = (): City | null => {
    try {
        const stored = localStorage.getItem(LAST_CITY_STORAGE_KEY);
        return stored ? (JSON.parse(stored) as City) : null;
    } catch {
        return null;
    }
};

export const saveLastCity = (city: City) => {
    try {
        localStorage.setItem(LAST_CITY_STORAGE_KEY, JSON.stringify(city));
    } catch {
        // Ignore storage errors (private mode, quota)
    }
};
