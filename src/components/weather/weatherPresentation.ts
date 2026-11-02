export type WeatherKind =
    | 'clear'
    | 'partly-cloudy'
    | 'cloudy'
    | 'overcast'
    | 'fog'
    | 'drizzle'
    | 'light-drizzle'
    | 'heavy-drizzle'
    | 'freezing-drizzle'
    | 'rain'
    | 'light-rain'
    | 'heavy-rain'
    | 'freezing-rain'
    | 'snow'
    | 'heavy-snow'
    | 'sleet'
    | 'thunderstorm'
    | 'heavy-thunderstorm'
    | 'hail'
    | 'none';

export type WeatherContrast = 'on-light' | 'on-dark';

const WEATHER_BY_CODE: Readonly<Partial<Record<number, WeatherKind>>> = {
    0: 'clear',
    1: 'clear',
    2: 'partly-cloudy',
    3: 'overcast',
    45: 'fog',
    48: 'fog',
    51: 'light-drizzle',
    53: 'drizzle',
    55: 'heavy-drizzle',
    56: 'freezing-drizzle',
    57: 'freezing-drizzle',
    61: 'light-rain',
    63: 'rain',
    65: 'heavy-rain',
    66: 'freezing-rain',
    67: 'freezing-rain',
    71: 'snow',
    73: 'snow',
    75: 'heavy-snow',
    77: 'snow',
    80: 'light-rain',
    81: 'rain',
    82: 'heavy-rain',
    85: 'snow',
    86: 'heavy-snow',
    95: 'thunderstorm',
    96: 'hail',
    97: 'heavy-thunderstorm',
    99: 'hail',
};

export const WEATHER_LABELS: Readonly<Record<WeatherKind, string>> = {
    clear: 'Clear sky',
    'partly-cloudy': 'Partly cloudy',
    cloudy: 'Cloudy',
    overcast: 'Overcast',
    fog: 'Fog',
    drizzle: 'Drizzle',
    'light-drizzle': 'Light drizzle',
    'heavy-drizzle': 'Heavy drizzle',
    'freezing-drizzle': 'Freezing drizzle',
    'light-rain': 'Light rain',
    rain: 'Rain',
    'heavy-rain': 'Heavy rain',
    'freezing-rain': 'Freezing rain',
    snow: 'Snow',
    'heavy-snow': 'Heavy snow',
    sleet: 'Sleet',
    thunderstorm: 'Thunderstorm',
    'heavy-thunderstorm': 'Heavy thunderstorm',
    hail: 'Thunderstorm with hail',
    none: 'No data',
};

export const getWeatherKind = (code: number | null | undefined): WeatherKind => {
    if (typeof code !== 'number' || !Number.isInteger(code)) {
        return 'none';
    }
    return WEATHER_BY_CODE[code] ?? 'none';
};
