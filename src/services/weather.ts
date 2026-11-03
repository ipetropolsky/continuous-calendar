// Weather and geocoding are provided by Open-Meteo (https://open-meteo.com), no API key required

import { readWeatherCache, removeWeatherCache, writeWeatherCache } from '@/services/weatherStorage';

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

// Archive days without data are stored (and not requested again) only when they are older than this,
// recent days may be missing because the archive lags behind
const ARCHIVE_FINAL_DAYS = 30;

// Forecast is requested again when the stored one is older than this
const FORECAST_TTL = 12 * 60 * 60 * 1000;

// Typical weather is calculated from the archive of past years, each day uses ± a few neighbouring days
const CLIMATE_YEARS = 5;
const CLIMATE_WINDOW_DAYS = 3;
const WET_DAY_PRECIPITATION = 1; // mm

const LEGACY_LAST_CITY_STORAGE_KEY = 'lastCity';
const RECENT_CITIES_STORAGE_KEY = 'recentCities';
const DEFAULT_CITY_STORAGE_KEY = 'defaultCity';
// Cities looked up by id, so cities from the URL are known before the first render on the next visits
const KNOWN_CITIES_STORAGE_KEY = 'knownCities';
const SHOW_TEMPERATURE_STORAGE_KEY = 'showTemperature';
const KNOWN_CITIES_LIMIT = 500; // ~150 bytes each
const RECENT_CITIES_LIMIT = 5;

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
    const city = toCity(await response.json());
    saveKnownCity(city);
    return city;
};

// Daily weather code is the most severe hourly one, so a single overcast hour (at night too) makes a sunny day
// overcast. Days without precipitation get the code by the mean cloud cover: compared with the total cloud cover
// observed at weather stations it is right much more often than the share of sunshine, which makes days too clear.
// The code only gets lower, never cloudier than the API one.
const getDayCloudCode = (code: number, cloudCover: number | null): number => {
    if (code > 3 || cloudCover === null) {
        return code;
    }
    const dayCode = cloudCover < 20 ? 0 : cloudCover < 45 ? 1 : cloudCover < 80 ? 2 : 3;
    return Math.min(code, dayCode);
};

// `range` is either start_date and end_date or past_days and forecast_days
const fetchDaily = async (url: string, city: City, range: Record<string, string>): Promise<WeatherByDate> => {
    const params = new URLSearchParams({
        latitude: city.latitude.toString(),
        longitude: city.longitude.toString(),
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,cloud_cover_mean',
        timezone: 'auto',
        ...range,
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
            cloud_cover_mean: (number | null)[];
        };
    } = await response.json();

    const result: WeatherByDate = {};
    data.daily.time.forEach((date, index) => {
        const code = data.daily.weather_code[index];
        if (code === null) {
            return;
        }
        result[date] = {
            code: getDayCloudCode(code, data.daily.cloud_cover_mean[index]),
            tMax: data.daily.temperature_2m_max[index] ?? NaN,
            tMin: data.daily.temperature_2m_min[index] ?? NaN,
        };
    });
    return result;
};

const getToday = (): Date => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
};

const getForecastRange = (): { start: Date; end: Date } => {
    const today = getToday();
    return { start: addDays(today, -FORECAST_PAST_DAYS), end: addDays(today, FORECAST_FUTURE_DAYS) };
};

const getDates = (start: Date, end: Date): string[] => {
    const dates: string[] = [];
    for (let date = new Date(start); date <= end; date = addDays(date, 1)) {
        dates.push(formatDate(date));
    }
    return dates;
};

// Archive of past days is final, so it is stored forever. Old days without data are stored as null
// to avoid requesting them again.
interface Archive {
    days: Record<string, DayWeather | null>;
    pending: Map<string, Promise<void>>; // Requests in flight by date
}

const archives = new Map<number, Promise<Archive>>();

// Archive and forecast stored with the previous cloud codes (uncorrected, then corrected by sunshine)
const legacyCacheRemoved = new Set<number>();
const removeLegacyCache = (cityId: number) => {
    if (legacyCacheRemoved.has(cityId)) {
        return;
    }
    legacyCacheRemoved.add(cityId);
    void removeWeatherCache(`archive:${cityId}`);
    void removeWeatherCache(`forecast:${cityId}`);
    void removeWeatherCache(`archive2:${cityId}`);
    void removeWeatherCache(`forecast2:${cityId}`);
};

const loadArchive = (cityId: number): Promise<Archive> => {
    let archive = archives.get(cityId);
    if (!archive) {
        removeLegacyCache(cityId);
        archive = readWeatherCache<Archive['days']>(`archive3:${cityId}`).then((days) => ({
            days: days ?? {},
            pending: new Map(),
        }));
        archives.set(cityId, archive);
    }
    return archive;
};

