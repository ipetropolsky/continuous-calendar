import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { CalendarRange, MapPin } from 'lucide-react';

import { BottomSheet } from '@/components/BottomSheet';
import { type IntervalItem, IntervalsPanel, PendingIntervalCard } from '@/components/IntervalsPanel';
import { WeatherLayer, WeatherSymbols } from '@/components/weather/WeatherLayer';
import { getWeatherKind, WEATHER_LABELS, type WeatherKind } from '@/components/weather/weatherPresentation';
import { calendarConfig, holidayDates, vacationDates } from '@/config/calendarConfig';
import { useLastValue, usePresence } from '@/hooks/usePresence';
import {
    addRecentCity,
    canShowTypicalWeather,
    type City,
    fetchTypicalWeather,
    formatCityLabel,
    getCityById,
    loadDailyWeather,
    loadDefaultCity,
    loadRecentCities,
    loadWeatherUntilHorizon,
    saveDefaultCity,
    saveRecentCities,
    type TypicalWeather,
    type WeatherByDate,
} from '@/services/weather';

import './day-pulse.css';

// By default the calendar starts this many weeks before today, each "Past" click shows more months
const PAST_WEEKS = 2;
const PAST_STEP_MONTHS = 3;

// Monday of the week with the date
const getWeekStart = (date: Date): Date => {
    const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    return weekStart;
};

const getDefaultVisibleFrom = (): Date => {
    const today = new Date();
    return getWeekStart(new Date(today.getFullYear(), today.getMonth(), today.getDate() - PAST_WEEKS * 7));
};

// Weather is requested again this often while the page stays open, outdated forecast is refreshed
const WEATHER_REFRESH_MS = 60 * 60 * 1000;

// Intervals panel is shown on the right on wide screens, a floating button opens it as a sheet otherwise
const DESKTOP_PANEL_MEDIA = '(min-width: 64rem)';
// Right padding of the desktop panel, enough for the widest scrollbar (17px on Windows, overlay ones on macOS), px.
// A classic scrollbar takes its width from the padding, so the content doesn't move when the panel gets the scroll.
const DESKTOP_PANEL_SCROLLBAR_SPACE = 24;

// Overlays have their own paths, so the system "Back" gesture closes them
const BASE_PATH = import.meta.env.BASE_URL;
const OVERLAYS = ['intervals'] as const;
type Overlay = (typeof OVERLAYS)[number];

const getOverlay = (): Overlay | null => {
    const path = window.location.pathname.replace(/\/$/, '');
    return OVERLAYS.find((overlay) => path === `${BASE_PATH}${overlay}`) ?? null;
};

const getPathURL = (path: string): string => `${path}${window.location.search}${window.location.hash}`;

// URL state written by the app. An overlay entry and the entry under it must share search params,
// otherwise "Back" from the overlay would restore intervals from before it was opened.
let lastSearch = window.location.search;
let lastOverlay = getOverlay();

const rememberURL = () => {
    lastSearch = window.location.search;
    lastOverlay = getOverlay();
};

// Default city id from the `city` URL param
const getURLCityId = (): number | null => {
    const cityId = Number(new URLSearchParams(window.location.search).get('city'));
    return Number.isInteger(cityId) && cityId > 0 ? cityId : null;
};

const setURLCityId = (cityId: number | null) => {
    const urlParams = new URLSearchParams(window.location.search);
    if (cityId) {
        urlParams.set('city', String(cityId));
    } else {
        urlParams.delete('city');
    }
    const search = urlParams.toString();
    window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${search ? '?' + search : ''}${window.location.hash}`
    );
    rememberURL();
};

// After history navigation between an overlay and the page under it, keep the latest search params
const syncURLAfterPopState = () => {
    if (lastOverlay !== getOverlay() && window.location.search !== lastSearch) {
        window.history.replaceState(
            window.history.state,
            '',
            `${window.location.pathname}${lastSearch}${window.location.hash}`
        );
    }
    rememberURL();
};

const enterOverlayPath = (overlay: Overlay) => {
    if (getOverlay() !== overlay) {
        window.history.pushState({ overlay }, '', getPathURL(`${BASE_PATH}${overlay}`));
        rememberURL();
    }
};

// Leave an overlay path: go back to the entry pushed on opening, otherwise replace the URL.
// Returns true if the overlay will be hidden on popstate.
const leaveOverlayPath = (): boolean => {
    if (!getOverlay()) {
        return false;
    }
    if (window.history.state?.overlay) {
        window.history.back();
        return true;
    }
    window.history.replaceState(null, '', getPathURL(BASE_PATH));
    rememberURL();
    return false;
};

interface CalendarDay {
    date: Date;
    day: number;
    month: number;
    year: number;
    isNewMonth: boolean;
    monthName: string;
    isWorkingDay: boolean;
    isHoliday: boolean;
    isVacation: boolean;
    isWeekend: boolean;
}

const holidaySet = new Set(holidayDates);
const vacationSet = new Set(vacationDates);

// Format date to YYYY-MM-DD string
const formatDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Generate all days, vacations are marked only if they are shown
const generateCalendarData = (showVacations: boolean): CalendarDay[] => {
    const days: CalendarDay[] = [];
    const currentDate = new Date(calendarConfig.startDate);
    let lastMonth = -1;

    while (currentDate <= calendarConfig.endDate) {
        const month = currentDate.getMonth();
        const dateObj = new Date(currentDate);
        const dateString = formatDateString(dateObj);
        const dayOfWeek = dateObj.getDay();
        const isHoliday = holidaySet.has(dateString);
        // Monday-Friday and not a holiday
        const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 5 && !isHoliday;

        days.push({
            date: dateObj,
            day: currentDate.getDate(),
            month: month,
            year: currentDate.getFullYear(),
            isNewMonth: month !== lastMonth,
            monthName: calendarConfig.monthNames[month],
            isWorkingDay,
            isHoliday,
            isVacation: showVacations && vacationSet.has(dateString) && !isHoliday,
            isWeekend: !isWorkingDay,
        });

        lastMonth = month;
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return days;
};

// Organize days into weeks starting with Monday
const organizeIntoWeeks = (days: CalendarDay[]): (CalendarDay | null)[][] => {
    const weeks: (CalendarDay | null)[][] = [];
    let currentWeek: (CalendarDay | null)[] = [];

    // Add empty slots for the beginning if the year doesn't start on Monday
    const firstDay = days[0].date;
    const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0

    for (let i = 0; i < firstDayOfWeek; i++) {
        currentWeek.push(null);
    }

    days.forEach((day) => {
        currentWeek.push(day);

        if (currentWeek.length === 7) {
            weeks.push(currentWeek);
            currentWeek = [];
        }
    });

    // Add the last week if it has days
    if (currentWeek.length > 0) {
        // Fill the rest of the week with empty slots
        while (currentWeek.length < 7) {
            currentWeek.push(null);
        }
        weeks.push(currentWeek);
    }

    return weeks;
};

interface DateInterval {
    id: string;
    startDate: Date;
    endDate: Date;
    cityId?: number;
}

const getToday = (): Date => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
};

const FADE_MS = 200;

// Shows hidden earlier weeks, fades out when all weeks are shown
function PastButton({ show, onClick }: { show: boolean; onClick: () => void }) {
    const { ref, isMounted, isVisible } = usePresence<HTMLButtonElement>(show, FADE_MS);
    if (!isMounted) {
        return null;
    }
    return (
        <button
            ref={ref}
            onClick={onClick}
            className={`absolute -left-1 -top-22 -translate-x-full origin-bottom-right -rotate-90 text-nowrap text-right text-xs font-serif font-medium text-gray-700 hover:text-blue-500 transition-[color,background-color,opacity] duration-200 bg-sky-50 hover:bg-sky-100 rounded p-1 z-20 cursor-pointer ${
                isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
        >
            Past →
        </button>
    );
}

