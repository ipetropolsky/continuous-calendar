import { type MouseEvent, type ReactNode, useEffect, useMemo, useRef } from 'react';

import { ChevronRight, MapPin, Settings, Trash2, X } from 'lucide-react';

import { CityPicker } from '@/components/CityPicker';
import { Collapse, COLLAPSE_MS } from '@/components/Collapse';
import { useListPresence } from '@/hooks/usePresence';
import type { City } from '@/services/weather';

export interface IntervalItem {
    id: string;
    startDate: Date;
    endDate: Date;
    city: City | null;
    isCityLoading: boolean; // The city from the URL is being looked up
}

// City picker id for the default city, interval ids never match it
export const DEFAULT_CITY_PICKER_ID = 'default-city';

interface IntervalsPanelProps {
    intervals: IntervalItem[];
    pendingStart: Date | null; // Start of the interval being selected
    onCancelPending: () => void;
    defaultCity: City | null;
    isDefaultCityLoading: boolean;
    recentCities: City[];
    cityPickerIntervalId: string | null;
    onDefaultCitySelect: (city: City | null) => void;
    onOpenCityPicker: (intervalId: string) => void;
    onCloseCityPicker: () => void;
    onCitySelect: (intervalId: string, city: City) => void;
    onRemove: (intervalId: string) => void;
    onShow: (interval: IntervalItem) => void;
    isSettingsOpen: boolean;
    onToggleSettings: () => void;
    settings: ReactNode;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Clickable rows fill the whole card width, so there is no need to aim at the text.
// Rows have their own corner radius matching the card, so the focus outline isn't cut by the card corners.
const FOCUS_CLASS = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500';
const ROW_BUTTON_CLASS = `hover:bg-zinc-100 ${FOCUS_CLASS} transition-colors cursor-pointer`;

const formatDay = (date: Date, withYear: boolean): string =>
    date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined });

// "29 Oct – 8 Nov 2026", "29 Dec 2026 – 8 Jan 2027" or "8 Nov 2026" for a single day
const formatRange = (start: Date, end: Date): string => {
    if (start.getTime() === end.getTime()) {
        return formatDay(end, true);
    }
    return `${formatDay(start, start.getFullYear() !== end.getFullYear())} – ${formatDay(end, true)}`;
};

interface PendingIntervalCardProps {
    start: Date;
    onCancel: () => void;
    className?: string;
    shouldReveal?: boolean; // Scroll the panel to the card when it appears
}

