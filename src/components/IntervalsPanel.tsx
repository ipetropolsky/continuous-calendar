import { MapPin, Trash2 } from 'lucide-react';

import { CityPicker } from '@/components/CityPicker';
import type { City } from '@/services/weather';

export interface IntervalItem {
    id: string;
    startDate: Date;
    endDate: Date;
    city: City | null;
}

// City picker id for the default city, interval ids never match it
export const DEFAULT_CITY_PICKER_ID = 'default-city';

interface IntervalsPanelProps {
    intervals: IntervalItem[];
    defaultCity: City | null;
    recentCities: City[];
    cityPickerIntervalId: string | null;
    onDefaultCitySelect: (city: City | null) => void;
    onOpenCityPicker: (intervalId: string) => void;
    onCloseCityPicker: () => void;
    onCitySelect: (intervalId: string, city: City) => void;
    onRemove: (intervalId: string) => void;
    onShow: (interval: IntervalItem) => void;
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

const getDaysCount = (start: Date, end: Date): number => Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;

export function IntervalsPanel({
    intervals,
    defaultCity,
    recentCities,
    cityPickerIntervalId,
    onDefaultCitySelect,
    onOpenCityPicker,
    onCloseCityPicker,
    onCitySelect,
    onRemove,
    onShow,
}: IntervalsPanelProps) {
    return (
        <div className="space-y-6 font-sans">
            <section>
                <h3 className="mb-2 text-sm font-medium text-gray-700">Default city</h3>
                <div className="rounded-xl bg-zinc-50">
                    <button
                        className={`group w-full p-3 text-left rounded-xl ${ROW_BUTTON_CLASS}`}
                        aria-expanded={cityPickerIntervalId === DEFAULT_CITY_PICKER_ID}
                        onClick={() => onOpenCityPicker(DEFAULT_CITY_PICKER_ID)}
                    >
                        <span className="flex items-center gap-1 text-sm text-slate-600 group-hover:text-blue-600 transition-colors">
                            <MapPin className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{defaultCity?.name ?? 'Choose a city'}</span>
                        </span>
                        <span className="block mt-1 text-xs text-gray-500">Weather for days outside of intervals</span>
                    </button>
                    {cityPickerIntervalId === DEFAULT_CITY_PICKER_ID && (
                        <div className="px-3 pb-3">
                            <CityPicker
                                currentCity={defaultCity}
                                recentCities={recentCities}
                                onSelect={onDefaultCitySelect}
                                onClose={onCloseCityPicker}
                                onClear={() => onDefaultCitySelect(null)}
                            />
                        </div>
                    )}
                </div>
            </section>

            <section>
                <h3 className="mb-2 text-sm font-medium text-gray-700">Intervals</h3>
                {intervals.length === 0 ? (
                    <p className="text-sm text-gray-500">Click two dates in the calendar to select an interval.</p>
                ) : (
                    <ul className="space-y-2">
                        {intervals.map((interval) => {
                            const daysCount = getDaysCount(interval.startDate, interval.endDate);
                            return (
                                <li key={interval.id} className="rounded-xl bg-zinc-50">
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
                                            interval.id === cityPickerIntervalId ? '' : 'rounded-b-xl'
                                        } ${ROW_BUTTON_CLASS}`}
                                        aria-expanded={interval.id === cityPickerIntervalId}
                                        onClick={() => onOpenCityPicker(interval.id)}
                                    >
                                        <MapPin className="w-4 h-4 flex-shrink-0 group-hover:text-blue-600 transition-colors" />
                                        <span className="truncate group-hover:text-blue-600 transition-colors">
                                            {interval.city?.name ?? 'Choose a city'}
                                        </span>
                                    </button>

                                    {interval.id === cityPickerIntervalId && (
                                        <div className="px-3 pb-3">
                                            <CityPicker
                                                currentCity={interval.city}
                                                recentCities={recentCities}
                                                onSelect={(city) => onCitySelect(interval.id, city)}
                                                onClose={onCloseCityPicker}
                                            />
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
}