// Requests only days that are neither stored nor being requested, so overlapping calls share requests
const fetchArchiveWeather = async (city: City, start: Date, end: Date): Promise<WeatherByDate> => {
    const archive = await loadArchive(city.id);
    const dates = getDates(start, end);
    const requests = new Set<Promise<void>>();

    // Consecutive missing days are requested together
    const missingRuns: string[][] = [];
    let missingRun: string[] | null = null;
    for (const date of dates) {
        const pending = archive.pending.get(date);
        if (pending || date in archive.days) {
            if (pending) {
                requests.add(pending);
            }
            missingRun = null;
            continue;
        }
        if (!missingRun) {
            missingRun = [];
            missingRuns.push(missingRun);
        }
        missingRun.push(date);
    }

    missingRuns.forEach((runDates) => {
        const request = fetchDaily(ARCHIVE_URL, city, {
            start_date: runDates[0],
            end_date: runDates[runDates.length - 1],
        })
            .then((weatherByDate) => {
                // An empty response is not trusted, recent days without data may get it later
                const isEmpty = Object.keys(weatherByDate).length === 0;
                const finalBefore = formatDate(addDays(getToday(), -ARCHIVE_FINAL_DAYS));
                runDates.forEach((date) => {
                    const dayWeather = weatherByDate[date];
                    if (dayWeather) {
                        archive.days[date] = dayWeather;
                    } else if (!isEmpty && date < finalBefore) {
                        archive.days[date] = null;
                    }
                });
                void writeWeatherCache(`archive3:${city.id}`, archive.days);
            })
            .finally(() => runDates.forEach((date) => archive.pending.delete(date)));
        runDates.forEach((date) => archive.pending.set(date, request));
        requests.add(request);
    });

    const results = await Promise.allSettled(requests);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) {
        throw failure.reason;
    }
    const result: WeatherByDate = {};
    dates.forEach((date) => {
        const dayWeather = archive.days[date];
        if (dayWeather) {
            result[date] = dayWeather;
        }
    });
    return result;
};

// Forecast for the last week and 16 days ahead, requested again when it is older than FORECAST_TTL
interface ForecastRequest {
    start: string;
    fetchedAt: number;
    promise: Promise<WeatherByDate>;
}

const forecasts = new Map<number, ForecastRequest>();

const fetchForecastWeather = (city: City): Promise<WeatherByDate> => {
    const { start } = getForecastRange();
    const startDate = formatDate(start);
    const current = forecasts.get(city.id);
    if (current && current.start === startDate && Date.now() - current.fetchedAt < FORECAST_TTL) {
        return current.promise;
    }

    const request: ForecastRequest = { start: startDate, fetchedAt: Date.now(), promise: Promise.resolve({}) };
    request.promise = (async () => {
        removeLegacyCache(city.id);
        const stored = await readWeatherCache<Omit<ForecastRequest, 'promise'> & { days: WeatherByDate }>(
            `forecast3:${city.id}`
        );
        if (stored && stored.start === startDate && request.fetchedAt - stored.fetchedAt < FORECAST_TTL) {
            request.fetchedAt = stored.fetchedAt;
            return stored.days;
        }
        // Days are counted by the API from its own today (UTC), explicit dates beyond its range fail the request
        // around midnight. One more past day covers locations whose today is ahead of the local one.
        const days = await fetchDaily(FORECAST_URL, city, {
            past_days: String(FORECAST_PAST_DAYS + 1),
            forecast_days: String(FORECAST_FUTURE_DAYS + 1),
        });
        // Not stored, so it is requested again
        if (Object.keys(days).length === 0) {
            throw new Error('Forecast is empty');
        }
        void writeWeatherCache(`forecast3:${city.id}`, { start: startDate, fetchedAt: request.fetchedAt, days });
        return days;
    })();
    // Allow retry on failure
    request.promise.catch(() => {
        if (forecasts.get(city.id) === request) {
            forecasts.delete(city.id);
        }
    });
    forecasts.set(city.id, request);
    return request.promise;
};