// Interval with the chosen start date, waiting for the end date. `className` must set the position (relative/fixed)
export function PendingIntervalCard({ start, onCancel, className = '', shouldReveal }: PendingIntervalCardProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (shouldReveal) {
            ref.current?.scrollIntoView({ block: 'nearest' });
        }
    }, [shouldReveal]);

    return (
        <div ref={ref} className={`rounded-xl font-sans ${className}`}>
            <div className="pl-3 pr-14 py-3">
                <div className="font-serif font-medium text-slate-800">{formatDay(start, true)} – …</div>
                <div className="text-xs text-blue-700">Choose the end date in the calendar</div>
            </div>
            <button
                className={`absolute inset-y-0 right-0 w-12 flex items-center justify-center rounded-r-xl text-gray-400 hover:text-slate-700 hover:bg-black/5 ${FOCUS_CLASS} transition-colors cursor-pointer`}
                title="Cancel"
                aria-label="Cancel interval selection"
                onClick={onCancel}
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

// City name, or a placeholder while the city from the URL is being looked up
const renderCityName = (city: City | null, isLoading: boolean) => {
    if (city) {
        return city.name;
    }
    return isLoading ? (
        <span
            className="inline-block w-20 h-3 align-middle rounded bg-zinc-200 animate-pulse"
            aria-label="Loading city"
        />
    ) : (
        'Choose a city'
    );
};

const getDaysCount = (start: Date, end: Date): number => Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;

// The pending interval is a list item too, so it appears and disappears like intervals
const PENDING_KEY = 'pending';

type ListItem =
    | { key: string; interval: IntervalItem; pendingStart?: never }
    | { key: string; interval?: never; pendingStart: Date };

const getItemKey = (item: ListItem): string => item.key;

// A click on the row of the open city picker closes it. The mousedown must not reach the picker's outside-click
// handler, and the focus stays in the picker, otherwise the picker would close before the click and open again.
const keepPickerOnMouseDown = (isPickerOpen: boolean) => (e: MouseEvent) => {
    if (isPickerOpen) {
        e.preventDefault();
        e.stopPropagation();
    }
};

export function IntervalsPanel({
    intervals,
    pendingStart,
    onCancelPending,
    defaultCity,
    isDefaultCityLoading,
    recentCities,
    cityPickerIntervalId,
    onDefaultCitySelect,
    onOpenCityPicker,
    onCloseCityPicker,
    onCitySelect,
    onRemove,
    onShow,
    isSettingsOpen,
    onToggleSettings,
    settings,
}: IntervalsPanelProps) {
    // The pending interval is shown where it will be after the end date is chosen
    const listItems = useMemo(() => {
        const items: ListItem[] = intervals.map((interval) => ({ key: interval.id, interval }));
        if (pendingStart) {
            const pendingIndex = intervals.filter((interval) => interval.startDate <= pendingStart).length;
            items.splice(pendingIndex, 0, { key: PENDING_KEY, pendingStart });
        }
        return items;
    }, [intervals, pendingStart]);
    const listEntries = useListPresence(listItems, getItemKey, COLLAPSE_MS);

    const toggleCityPicker = (pickerId: string) =>
        cityPickerIntervalId === pickerId ? onCloseCityPicker() : onOpenCityPicker(pickerId);

    const renderInterval = (interval: IntervalItem) => {
        const daysCount = getDaysCount(interval.startDate, interval.endDate);
        const isPickerOpen = interval.id === cityPickerIntervalId;
        return (
            <div className="rounded-xl bg-zinc-50">
                {/* Delete button lies over the right part of the full-width header */}
                <div className="relative">
                    <button
                        className={`group w-full pl-3 pr-14 pt-3 pb-2 text-left rounded-t-xl ${ROW_BUTTON_CLASS}`}
                        onClick={() => onShow(interval)}
                    >
                        <div className="font-serif font-medium text-slate-800 group-hover:text-blue-600 transition-colors">
                            {formatRange(interval.startDate, interval.endDate)}
                        </div>
                        <div className="text-xs text-gray-500">
                            {daysCount} {daysCount === 1 ? 'day' : 'days'}
                        </div>
                    </button>
                    <button
                        className={`absolute inset-y-0 right-0 w-12 flex items-center justify-center rounded-tr-xl text-gray-400 hover:text-red-600 hover:bg-red-50 ${FOCUS_CLASS} transition-colors cursor-pointer`}
                        title="Remove interval"
                        aria-label="Remove interval"
                        onClick={() => onRemove(interval.id)}
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>

                <button
                    className={`group w-full px-3 pt-2 pb-3 flex items-center gap-1 text-left text-sm text-slate-600 ${
                        isPickerOpen ? '' : 'rounded-b-xl'
                    } ${ROW_BUTTON_CLASS}`}
                    aria-expanded={isPickerOpen}
                    onMouseDown={keepPickerOnMouseDown(isPickerOpen)}
                    onClick={() => toggleCityPicker(interval.id)}
                >
                    <MapPin className="w-4 h-4 flex-shrink-0 group-hover:text-blue-600 transition-colors" />
                    <span className="truncate group-hover:text-blue-600 transition-colors">
                        {renderCityName(interval.city, interval.isCityLoading)}
                    </span>
                </button>

                <Collapse open={isPickerOpen} appear>
                    <div className="px-3 pb-3">
                        <CityPicker
                            currentCity={interval.city}
                            recentCities={recentCities}
                            onSelect={(city) => onCitySelect(interval.id, city)}
                            onClose={onCloseCityPicker}
                        />
                    </div>
                </Collapse>
            </div>
        );
    };

    return (
        <div className="space-y-6 font-sans">
            <section>
                <h3 className="mb-2 text-sm font-medium text-gray-700">Default city</h3>
                <div className="rounded-xl bg-zinc-50">
                    <button
                        className={`group w-full p-3 text-left rounded-xl ${ROW_BUTTON_CLASS}`}
                        aria-expanded={cityPickerIntervalId === DEFAULT_CITY_PICKER_ID}
                        onMouseDown={keepPickerOnMouseDown(cityPickerIntervalId === DEFAULT_CITY_PICKER_ID)}
                        onClick={() => toggleCityPicker(DEFAULT_CITY_PICKER_ID)}
                    >
                        <span className="flex items-center gap-1 text-sm text-slate-600 group-hover:text-blue-600 transition-colors">
                            <MapPin className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{renderCityName(defaultCity, isDefaultCityLoading)}</span>
                        </span>
                        <span className="block mt-1 text-xs text-gray-500">Weather for days outside of intervals</span>
                    </button>
                    <Collapse open={cityPickerIntervalId === DEFAULT_CITY_PICKER_ID} appear>
                        <div className="px-3 pb-3">
                            <CityPicker
                                currentCity={defaultCity}
                                recentCities={recentCities}
                                onSelect={onDefaultCitySelect}
                                onClose={onCloseCityPicker}
                                onClear={() => onDefaultCitySelect(null)}
                            />
                        </div>
                    </Collapse>
                </div>
            </section>

            <section>
                <h3 className="mb-2 text-sm font-medium text-gray-700">Intervals</h3>
                <Collapse open={intervals.length === 0 && !pendingStart} appear>
                    <p className="text-sm text-gray-500">Click two dates in the calendar to select an interval.</p>
                </Collapse>
                {/* Gaps are paddings inside the items, so they collapse together with the items */}
                <ul className="-mb-2">
                    {listEntries.map(({ key, item, isPresent, isAdded }) => (
                        <li key={key}>
                            <Collapse open={isPresent} appear={isAdded}>
                                <div className="pb-2">
                                    {item.pendingStart ? (
                                        <PendingIntervalCard
                                            start={item.pendingStart}
                                            onCancel={onCancelPending}
                                            shouldReveal
                                            className="relative bg-blue-50 ring-1 ring-inset ring-blue-200"
                                        />
                                    ) : (
                                        renderInterval(item.interval)
                                    )}
                                </div>
                            </Collapse>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="rounded-xl bg-zinc-50">
                <button
                    className={`group w-full p-3 flex items-center gap-2 text-left text-sm text-slate-600 ${
                        isSettingsOpen ? 'rounded-t-xl' : 'rounded-xl'
                    } ${ROW_BUTTON_CLASS}`}
                    aria-expanded={isSettingsOpen}
                    onClick={onToggleSettings}
                >
                    <Settings className="w-5 h-5 flex-shrink-0 group-hover:text-blue-600 transition-colors" />
                    <span className="flex-1 group-hover:text-blue-600 transition-colors">Settings</span>
                    <ChevronRight
                        className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform duration-200 ${
                            isSettingsOpen ? 'rotate-90' : ''
                        }`}
                    />
                </button>
                {/* Height animation: grid row grows from 0fr to 1fr, hidden content is out of the tab order */}
                <div
                    className={`grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-out ${
                        isSettingsOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 invisible'
                    }`}
                >
                    <div className="min-h-0 overflow-hidden">
                        <div className="px-3 pt-1 pb-3">{settings}</div>
                    </div>
                </div>
            </section>
        </div>
    );
}
