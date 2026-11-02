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
    isTypical?: boolean; // Estimated from past years statistics, not a forecast
}

export type WeatherByDate = Record<string, DayWeather>; // Keyed by YYYY-MM-DD

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

// Forecast API covers 16 days ahead (including today), its past data has gaps after ~50 days,
// so older dates are taken from the archive which lags only a few days
const FORECAST_PAST_DAYS = 7;
const FORECAST_FUTURE_DAYS = 15;

// Typical weather is calculated from the archive of past years, each day uses ± a few neighbouring days
const CLIMATE_YEARS = 5;
const CLIMATE_WINDOW_DAYS = 3;
const WET_DAY_PRECIPITATION = 1; // mm

const LEGACY_LAST_CITY_STORAGE_KEY = 'lastCity';
const RECENT_CITIES_STORAGE_KEY = 'recentCities';
const DEFAULT_CITY_STORAGE_KEY = 'defaultCity';
const RECENT_CITIES_LIMIT = 3;

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

// Past weather from the given date and forecast up to the forecast horizon
export const fetchWeatherUntilHorizon = (city: City, start: Date): Promise<WeatherByDate> => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return fetchDailyWeather(city, start, addDays(today, FORECAST_FUTURE_DAYS));
};

export const isBeyondForecast = (date: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date > addDays(today, FORECAST_FUTURE_DAYS);
};

export type TypicalWeather = Record<string, DayWeather>; // Keyed by MM-DD

const average = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};

interface ClimateSample {
    precipitation: number;
    snowWater: number;
    cloudCover: number;
    tMax: number;
    tMin: number;
}

// WMO weather code that describes the most typical day among samples
const getTypicalCode = (samples: ClimateSample[]): number => {
    const wetSamples = samples.filter(({ precipitation }) => precipitation >= WET_DAY_PRECIPITATION);
    if (wetSamples.length / samples.length >= 0.45) {
        const snowySamples = wetSamples.filter(({ precipitation, snowWater }) => snowWater >= precipitation / 2);
        const isSnowy = snowySamples.length / wetSamples.length >= 0.5;
        const wetPrecipitation = median(wetSamples.map(({ precipitation }) => precipitation));
        if (isSnowy) {
            return wetPrecipitation >= 5 ? 73 : 71;
        }
        return wetPrecipitation >= 5 ? 63 : 61;
    }
    const cloudCover = average(samples.map(({ cloudCover }) => cloudCover));
    if (cloudCover >= 80) {
        return 3;
    }
    if (cloudCover >= 45) {
        return 2;
    }
    return 0;
};

const climateCache = new Map<number, Promise<TypicalWeather>>();

// Typical weather for every day of the year based on the last full years of the archive
export const fetchTypicalWeather = (city: City): Promise<TypicalWeather> => {
    const cached = climateCache.get(city.id);
    if (cached) {
        return cached;
    }

    const lastYear = new Date().getFullYear() - 1;
    const params = new URLSearchParams({
        latitude: city.latitude.toString(),
        longitude: city.longitude.toString(),
        daily: 'precipitation_sum,snowfall_sum,cloud_cover_mean,temperature_2m_max,temperature_2m_min',
        timezone: 'auto',
        start_date: `${lastYear - CLIMATE_YEARS + 1}-01-01`,
        end_date: `${lastYear}-12-31`,
    });

    const promise = fetch(`${ARCHIVE_URL}?${params}`)
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Climate request failed: ${response.status}`);
            }
            return response.json();
        })
        .then(
            (data: {
                daily: {
                    time: string[];
                    precipitation_sum: (number | null)[];
                    snowfall_sum: (number | null)[];
                    cloud_cover_mean: (number | null)[];
                    temperature_2m_max: (number | null)[];
                    temperature_2m_min: (number | null)[];
                };
            }) => {
                const { daily } = data;
                // Samples grouped by day of the year (MM-DD)
                const samplesByDay = new Map<string, ClimateSample[]>();
                daily.time.forEach((date, index) => {
                    const precipitation = daily.precipitation_sum[index];
                    const cloudCover = daily.cloud_cover_mean[index];
                    const tMax = daily.temperature_2m_max[index];
                    const tMin = daily.temperature_2m_min[index];
                    if (precipitation === null || cloudCover === null || tMax === null || tMin === null) {
                        return;
                    }
                    const sample: ClimateSample = {
                        precipitation,
                        // Snowfall in cm is about 0.7 of its water equivalent in mm
                        snowWater: (daily.snowfall_sum[index] ?? 0) / 0.7,
                        cloudCover,
                        tMax,
                        tMin,
                    };
                    const dayDate = new Date(`${date}T00:00:00`);
                    for (let offset = -CLIMATE_WINDOW_DAYS; offset <= CLIMATE_WINDOW_DAYS; offset++) {
                        const key = formatDate(addDays(dayDate, offset)).slice(5);
                        const samples = samplesByDay.get(key) ?? [];
                        samples.push(sample);
                        samplesByDay.set(key, samples);
                    }
                });

                const result: TypicalWeather = {};
                samplesByDay.forEach((samples, key) => {
                    result[key] = {
                        code: getTypicalCode(samples),
                        tMax: average(samples.map(({ tMax }) => tMax)),
                        tMin: average(samples.map(({ tMin }) => tMin)),
                        isTypical: true,
                    };
                });
                return result;
            }
        );
    // Allow retry on failure
    promise.catch(() => climateCache.delete(city.id));
    climateCache.set(city.id, promise);
    return promise;
};

const loadJSON = <T>(key: string): T | null => {
    try {
        const stored = localStorage.getItem(key);
        return stored ? (JSON.parse(stored) as T) : null;
    } catch {
        return null;
    }
};

const saveJSON = (key: string, value: unknown) => {
    try {
        if (value === null) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, JSON.stringify(value));
        }
    } catch {
        // Ignore storage errors (private mode, quota)
    }
};

// Recently chosen cities, the most recent first. The first one is the default for new intervals.
export const loadRecentCities = (): City[] => {
    const recentCities = loadJSON<City[]>(RECENT_CITIES_STORAGE_KEY);
    if (recentCities) {
        return recentCities;
    }
    const legacyLastCity = loadJSON<City>(LEGACY_LAST_CITY_STORAGE_KEY);
    return legacyLastCity ? [legacyLastCity] : [];
};

export const addRecentCity = (recentCities: City[], city: City): City[] =>
    [city, ...recentCities.filter(({ id }) => id !== city.id)].slice(0, RECENT_CITIES_LIMIT);

export const saveRecentCities = (recentCities: City[]) => {
    saveJSON(RECENT_CITIES_STORAGE_KEY, recentCities);
    saveJSON(LEGACY_LAST_CITY_STORAGE_KEY, null);
};

// City used to show weather on days outside of intervals
export const loadDefaultCity = (): City | null => loadJSON<City>(DEFAULT_CITY_STORAGE_KEY);

export const saveDefaultCity = (city: City | null) => saveJSON(DEFAULT_CITY_STORAGE_KEY, city);