// Daily weather for a date range: archive for the old past, forecast for the last week and the next 16 days.
// Dates beyond the forecast horizon are skipped. Each part is passed to onLoad as soon as it is loaded,
// the promise is rejected if any part failed.
export const loadDailyWeather = async (
    city: City,
    start: Date,
    end: Date,
    onLoad: (weatherByDate: WeatherByDate) => void
): Promise<void> => {
    const { start: forecastStart, end: forecastEnd } = getForecastRange();
    const requests: Promise<WeatherByDate>[] = [];

    if (start < forecastStart) {
        requests.push(fetchArchiveWeather(city, start, end < forecastStart ? end : addDays(forecastStart, -1)));
    }
    if (end >= forecastStart && start <= forecastEnd) {
        const from = formatDate(start > forecastStart ? start : forecastStart);
        const to = formatDate(end < forecastEnd ? end : forecastEnd);
        requests.push(
            fetchForecastWeather(city).then((days) =>
                Object.fromEntries(Object.entries(days).filter(([date]) => date >= from && date <= to))
            )
        );
    }

    const results = await Promise.allSettled(
        requests.map((request) =>
            request.then((weatherByDate) => {
                if (Object.keys(weatherByDate).length > 0) {
                    onLoad(weatherByDate);
                }
            })
        )
    );
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) {
        throw failure.reason;
    }
};

// Past weather from the given date and forecast up to the forecast horizon
export const loadWeatherUntilHorizon = (
    city: City,
    start: Date,
    onLoad: (weatherByDate: WeatherByDate) => void
): Promise<void> => loadDailyWeather(city, start, getForecastRange().end, onLoad);

// Typical weather is shown beyond the forecast horizon and until the forecast is loaded
export const canShowTypicalWeather = (date: Date): boolean => date >= getForecastRange().start;

// Typical weather is needed for a range only if it ends beyond the forecast horizon
export const isBeyondForecast = (date: Date): boolean => date > getForecastRange().end;

export type TypicalWeather = Record<string, DayWeather>; // Keyed by MM-DD

const average = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

// Averaged temperatures are rounded to keep stored data small
const roundTemperature = (value: number): number => Math.round(value * 10) / 10;

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

// Typical weather for every day of the year calculated from the archive of the given years
const requestTypicalWeather = (city: City, firstYear: number, lastYear: number): Promise<TypicalWeather> => {
    const params = new URLSearchParams({
        latitude: city.latitude.toString(),
        longitude: city.longitude.toString(),
        daily: 'precipitation_sum,snowfall_sum,cloud_cover_mean,temperature_2m_max,temperature_2m_min',
        timezone: 'auto',
        start_date: `${firstYear}-01-01`,
        end_date: `${lastYear}-12-31`,
    });

    return fetch(`${ARCHIVE_URL}?${params}`)
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
                        tMax: roundTemperature(average(samples.map(({ tMax }) => tMax))),
                        tMin: roundTemperature(average(samples.map(({ tMin }) => tMin))),
                        isTypical: true,
                    };
                });
                return result;
            }
        );
};

const typicalWeatherRequests = new Map<string, Promise<TypicalWeather>>(); // Keyed by city id and years

// Typical weather based on the last full years of the archive, stored until a new year adds data
// (also in memory, so a page left open over the New Year gets the new years)
export const fetchTypicalWeather = (city: City): Promise<TypicalWeather> => {
    const lastYear = new Date().getFullYear() - 1;
    const firstYear = lastYear - CLIMATE_YEARS + 1;
    const years = `${firstYear}-${lastYear}`;
    const requestKey = `${city.id}:${years}`;
    const current = typicalWeatherRequests.get(requestKey);
    if (current) {
        return current;
    }

    const promise = (async () => {
        const stored = await readWeatherCache<{ years: string; days: TypicalWeather }>(`typical:${city.id}`);
        if (stored?.years === years) {
            return stored.days;
        }
        const days = await requestTypicalWeather(city, firstYear, lastYear);
        // Not stored, so it is requested again
        if (Object.keys(days).length === 0) {
            throw new Error('Typical weather is empty');
        }
        void writeWeatherCache(`typical:${city.id}`, { years, days });
        return days;
    })();
    // Allow retry on failure
    promise.catch(() => typicalWeatherRequests.delete(requestKey));
    typicalWeatherRequests.set(requestKey, promise);
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

// Cities looked up by id before, the most recent last
export const loadKnownCities = (): City[] => loadJSON<City[]>(KNOWN_CITIES_STORAGE_KEY) ?? [];

const saveKnownCity = (city: City) =>
    saveJSON(
        KNOWN_CITIES_STORAGE_KEY,
        [...loadKnownCities().filter(({ id }) => id !== city.id), city].slice(-KNOWN_CITIES_LIMIT)
    );

// Temperature in the day circles, off by default
export const loadShowTemperature = (): boolean => loadJSON<boolean>(SHOW_TEMPERATURE_STORAGE_KEY) ?? false;

export const saveShowTemperature = (showTemperature: boolean) =>
    saveJSON(SHOW_TEMPERATURE_STORAGE_KEY, showTemperature);