// Number of intervals on the floating button
function CountBadge({ count }: { count: number }) {
    const { ref, isMounted, isVisible } = usePresence<HTMLSpanElement>(count > 0, FADE_MS, true);
    const shownCount = useLastValue(count > 0 ? count : null);
    if (!isMounted) {
        return null;
    }
    return (
        <span
            ref={ref}
            className={`absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-xs font-medium flex items-center justify-center transition-[opacity,scale] duration-200 ${
                isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
            }`}
        >
            {shownCount}
        </span>
    );
}

// Pending interval hint next to the floating button - narrow screens
function FloatingPendingCard({ start, onCancel }: { start: Date | null; onCancel: () => void }) {
    const { ref, isMounted, isVisible } = usePresence<HTMLDivElement>(!!start, FADE_MS, true);
    const shownStart = useLastValue(start);
    if (!isMounted || !shownStart) {
        return null;
    }
    return (
        <div
            ref={ref}
            className={`fixed bottom-6 left-4 right-24 z-40 transition-[opacity,translate] duration-200 ease-out ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
            }`}
        >
            <PendingIntervalCard
                start={shownStart}
                onCancel={onCancel}
                className="relative min-h-14 flex items-center bg-white shadow-lg"
            />
        </div>
    );
}

interface CityLabelProps {
    intervalId: string | null;
    city: City | null;
    isPickerOpen: boolean;
    onClick: (intervalId: string) => void;
}

// City of the interval on its first day, appears and disappears with the interval city
function CityLabel({ intervalId, city, isPickerOpen, onClick }: CityLabelProps) {
    const { ref, isMounted, isVisible } = usePresence<HTMLButtonElement>(!!city, FADE_MS, true);
    const shownCity = useLastValue(city);
    const shownIntervalId = useLastValue(intervalId);
    if (!isMounted || !shownCity || !shownIntervalId) {
        return null;
    }
    return (
        <button
            ref={ref}
            className={`absolute z-1 left-[calc(50%-var(--weather-day-size)/2-6px)] bottom-[calc(50%-var(--weather-day-size)/2-4px)] flex items-center gap-0.5 pl-0.5 pr-1.5 py-0.5 rounded-full bg-white shadow-[0_1px_4px_rgb(15_23_42/0.35)] font-sans whitespace-nowrap text-[10px] xl:text-xs leading-none text-slate-700 hover:bg-zinc-100 origin-left transition-[background-color,opacity,scale] duration-200 cursor-pointer ${
                isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'
            }`}
            title={`${formatCityLabel(shownCity)}: change city`}
            // A click on the label of the open picker keeps it open, its outside-click handler would close it
            onMouseDown={(e) => {
                if (isPickerOpen) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }}
            onClick={(e) => {
                e.stopPropagation();
                onClick(shownIntervalId);
            }}
        >
            <MapPin className="w-3 h-3 xl:w-3.5 xl:h-3.5 flex-shrink-0 text-slate-500" />
            {shownCity.name}
        </button>
    );
}

interface DayWeatherView {
    kind: WeatherKind;
    isTypical: boolean;
    title: string;
}

interface WeatherSources {
    intervals: DateInterval[];
    cities: Record<number, City>;
    weather: Record<number, WeatherByDate>;
    typicalWeather: Record<number, TypicalWeather>;
    defaultCity: City | null;
}

// Weather of the day is taken from the interval that starts later (or ends later if both start on the same day),
// days without interval weather show the default city weather.
// Beyond the forecast horizon and until the forecast is loaded typical weather by past years statistics is used.
const getDayWeather = (
    date: Date,
    { intervals, cities, weather, typicalWeather, defaultCity }: WeatherSources
): DayWeatherView | null => {
    let displayInterval: DateInterval | undefined;
    for (const interval of intervals) {
        if (date < interval.startDate || date > interval.endDate || !interval.cityId) {
            continue;
        }
        if (
            !displayInterval ||
            interval.startDate > displayInterval.startDate ||
            (interval.startDate.getTime() === displayInterval.startDate.getTime() &&
                interval.endDate > displayInterval.endDate)
        ) {
            displayInterval = interval;
        }
    }

    const dateString = formatDateString(date);
    const canBeTypical = canShowTypicalWeather(date);
    const getCityWeather = (city: City | null) =>
        city
            ? (weather[city.id]?.[dateString] ??
              (canBeTypical ? typicalWeather[city.id]?.[dateString.slice(5)] : undefined))
            : undefined;

    let city = displayInterval?.cityId ? (cities[displayInterval.cityId] ?? null) : null;
    let dayWeather = getCityWeather(city);
    if (!dayWeather && defaultCity) {
        city = defaultCity;
        dayWeather = getCityWeather(defaultCity);
    }
    if (!city || !dayWeather) {
        return null;
    }
    const kind = getWeatherKind(dayWeather.code);
    const temperature = `${Math.round(dayWeather.tMax)}° / ${Math.round(dayWeather.tMin)}°`;
    return {
        kind,
        isTypical: !!dayWeather.isTypical,
        title: dayWeather.isTypical
            ? `${city.name}, typical weather: ${WEATHER_LABELS[kind]}, ${temperature}`
            : `${city.name}: ${WEATHER_LABELS[kind]}, ${temperature}`,
    };
};

// Day is the chosen start of a new interval or lies in an interval
const isDaySelected = (date: Date, selectedStart: Date | null, intervals: DateInterval[]): boolean =>
    selectedStart?.getTime() === date.getTime() ||
    intervals.some((interval) => date >= interval.startDate && date <= interval.endDate);

// Days of an interval shown from the panel, waves spread from them
interface DayPulse {
    startDate: Date;
    endDate: Date;
    key: number;
}

// Height of the sticky week day headers with their bottom margin, px
const WEEK_DAY_HEADERS_HEIGHT = 56;

// Waves play once, then the days are re-rendered without them
const DAY_PULSE_MS = 1200;

interface DayCellProps {
    day: CalendarDay;
    isSelectedDay: boolean;
    isToday: boolean;
    weatherKind: WeatherKind | null;
    isTypicalWeather: boolean;
    weatherTitle: string | undefined;
    startingIntervalId: string | null; // Interval with a city starting on this day
    startingCity: City | null;
    isCityPickerOpen: boolean;
    pulseKey: number; // Waves are shown while non-zero, a new key plays them again
    onDateClick: (date: Date) => void;
    onCityLabelClick: (intervalId: string) => void;
}

// Memoized, so a state change re-renders only the days whose props have changed
const DayCell = memo(function DayCell({
    day,
    isSelectedDay,
    isToday,
    weatherKind,
    isTypicalWeather,
    weatherTitle,
    startingIntervalId,
    startingCity,
    isCityPickerOpen,
    pulseKey,
    onDateClick,
    onCityLabelClick,
}: DayCellProps) {
    // Selected vacations look like selected weekends, unselected vacation weekends stay weekends
    const isOffDay = day.isHoliday || day.isWeekend;

    // Determine text color based on day type
    let dayClass = 'text-slate-800';
    if (isSelectedDay) {
        dayClass = 'text-zinc-50';
    } else if (day.isVacation) {
        dayClass = 'text-orange-600';
    } else if (isOffDay) {
        dayClass = 'text-red-600';
    }

    // Determine background colors based on selection status
    let bgClass = 'bg-zinc-50 hover:bg-zinc-100';
    // Waves have the color of the circle
    let pulseClass = 'text-zinc-300';
    if (isSelectedDay) {
        if (isOffDay || day.isVacation) {
            bgClass = 'bg-red-600 hover:bg-red-700';
            pulseClass = 'text-red-600';
        } else {
            bgClass = 'bg-slate-600 hover:bg-slate-700';
            pulseClass = 'text-slate-600';
        }
    } else if (day.isVacation) {
        bgClass = 'bg-orange-50 hover:bg-orange-100';
    } else if (isOffDay) {
        bgClass = 'bg-rose-50 hover:bg-rose-100';
    }

    // Check if today - add ring based on day type and selection
    const todayClass = isToday ? 'outline-2 outline-offset-2 sm:outline-3 sm:outline-offset-3 outline-[#f3adb7]' : '';

    let weatherSurface: 'default' | 'selected-off' | 'vacation' = 'default';
    if (isSelectedDay && (isOffDay || day.isVacation)) {
        weatherSurface = 'selected-off';
    } else if (!isSelectedDay && day.isVacation) {
        weatherSurface = 'vacation';
    }

    // The cell has no z-index, so city labels of all days in a week share one stacking context
    // and a later label covers an earlier one. The size variable is set here to position the label.
    return (
        <div
            className="relative h-12 xs:h-13 sm:h-15 md:h-16 md:w-16 xl:h-20 xl:w-20 flex justify-center align-center items-center [--weather-day-size:40px] xs:[--weather-day-size:48px] sm:[--weather-day-size:52px] md:[--weather-day-size:56px] xl:[--weather-day-size:72px]"
            data-date={`${day.year}-${day.month}-${day.day}`}
        >
            {pulseKey > 0 && (
                <div key={pulseKey} className={`day-pulse ${pulseClass}`} aria-hidden="true">
                    <span className="day-pulse__wave" />
                </div>
            )}
            {/* Day cell: weather art under the number */}
            <div
                className={`weather-day font-serif ${bgClass} ${dayClass} ${todayClass} ${isTypicalWeather ? '[--weather-opacity:0.6]' : ''} transition-colors cursor-pointer`}
                title={weatherTitle}
                onClick={() => onDateClick(day.date)}
            >
                {weatherKind && (
                    <WeatherLayer
                        kind={weatherKind}
                        contrast={isSelectedDay ? 'on-dark' : 'on-light'}
                        surface={weatherSurface}
                    />
                )}
                <span className="weather-day__number">{day.day}</span>
            </div>
            <CityLabel
                intervalId={startingIntervalId}
                city={startingCity}
                isPickerOpen={isCityPickerOpen}
                onClick={onCityLabelClick}
            />
        </div>
    );
});

interface CalendarGridProps {
    weeks: (CalendarDay | null)[][];
    visibleFrom: Date;
    selectedStart: Date | null;
    intervals: DateInterval[];
    cities: Record<number, City>;
    cityPickerIntervalId: string | null;
    weatherByDay: Map<number, DayWeatherView>; // Keyed by date time
    todayTime: number;
    pulse: DayPulse | null;
    onDateClick: (date: Date) => void;
    onCityLabelClick: (intervalId: string) => void;
    onMonthClick: (year: number, monthName: string) => void;
    onShowMorePast: () => void;
}

// Memoized with stable handlers, so state changes outside the calendar (panel, sheet, settings) don't touch it
const CalendarGrid = memo(function CalendarGrid({
    weeks,
    visibleFrom,
    selectedStart,
    intervals,
    cities,
    cityPickerIntervalId,
    weatherByDay,
    todayTime,
    pulse,
    onDateClick,
    onCityLabelClick,
    onMonthClick,
    onShowMorePast,
}: CalendarGridProps) {
    // Week is hidden if all its days are before visibleFrom (week may contain null slots for empty days)
    const isWeekHidden = (week: (CalendarDay | null)[]): boolean => week.every((day) => !day || day.date < visibleFrom);
    const hasHiddenWeeks = weeks.some(isWeekHidden);

    return (
        <div>
            <PastButton show={hasHiddenWeeks} onClick={onShowMorePast} />

            {weeks.map((week, weekIndex) => {
                const isHidden = isWeekHidden(week);
                // Check if this week has the first day of a new month
                const firstDayOfMonth = week.find((day) => day && day.isNewMonth);

                // Days of hidden weeks are not rendered, they appear with the week
                return (
                    <div
                        key={weekIndex}
                        className={`relative z-10 transition-[max-height,opacity] duration-500 ease-in-out ${
                            isHidden
                                ? 'max-h-0 overflow-hidden mb-0 opacity-0'
                                : 'max-h-[10000px] opacity-100 mb-2 md:mb-0'
                        }`}
                    >
                        {/* Month label for mobile - above first day of month */}
                        {firstDayOfMonth && !isHidden && (
                            <div onClick={() => onMonthClick(firstDayOfMonth.year, firstDayOfMonth.monthName)}>
                                <div className="absolute p-1 z-20 right-full -translate-x-1 translate-y-1 bottom-full origin-bottom-right -rotate-90 text-nowrap text-right text-xs font-serif font-medium text-gray-700 hover:text-blue-500 transition-colors inline-block cursor-pointer">
                                    {firstDayOfMonth.monthName}
                                    {'\u00a0'}
                                    <span className="text-gray-500">{firstDayOfMonth.year}</span>
                                </div>
                            </div>
                        )}

                        {!isHidden && (
                            <div className="grid grid-cols-7 gap-1 mb-2 md:mb-0">
                                {week.map((day, dayIndex) => {
                                    if (!day) {
                                        return <div key={dayIndex} className="h-12 md:h-16 xl:h-20" />;
                                    }

                                    const dayWeather = weatherByDay.get(day.date.getTime());
                                    // City label on the first day of an interval
                                    const startingInterval = intervals.find(
                                        (interval) => interval.startDate.getTime() === day.date.getTime()
                                    );
                                    const startingCity = startingInterval?.cityId
                                        ? (cities[startingInterval.cityId] ?? null)
                                        : null;

                                    return (
                                        <DayCell
                                            key={`${day.year}-${day.month}-${day.day}`}
                                            day={day}
                                            isSelectedDay={isDaySelected(day.date, selectedStart, intervals)}
                                            isToday={day.date.getTime() === todayTime}
                                            weatherKind={dayWeather?.kind ?? null}
                                            isTypicalWeather={!!dayWeather?.isTypical}
                                            weatherTitle={dayWeather?.title}
                                            startingIntervalId={startingCity ? startingInterval!.id : null}
                                            startingCity={startingCity}
                                            isCityPickerOpen={
                                                !!startingInterval && startingInterval.id === cityPickerIntervalId
                                            }
                                            pulseKey={
                                                pulse && day.date >= pulse.startDate && day.date <= pulse.endDate
                                                    ? pulse.key
                                                    : 0
                                            }
                                            onDateClick={onDateClick}
                                            onCityLabelClick={onCityLabelClick}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
});

export function ContinuousCalendar() {
    const [intervals, setIntervals] = useState<DateInterval[]>([]);
    const [selectedStart, setSelectedStart] = useState<Date | null>(null);
    const [shouldScrollToFirst, setShouldScrollToFirst] = useState(false);
    const [shouldScrollToMonth, setShouldScrollToMonth] = useState<string | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [showVacations, setShowVacations] = useState(false);
    // Earlier weeks are hidden behind the "Past" button, their weather is not loaded
    const [visibleFrom, setVisibleFrom] = useState(getDefaultVisibleFrom);
    // Incremented when the tab becomes active, every hour and at midnight to refresh an outdated forecast
    const [weatherRefreshKey, setWeatherRefreshKey] = useState(0);
    // Today moves at midnight while the page stays open: today mark, forecast and typical weather ranges
    const [todayTime, setTodayTime] = useState(() => getToday().getTime());
    const [pulse, setPulse] = useState<DayPulse | null>(null);

    useEffect(() => {
        if (!pulse) {
            return;
        }
        const timeoutId = setTimeout(() => setPulse(null), DAY_PULSE_MS);
        return () => clearTimeout(timeoutId);
    }, [pulse]);
    const [shouldScrollToToday, setShouldScrollToToday] = useState(false);
    const [recentCities, setRecentCities] = useState<City[]>(loadRecentCities);
    // The city from the URL wins over the stored one, until it is loaded there is no default city
    const [defaultCity, setDefaultCity] = useState<City | null>(() => {
        const storedCity = loadDefaultCity();
        const urlCityId = getURLCityId();
        if (urlCityId === null || urlCityId === storedCity?.id) {
            return storedCity;
        }
        return loadRecentCities().find((city) => city.id === urlCityId) ?? null;
    });
    const [cities, setCities] = useState<Record<number, City>>(() =>
        Object.fromEntries(
            [...loadRecentCities(), loadDefaultCity()].filter((city) => !!city).map((city) => [city.id, city])
        )
    );
    const [weather, setWeather] = useState<Record<number, WeatherByDate>>({});
    // Typical weather by past years statistics for dates beyond the forecast
    const [typicalWeather, setTypicalWeather] = useState<Record<number, TypicalWeather>>({});
    const [cityPickerIntervalId, setCityPickerIntervalId] = useState<string | null>(null);
    const closeCityPicker = useCallback(() => setCityPickerIntervalId(null), []);
    // Mobile full-screen sheet with intervals: mounted flag and visibility flag for the slide animation
    const [showIntervalsSheet, setShowIntervalsSheet] = useState(false);

    const showSheet = useCallback(() => setShowIntervalsSheet(true), []);

    const hideSheet = useCallback(() => {
        setShowIntervalsSheet(false);
        setCityPickerIntervalId(null);
    }, []);

    const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_PANEL_MEDIA).matches);
    const desktopPanelRef = useRef<HTMLDivElement>(null);

    const { startDate, weekDayLabels } = calendarConfig;

    const days = useMemo(() => generateCalendarData(showVacations), [showVacations]);
    const weeks = useMemo(() => organizeIntoWeeks(days), [days]);

    // Show PAST_STEP_MONTHS more months before the visible ones
    const showMorePast = useCallback(() => {
        setVisibleFrom((prev) => {
            const earlier = getWeekStart(
                new Date(prev.getFullYear(), prev.getMonth() - PAST_STEP_MONTHS, prev.getDate())
            );
            return earlier < calendarConfig.startDate ? calendarConfig.startDate : earlier;
        });
    }, []);

    // URL encoding/decoding functions
    const encodeIntervalToURL = (interval: DateInterval): string => {
        const startStr = formatDateToString(interval.startDate);
        const endStr = formatDateToString(interval.endDate);
        const cityStr = interval.cityId ? `_${interval.cityId}` : '';
        return `${startStr}-${endStr}${cityStr}`;
    };

    const decodeIntervalFromURL = (urlParam: string): DateInterval | null => {
        if (!urlParam) {
            return null;
        }

        try {
            const [datesStr, cityStr] = urlParam.split('_');
            const [startStr, endStr] = datesStr.split('-');
            const cityId = cityStr ? parseInt(cityStr) : NaN;
            return {
                id: `${Date.now()}-${Math.random()}`,
                startDate: parseStringToDate(startStr),
                endDate: parseStringToDate(endStr),
                cityId: Number.isNaN(cityId) ? undefined : cityId,
            };
        } catch {
            return null;
        }
    };

    const formatDateToString = (date: Date): string => {
        const year = date.getFullYear().toString().slice(-2); // Last 2 digits of year
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}${month}${day}`;
    };

    const parseStringToDate = (dateStr: string): Date => {
        if (dateStr.length !== 6) {
            throw new Error('Invalid date format');
        }

        const year = parseInt(`20${dateStr.slice(0, 2)}`);
        const month = parseInt(dateStr.slice(2, 4)) - 1; // Month is 0-indexed
        const day = parseInt(dateStr.slice(4, 6));

        return new Date(year, month, day);
    };

    // Parse URL on component mount
    useLayoutEffect(() => {
        // Scroll position is managed by the calendar, also when the sheet path is left with "Back"
        window.history.scrollRestoration = 'manual';
        // Any other path (overlay path after a reload, unknown path) is replaced with the main page
        if (window.location.pathname !== BASE_PATH) {
            window.history.replaceState(null, '', getPathURL(BASE_PATH));
            rememberURL();
        }

        const urlParams = new URLSearchParams(window.location.search);
        const parsedIntervals = urlParams
            .getAll('dates')
            .map(decodeIntervalFromURL)
            .filter((interval) => !!interval);
        const monthParam = urlParams.get('month');

        if (monthParam) {
            setShouldScrollToMonth(monthParam);
        }

        if (parsedIntervals.length > 0) {
            setIntervals(parsedIntervals);
            loadIntervalCities(parsedIntervals);
            // Scroll to first interval if month param is not set
            if (!monthParam) {
                setShouldScrollToFirst(true);
            }
        }

        // Default city: load the one from the URL (without saving it, a shared link doesn't change own settings)
        // or put the stored one to the URL
        const urlCityId = getURLCityId();
        if (urlCityId === null) {
            if (defaultCity) {
                setURLCityId(defaultCity.id);
            }
        } else if (defaultCity?.id !== urlCityId) {
            getCityById(urlCityId)
                .then((city) => {
                    if (city) {
                        setCities((prev) => ({ ...prev, [city.id]: city }));
                        setDefaultCity(city);
                    }
                })
                .catch(() => {});
        }

        const vacationParam = urlParams.has('vc');
        if (vacationParam) {
            setShowVacations(true);
        }

        // Show earlier weeks if intervals or the month from the URL start before them
        let earliestDate = getDefaultVisibleFrom();
        parsedIntervals.forEach((interval) => {
            if (interval.startDate < earliestDate) {
                earliestDate = interval.startDate;
            }
        });
        const monthData = monthParam ? parseMonthFromString(monthParam) : null;
        if (monthData) {
            const firstDayOfMonth = new Date(monthData.year, monthData.month, 1);
            if (firstDayOfMonth < earliestDate) {
                earliestDate = firstDayOfMonth;
            }
        }
        const earliestWeekStart = getWeekStart(earliestDate);
        setVisibleFrom(earliestWeekStart < startDate ? startDate : earliestWeekStart);

        // Set scroll to today if no intervals or month param
        if (parsedIntervals.length === 0 && !monthParam) {
            setShouldScrollToToday(true);
        }
    }, []);

    // Load cities from URL intervals that are not known yet
    const loadIntervalCities = (intervalsToLoad: DateInterval[]) => {
        const cityIds = new Set(intervalsToLoad.map((interval) => interval.cityId).filter((cityId) => !!cityId));
        const lastIntervalCityId = intervalsToLoad[intervalsToLoad.length - 1]?.cityId;

        cityIds.forEach((cityId) => {
            if (cities[cityId!]) {
                return;
            }
            getCityById(cityId!).then((city) => {
                if (!city) {
                    return;
                }
                setCities((prev) => ({ ...prev, [city.id]: city }));
                // Use city of the last interval as default if nothing was chosen before
                if (city.id === lastIntervalCityId) {
                    setRecentCities((prev) => (prev.length > 0 ? prev : [city]));
                }
            });
        });
    };

    const addCityWeather = useCallback((cityId: number, weatherByDate: WeatherByDate) => {
        setWeather((prev) => ({ ...prev, [cityId]: { ...prev[cityId], ...weatherByDate } }));
    }, []);

    // Refresh today and weather when the tab becomes active and every hour while the page stays open,
    // forecast older than 12 hours is requested again
    useEffect(() => {
        const refresh = () => {
            setTodayTime(getToday().getTime());
            setWeatherRefreshKey((prev) => prev + 1);
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refresh();
            }
        };
        const intervalId = setInterval(refresh, WEATHER_REFRESH_MS);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    // Move to the next day right after midnight
    useEffect(() => {
        const nextDay = new Date(todayTime);
        nextDay.setDate(nextDay.getDate() + 1);
        const timeoutId = setTimeout(
            () => {
                setTodayTime(getToday().getTime());
                setWeatherRefreshKey((prev) => prev + 1);
            },
            nextDay.getTime() - Date.now() + 1000
        );
        return () => clearTimeout(timeoutId);
    }, [todayTime]);

    // Load weather for visible days of intervals with known cities
    useEffect(() => {
        intervals.forEach((interval) => {
            const city = interval.cityId ? cities[interval.cityId] : null;
            if (!city || interval.endDate < visibleFrom) {
                return;
            }
            const start = interval.startDate < visibleFrom ? visibleFrom : interval.startDate;
            loadDailyWeather(city, start, interval.endDate, (weatherByDate) =>
                addCityWeather(city.id, weatherByDate)
            ).catch((error) => console.error('Failed to load weather:', error));
        });
    }, [intervals, cities, visibleFrom, weatherRefreshKey, addCityWeather]);

    // Load typical weather for interval cities and the default city
    useEffect(() => {
        const cityIds = new Set(intervals.map(({ cityId }) => cityId));
        const typicalCities = Object.values(cities).filter(({ id }) => cityIds.has(id) || id === defaultCity?.id);
        typicalCities.forEach((city) => {
            fetchTypicalWeather(city)
                .then((weatherByDay) => setTypicalWeather((prev) => ({ ...prev, [city.id]: weatherByDay })))
                .catch((error) => console.error('Failed to load typical weather:', error));
        });
    }, [intervals, cities, defaultCity, weatherRefreshKey]);

    // Desktop panel continues down with the page until it sticks to the top, then it gets the viewport height and
    // scrolls inside. It keeps scrolling after it is unstuck while scrolled, until it is scrolled back to the top,
    // so the content doesn't jump.
    // Scrolled to the end (or without scroll), it stays at the end while its content grows, so expanding settings or
    // a block added at the bottom are followed during the animation. The focused element (the city picker of a new
    // interval) is kept visible.
    useEffect(() => {
        const panel = desktopPanelRef.current;
        const content = panel?.firstElementChild;
        if (!isDesktop || !panel || !content) {
            return;
        }
        const isAtEnd = () => panel.scrollHeight - panel.scrollTop - panel.clientHeight < 2;
        let isScrollable = false;
        let isPinned = false;
        let pinnedScrollTop = 0;
        const updatePadding = () => {
            const scrollbarWidth = isScrollable ? panel.offsetWidth - panel.clientWidth : 0;
            panel.style.paddingRight = `${Math.max(0, DESKTOP_PANEL_SCROLLBAR_SPACE - scrollbarWidth)}px`;
        };
        const handleResize = () => {
            updateScrollable();
            // Page zoom changes the scrollbar width in CSS pixels
            updatePadding();
        };
        const updateScrollable = () => {
            const shouldScroll = panel.getBoundingClientRect().top < 1 || panel.scrollTop > 0;
            if (shouldScroll === isScrollable) {
                return;
            }
            isScrollable = shouldScroll;
            panel.style.maxHeight = isScrollable ? '100vh' : '';
            panel.style.overflowY = isScrollable ? 'auto' : '';
            // The gutter is kept while the content fits, so the content doesn't move when it grows
            panel.style.scrollbarGutter = isScrollable ? 'stable' : '';
            updatePadding();
            isPinned = isScrollable && isAtEnd();
            pinnedScrollTop = panel.scrollTop;
        };
        const handleScroll = () => {
            updateScrollable();
            // The scroll event of our own scrolling comes after the content may have grown again,
            // so the panel stays pinned unless it was scrolled up
            if (!isScrollable || (isPinned && panel.scrollTop >= pinnedScrollTop - 1)) {
                return;
            }
            isPinned = isAtEnd();
        };
        const resizeObserver = new ResizeObserver(() => {
            if (!isPinned) {
                return;
            }
            panel.scrollTop = panel.scrollHeight;
            pinnedScrollTop = panel.scrollTop;
            const focused = document.activeElement;
            if (focused instanceof HTMLElement && panel.contains(focused)) {
                const panelRect = panel.getBoundingClientRect();
                if (focused.getBoundingClientRect().top < panelRect.top) {
                    focused.scrollIntoView({ block: 'nearest' });
                }
            }
            isPinned = isAtEnd();
        });
        updateScrollable();
        resizeObserver.observe(panel);
        resizeObserver.observe(content);
        panel.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('scroll', updateScrollable, { passive: true });
        window.addEventListener('resize', handleResize);
        return () => {
            resizeObserver.disconnect();
            panel.removeEventListener('scroll', handleScroll);
            window.removeEventListener('scroll', updateScrollable);
            window.removeEventListener('resize', handleResize);
            panel.style.maxHeight = '';
            panel.style.overflowY = '';
            panel.style.scrollbarGutter = '';
            panel.style.paddingRight = '';
        };
    }, [isDesktop]);

    // Switch between the desktop panel and the mobile sheet
    useEffect(() => {
        const mediaQuery = window.matchMedia(DESKTOP_PANEL_MEDIA);
        const handleChange = () => {
            setIsDesktop(mediaQuery.matches);
            if (mediaQuery.matches) {
                if (getOverlay() === 'intervals') {
                    setShowIntervalsSheet(false);
                    leaveOverlayPath();
                }
            }
        };
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    // Open and close the sheet on history navigation ("Back" and "Forward" gestures)
    useEffect(() => {
        const handlePopState = () => {
            syncURLAfterPopState();
            const overlay = getOverlay();
            if (overlay === 'intervals' && !window.matchMedia(DESKTOP_PANEL_MEDIA).matches) {
                showSheet();
            } else {
                hideSheet();
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [hideSheet, showSheet]);

    // Cancel the interval selection on Esc if nothing is open over the calendar
    useEffect(() => {
        if (!selectedStart || showIntervalsSheet || cityPickerIntervalId) {
            return;
        }
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectedStart(null);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [selectedStart, showIntervalsSheet, cityPickerIntervalId]);

    // Close the sheet on Esc if no city picker is open (the picker handles Esc itself)
    useEffect(() => {
        if (!showIntervalsSheet || cityPickerIntervalId) {
            return;
        }
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeIntervalsSheet();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    });

    // Load weather of visible days for the default city
    useEffect(() => {
        if (!defaultCity) {
            return;
        }
        loadWeatherUntilHorizon(defaultCity, visibleFrom, (weatherByDate) =>
            addCityWeather(defaultCity.id, weatherByDate)
        ).catch((error) => console.error('Failed to load weather:', error));
    }, [defaultCity, visibleFrom, weatherRefreshKey, addCityWeather]);

    // Scroll to selected month, to the first interval, or to today
    useEffect(() => {
        if (shouldScrollToMonth) {
            const monthData = parseMonthFromString(shouldScrollToMonth);
            if (monthData) {
                scrollToMonth(monthData.year, monthData.month);
                setShouldScrollToMonth(null);
            }
        } else if (shouldScrollToFirst && intervals.length > 0) {
            // Sort intervals by start date to find the first one
            const sortedIntervals = [...intervals].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
            const firstInterval = sortedIntervals[0];

            scrollToDate(firstInterval.startDate);
            setShouldScrollToFirst(false); // Reset flag
        } else if (shouldScrollToToday) {
            scrollToDate(new Date());
            setShouldScrollToToday(false);
        }
    }, [shouldScrollToFirst, shouldScrollToMonth, shouldScrollToToday, intervals]);

    // Helper function to scroll to a specific date, resolves when the day is fully visible (below the sticky week day
    // headers) or the scrolling ends
    const scrollToDate = (date: Date): Promise<void> => {
        const dateString = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        const element = document.querySelector(`[data-date="${dateString}"]`);

        if (!element) {
            return Promise.resolve();
        }
        const rect = element.getBoundingClientRect();
        const elementTop = rect.top + window.pageYOffset;
        const viewportHeight = window.innerHeight;
        const targetPosition = Math.min(
            Math.max(0, elementTop - viewportHeight / 2 + rect.height / 2),
            document.documentElement.scrollHeight - viewportHeight
        );
        if (Math.abs(targetPosition - window.scrollY) < 1) {
            return Promise.resolve();
        }

        window.scrollTo({
            top: targetPosition,
            behavior: 'smooth',
        });
        // `scrollend` isn't supported everywhere, the timeout is a fallback
        return new Promise((resolve) => {
            const observer = new IntersectionObserver(
                ([entry]) => {
                    if (entry.isIntersecting) {
                        done();
                    }
                },
                { rootMargin: `-${WEEK_DAY_HEADERS_HEIGHT}px 0px 0px 0px`, threshold: 1 }
            );
            const done = () => {
                observer.disconnect();
                window.removeEventListener('scrollend', done);
                clearTimeout(timeoutId);
                resolve();
            };
            const timeoutId = setTimeout(done, 1000);
            window.addEventListener('scrollend', done);
            observer.observe(element);
        });
    };

    // Scroll to the interval and play waves from its days
    const showInterval = (interval: Pick<DateInterval, 'startDate' | 'endDate'>) => {
        void scrollToDate(interval.startDate).then(() =>
            setPulse((prev) => ({
                startDate: interval.startDate,
                endDate: interval.endDate,
                key: (prev?.key ?? 0) + 1,
            }))
        );
    };

    // Helper function to scroll to a month
    const scrollToMonth = (year: number, month: number) => {
        // Find first day of the month
        const firstDay = new Date(year, month, 1);
        scrollToDate(firstDay);
    };

    // Format month for URL (YYMM)
    const formatMonthToString = (year: number, month: number): string => {
        const yearStr = year.toString().slice(-2);
        const monthStr = (month + 1).toString().padStart(2, '0');
        return `${yearStr}${monthStr}`;
    };

    // Parse month from URL string (YYMM)
    const parseMonthFromString = (monthStr: string): { year: number; month: number } | null => {
        if (monthStr.length !== 4) {
            return null;
        }

        try {
            const year = parseInt(`20${monthStr.slice(0, 2)}`);
            const month = parseInt(monthStr.slice(2, 4)) - 1; // Month is 0-indexed
            return { year, month };
        } catch {
            return null;
        }
    };

    // Handle month click
    const handleMonthClick = (year: number, monthName: string) => {
        const monthIndex = [
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December',
        ].indexOf(monthName);

        if (monthIndex === -1) {
            return;
        }

        const monthStr = formatMonthToString(year, monthIndex);
        const urlParams = new URLSearchParams(window.location.search);

        if (urlParams.has('month') && urlParams.get('month') === monthStr) {
            // Remove existing month param if it's the same as the clicked month
            urlParams.delete('month');
        } else {
            // Else set the clicked month to URL
            urlParams.set('month', monthStr);
            // Scroll to month
            scrollToMonth(year, monthIndex);
        }

        const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
        window.history.pushState({}, '', newUrl);
        rememberURL();
    };

    // Helper functions for interval selection
    const handleDateClick = (date: Date) => {
        if (!selectedStart) {
            // First click - select start date
            setSelectedStart(date);
        } else {
            // Second click - create interval
            const startDate = selectedStart;
            const endDate = date;

            // Ensure start is before end
            const sortedStart = startDate <= endDate ? startDate : endDate;
            const sortedEnd = startDate <= endDate ? endDate : startDate;

            const newInterval: DateInterval = {
                id: `${Date.now()}-${Math.random()}`,
                startDate: sortedStart,
                endDate: sortedEnd,
                cityId: recentCities[0]?.id,
            };

            const updatedIntervals = [...intervals, newInterval];
            setSelectedStart(null);
            updateIntervals(updatedIntervals);
            // Desktop panel is always visible, so offer to change the city there.
            // On mobile open the sheet only if there is no default city.
            if (isDesktop) {
                setCityPickerIntervalId(newInterval.id);
            } else if (!newInterval.cityId) {
                setCityPickerIntervalId(newInterval.id);
                openIntervalsSheet();
            }
        }
    };

    const openIntervalsSheet = () => {
        enterOverlayPath('intervals');
        showSheet();
    };

    // Hiding happens on popstate after going back, or right away if there is no overlay history entry
    const closeIntervalsSheet = () => {
        if (!leaveOverlayPath()) {
            hideSheet();
        }
    };

    const handleCitySelect = (intervalId: string, city: City) => {
        rememberCity(city);
        setCityPickerIntervalId(null);
        updateIntervals(
            intervals.map((interval) => (interval.id === intervalId ? { ...interval, cityId: city.id } : interval))
        );
    };

    const rememberCity = (city: City) => {
        setCities((prev) => ({ ...prev, [city.id]: city }));
        const updatedRecentCities = addRecentCity(recentCities, city);
        setRecentCities(updatedRecentCities);
        saveRecentCities(updatedRecentCities);
    };

    const handleDefaultCitySelect = (city: City | null) => {
        if (city) {
            rememberCity(city);
        }
        setDefaultCity(city);
        saveDefaultCity(city);
        setURLCityId(city?.id ?? null);
        setCityPickerIntervalId(null);
    };

    // Intervals for the panel, in calendar order
    const intervalItems: IntervalItem[] = useMemo(
        () =>
            [...intervals]
                .sort(
                    (a, b) => a.startDate.getTime() - b.startDate.getTime() || a.endDate.getTime() - b.endDate.getTime()
                )
                .map((interval) => ({
                    ...interval,
                    city: interval.cityId ? (cities[interval.cityId] ?? null) : null,
                })),
        [intervals, cities]
    );

    const updateIntervals = (newIntervals: DateInterval[]) => {
        setIntervals(newIntervals);

        const urlParams = new URLSearchParams(window.location.search);
        urlParams.delete('dates');
        newIntervals.forEach((interval) => {
            const encodedInterval = encodeIntervalToURL(interval);
            urlParams.append('dates', encodedInterval);
        });

        const newUrl = `${window.location.pathname}${urlParams.toString() ? '?' + urlParams.toString() : ''}`;
        window.history.replaceState(window.history.state, '', newUrl);
        rememberURL();
    };

    const removeInterval = (intervalId: string) => {
        const updatedIntervals = intervals.filter((interval) => interval.id !== intervalId);
        updateIntervals(updatedIntervals);
        if (cityPickerIntervalId === intervalId) {
            setCityPickerIntervalId(null);
        }
    };

    const handleCityLabelClick = (intervalId: string) => {
        setCityPickerIntervalId(intervalId);
        if (!isDesktop) {
            openIntervalsSheet();
        }
    };

    // Day cells are memoized, they get stable handlers calling the latest ones
    const dayHandlersRef = useRef({ handleDateClick, handleCityLabelClick, handleMonthClick });
    useLayoutEffect(() => {
        dayHandlersRef.current = { handleDateClick, handleCityLabelClick, handleMonthClick };
    });
    const onDateClick = useCallback((date: Date) => dayHandlersRef.current.handleDateClick(date), []);
    const onCityLabelClick = useCallback(
        (intervalId: string) => dayHandlersRef.current.handleCityLabelClick(intervalId),
        []
    );
    const onMonthClick = useCallback(
        (year: number, monthName: string) => dayHandlersRef.current.handleMonthClick(year, monthName),
        []
    );

    // Weather of visible days doesn't depend on the selection, so clicks don't recalculate it.
    // Today is a dependency, because typical weather is shown from the last week on.
    const weatherByDay = useMemo(() => {
        const sources = { intervals, cities, weather, typicalWeather, defaultCity };
        const result = new Map<number, DayWeatherView>();
        days.forEach((day) => {
            const dayWeather = day.date < visibleFrom ? null : getDayWeather(day.date, sources);
            if (dayWeather) {
                result.set(day.date.getTime(), dayWeather);
            }
        });
        return result;
    }, [days, visibleFrom, intervals, cities, weather, typicalWeather, defaultCity, todayTime]);

    const intervalsPanel = (
        <IntervalsPanel
            intervals={intervalItems}
            pendingStart={selectedStart}
            onCancelPending={() => setSelectedStart(null)}
            defaultCity={defaultCity}
            recentCities={recentCities}
            cityPickerIntervalId={cityPickerIntervalId}
            onDefaultCitySelect={handleDefaultCitySelect}
            onOpenCityPicker={setCityPickerIntervalId}
            onCloseCityPicker={closeCityPicker}
            onCitySelect={handleCitySelect}
            onRemove={removeInterval}
            isSettingsOpen={isSettingsOpen}
            onToggleSettings={() => setIsSettingsOpen((isOpen) => !isOpen)}
            settings={
                <label className="flex items-start gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={showVacations}
                        onChange={(e) => {
                            setShowVacations(e.target.checked);
                            const urlParams = new URLSearchParams(window.location.search);
                            if (e.target.checked) {
                                urlParams.set('vc', 'true');
                            } else {
                                urlParams.delete('vc');
                            }
                            const newUrl = `${window.location.pathname}${urlParams.toString() ? '?' + urlParams.toString() : ''}`;
                            window.history.replaceState(window.history.state, '', newUrl);
                            rememberURL();
                        }}
                        className="w-4 h-4 mt-0.5 flex-shrink-0 accent-blue-600 cursor-pointer"
                    />
                    <span>
                        <span className="block text-sm text-slate-700">Show vacations</span>
                        <span className="block text-xs text-gray-500">School vacation periods in orange</span>
                    </span>
                </label>
            }
            onShow={(interval) => {
                if (showIntervalsSheet) {
                    closeIntervalsSheet();
                }
                showInterval(interval);
            }}
        />
    );

    return (
        <div className="w-full max-w-7xl mx-auto pt-4 pb-8 md:px-8 md:pt-6 overflow-x-clip">
            <WeatherSymbols />
            <div className="flex gap-8 justify-center px-8 mb-2">
                <div className="w-full max-w-[364px] xs:max-w-full xs:w-[392px] sm:w-[420px] md:w-[448px] xl:w-[560px] ">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl xl:text-5xl font-bold font-serif text-center">
                        Continuous Calendar
                    </h1>
                </div>
                <div className="hidden lg:block w-72 flex-shrink-0" />
            </div>

            {/* Sticky week day headers - responsive width */}
            <div className="sticky top-0 bg-white z-20 px-8 pt-2 mb-4">
                <div className="flex gap-8 justify-center">
                    <div className="w-full max-w-[364px] xs:max-w-full xs:w-[392px] sm:w-[420px] md:w-[448px] xl:w-[560px]">
                        <div className="grid grid-cols-7 gap-1">
                            {weekDayLabels.map((label) => (
                                <div
                                    key={label}
                                    className="h-8 flex items-center justify-center text-xs font-medium font-serif text-gray-500 border-b"
                                >
                                    {label}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="hidden lg:block w-72 flex-shrink-0" />
                </div>
            </div>

            <div className="flex gap-8 px-8 justify-center">
                {/* Calendar section */}
                <div className="w-full max-w-[364px] xs:max-w-full xs:w-[392px] sm:w-[420px] md:w-[448px] xl:w-[560px] flex-col relative">
                    <CalendarGrid
                        weeks={weeks}
                        visibleFrom={visibleFrom}
                        selectedStart={selectedStart}
                        intervals={intervals}
                        cities={cities}
                        cityPickerIntervalId={cityPickerIntervalId}
                        weatherByDay={weatherByDay}
                        todayTime={todayTime}
                        pulse={pulse}
                        onDateClick={onDateClick}
                        onCityLabelClick={onCityLabelClick}
                        onMonthClick={onMonthClick}
                        onShowMorePast={showMorePast}
                    />
                </div>

                {/* Intervals panel - wide screens only */}
                <aside className="hidden lg:block w-72 flex-shrink-0">
                    {/* Sticks from edge to edge over the week day headers, the gaps are paddings inside its scroll area.
                        The negative margin puts it at the level of the headers, "Default city" is aligned with the week days.
                        The opaque background makes the gaps between blocks part of the scroll area for the wheel.
                        The right padding is the space for the scrollbar, the negative margin keeps the content width. */}
                    <div
                        ref={desktopPanelRef}
                        className="sticky top-0 z-30 -mt-14 -mr-5 pt-3.5 pb-8 pl-1 pr-6 bg-white"
                    >
                        {isDesktop && intervalsPanel}
                    </div>
                </aside>
            </div>

            {/* Floating button with intervals sheet and pending interval hint next to it - narrow screens.
                They stay under the open sheet, so they don't disappear before the sheet covers them. */}
            {!isDesktop && (
                <button
                    className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-slate-800 text-white shadow-lg flex items-center justify-center hover:bg-slate-700 transition-colors cursor-pointer"
                    title="Intervals and weather"
                    aria-label="Intervals and weather"
                    onClick={openIntervalsSheet}
                >
                    <CalendarRange className="w-6 h-6" />
                    <CountBadge count={intervals.length} />
                </button>
            )}
            {!isDesktop && <FloatingPendingCard start={selectedStart} onCancel={() => setSelectedStart(null)} />}

            {!isDesktop && (
                <BottomSheet open={showIntervalsSheet} title="Weather & intervals" onClose={closeIntervalsSheet}>
                    {intervalsPanel}
                </BottomSheet>
            )}
        </div>
    );
}
