import { useState, useEffect, useLayoutEffect } from 'react';
import { X, Settings } from 'lucide-react';
import { holidayDates, vacationDates, calendarConfig } from '@/config/calendarConfig';

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

interface DateInterval {
    id: string;
    startDate: Date;
    endDate: Date;
}

interface DateStatus {
    isSelected: boolean;
    isInInterval: boolean;
    intervalId: string | null;
    isIntervalEnd: boolean;
}

export function ContinuousCalendar() {
    const [intervals, setIntervals] = useState<DateInterval[]>([]);
    const [selectedStart, setSelectedStart] = useState<Date | null>(null);
    const [shouldScrollToFirst, setShouldScrollToFirst] = useState(false);
    const [shouldScrollToMonth, setShouldScrollToMonth] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [showVacations, setShowVacations] = useState(false);
    const [showPastDates, setShowPastDates] = useState(false);
    const [shouldScrollToToday, setShouldScrollToToday] = useState(false);

    const { firstVisibleDate, startDate, endDate, monthNames, weekDayLabels } = calendarConfig;

    // Format date to YYYY-MM-DD string
    const formatDateString = (date: Date): string => {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Check if date is before firstVisibleDate
    const isDateBeforeFirstVisible = (date: Date): boolean => {
        return date < firstVisibleDate;
    };

    // Check if date is today
    const isToday = (date: Date): boolean => {
        const today = new Date();
        return (
            date.getFullYear() === today.getFullYear() &&
            date.getMonth() === today.getMonth() &&
            date.getDate() === today.getDate()
        );
    };

    // Check if a date is a holiday
    const isHoliday = (date: Date): boolean => {
        const dateString = formatDateString(date);
        return holidayDates.includes(dateString);
    };

    // Check if a date is a vacation (only if showVacations is enabled)
    const isVacation = (date: Date): boolean => {
        if (!showVacations) {
            return false;
        }
        const dateString = formatDateString(date);
        return vacationDates.includes(dateString) && !holidayDates.includes(dateString);
    };

    // Check if a date is a working day (Monday-Friday and not a holiday)
    const isWorkingDay = (date: Date): boolean => {
        const dayOfWeek = date.getDay();
        // Monday = 1, Friday = 5, Saturday = 6, Sunday = 0
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        return isWeekday && !isHoliday(date);
    };

    // Generate all days
    const generateCalendarData = (): CalendarDay[] => {
        const days: CalendarDay[] = [];

        const currentDate = new Date(startDate);
        let lastMonth = -1;

        while (currentDate <= endDate) {
            const month = currentDate.getMonth();
            const isNewMonth = month !== lastMonth;

            const dateObj = new Date(currentDate);

            days.push({
                date: dateObj,
                day: currentDate.getDate(),
                month: month,
                year: currentDate.getFullYear(),
                isNewMonth,
                monthName: monthNames[month],
                isWorkingDay: isWorkingDay(dateObj),
                isHoliday: isHoliday(dateObj),
                isVacation: isVacation(dateObj),
                isWeekend: !isWorkingDay(dateObj),
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

    const days = generateCalendarData();
    const weeks = organizeIntoWeeks(days);

    // Calculate which weeks have new months for sidebar positioning
    const getMonthPositions = () => {
        const monthPositions: { weekIndex: number; monthName: string; year: number }[] = [];

        weeks.forEach((week, weekIndex) => {
            const firstDayOfMonth = week.find((day) => day && day.isNewMonth);
            if (firstDayOfMonth) {
                monthPositions.push({
                    weekIndex,
                    monthName: firstDayOfMonth.monthName,
                    year: firstDayOfMonth.year,
                });
            }
        });

        return monthPositions;
    };

    // Check if a week should be hidden (all days before firstVisibleDate)
    const shouldHideWeek = (week: (CalendarDay | null)[]): boolean => {
        if (showPastDates) {
            return false;
        }
        // Check if all days in week are before firstVisibleDate
        // Note: week may contain null slots for empty days
        for (const day of week) {
            if (day && !isDateBeforeFirstVisible(day.date)) {
                return false; // At least one day is on or after firstVisibleDate
            }
        }
        return true;
    };

    const monthPositions = getMonthPositions();

    // URL encoding/decoding functions
    const encodeIntervalToURL = (interval: DateInterval): string => {
        const startStr = formatDateToString(interval.startDate);
        const endStr = formatDateToString(interval.endDate);
        return `${startStr}-${endStr}`;
    };

    const decodeIntervalFromURL = (urlParam: string): DateInterval | null => {
        if (!urlParam) {
            return null;
        }

        try {
            const [startStr, endStr] = urlParam.split('-');
            return {
                id: `${Date.now()}-${Math.random()}`,
                startDate: parseStringToDate(startStr),
                endDate: parseStringToDate(endStr),
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
            // Scroll to first interval if month param is not set
            if (!monthParam) {
                setShouldScrollToFirst(true);
            }
        }

        const vacationParam = urlParams.has('vc');
        if (vacationParam) {
            setShowVacations(true);
        }

        // Determine if past dates should be initially visible
        // (if we need to scroll to a date before firstVisibleDate)
        let shouldShowPastDatesInitially = false;

        if (parsedIntervals.length > 0) {
            // Sort intervals by start date to find the earliest
            const sortedIntervals = [...parsedIntervals].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
            const earliestInterval = sortedIntervals[0];
            if (isDateBeforeFirstVisible(earliestInterval.startDate)) {
                shouldShowPastDatesInitially = true;
            }
        }

        if (monthParam) {
            const monthData = parseMonthFromString(monthParam);
            if (monthData) {
                const firstDayOfMonth = new Date(monthData.year, monthData.month, 1);
                if (isDateBeforeFirstVisible(firstDayOfMonth)) {
                    shouldShowPastDatesInitially = true;
                }
            }
        }

        setShowPastDates(shouldShowPastDatesInitially);

        // Set scroll to today if no intervals or month param
        if (parsedIntervals.length === 0 && !monthParam) {
            setShouldScrollToToday(true);
        }
    }, []);

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

    // Helper function to scroll to a specific date
    const scrollToDate = (date: Date) => {
        const dateString = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        console.log('Looking for element with data-date:', dateString);

        const element = document.querySelector(`[data-date="${dateString}"]`);
        console.log('Found element:', element);

        if (element) {
            const rect = element.getBoundingClientRect();
            const elementTop = rect.top + window.pageYOffset;
            const viewportHeight = window.innerHeight;
            const targetPosition = elementTop - viewportHeight / 2 + rect.height / 2;

            console.log('Scrolling to position:', targetPosition);

            window.scrollTo({
                top: Math.max(0, targetPosition),
                behavior: 'smooth',
            });
        } else {
            console.log('Element not found for date:', dateString);
        }
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
            };

            const updatedIntervals = [...intervals, newInterval];
            setSelectedStart(null);
            updateIntervals(updatedIntervals);
        }
    };

    const updateIntervals = (newIntervals: DateInterval[]) => {
        setIntervals(newIntervals);

        const urlParams = new URLSearchParams(window.location.search);
        urlParams.delete('dates');
        newIntervals.forEach((interval) => {
            const encodedInterval = encodeIntervalToURL(interval);
            urlParams.append('dates', encodedInterval);
        });

        const newUrl = `${window.location.pathname}${urlParams.toString() ? '?' + urlParams.toString() : ''}`;
        window.history.replaceState({}, '', newUrl);
    };

    const removeInterval = (intervalId: string) => {
        const updatedIntervals = intervals.filter((interval) => interval.id !== intervalId);
        updateIntervals(updatedIntervals);
    };

    // Check if a date is in any interval
    const getDateStatus = (date: Date) => {
        const dateTime = date.getTime();

        // Check if date is selected as start
        if (selectedStart && selectedStart.getTime() === dateTime) {
            return { isSelected: true, isInInterval: false, intervalId: null, isIntervalEnd: false };
        }

        const dateStatus: DateStatus = {
            isSelected: false,
            isInInterval: false,
            intervalId: null,
            isIntervalEnd: false,
        };

        // Check if date is in any interval
        for (const interval of intervals) {
            const startTime = interval.startDate.getTime();
            const endTime = interval.endDate.getTime();

            if (dateTime >= startTime && dateTime <= endTime) {
                dateStatus.isInInterval = true;
                dateStatus.intervalId = interval.id;
                dateStatus.isIntervalEnd = dateStatus.isIntervalEnd || dateTime === endTime;
            }
        }

        return dateStatus;
    };

    const hiddenWeeksCount = weeks.reduce((result, week) => result + (shouldHideWeek(week) ? 1 : 0), 0);

    return (
        <div className="w-full max-w-7xl mx-auto py-8 md:p-8">
            <div className="flex gap-8 justify-center px-8 mb-2">
                <div className="w-full max-w-[364px] xs:max-w-full xs:w-[392px] sm:w-[420px] md:w-[448px] flex justify-between">
                    <div className="flex-1 flex flex-col md:items-center">
                        <h1 className="text-2xl md:text-3xl font-bold font-serif md:mb-1">Continuous Calendar</h1>
                        <p className="text-gray-500 font-serif">2026 — 2027</p>
                    </div>
                    <div className="md:hidden flex items-center">
                        <button
                            className="p-2 text-gray-500 hover:text-gray-700 transition-colors rounded-full hover:bg-gray-100"
                            onClick={() => {
                                setShowSettings(true);
                                setTimeout(() => setSettingsVisible(true), 10);
                            }}
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <div className="hidden md:block md:w-24 flex-shrink-0">
                    <button
                        className="p-2 text-gray-500 hover:text-gray-700 transition-colors rounded-full hover:bg-gray-100"
                        onClick={() => {
                            setShowSettings(true);
                            setTimeout(() => setSettingsVisible(true), 10);
                        }}
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Settings Modal */}
            {showSettings && (
                <div
                    className={`fixed inset-0 flex items-center justify-center z-50 transition-all duration-200 ease-in-out ${
                        settingsVisible ? 'bg-black/75' : 'bg-black/0'
                    }`}
                    onClick={() => {
                        setSettingsVisible(false);
                        setTimeout(() => setShowSettings(false), 200);
                    }}
                >
                    <div
                        className={`bg-white rounded-xl shadow-2xl p-8 w-full max-w-md mx-4 transform transition-all duration-200 ease-in-out ${
                            settingsVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-semibold text-gray-800">Settings</h2>
                            <button
                                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                                onClick={() => {
                                    setSettingsVisible(false);
                                    setTimeout(() => setShowSettings(false), 200);
                                }}
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div className="border-b border-gray-100 pb-4">
                                <h3 className="text-lg font-medium text-gray-700 mb-3">Display Options</h3>
                                <label className="flex items-start space-x-4 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={showVacations}
                                        onChange={(e) => {
                                            setShowVacations(e.target.checked);
                                            // Update URL parameter
                                            const urlParams = new URLSearchParams(window.location.search);
                                            if (e.target.checked) {
                                                urlParams.set('vc', 'true');
                                            } else {
                                                urlParams.delete('vc');
                                            }
                                            const newUrl = `${window.location.pathname}${urlParams.toString() ? '?' + urlParams.toString() : ''}`;
                                            window.history.replaceState({}, '', newUrl);
                                        }}
                                        className="w-5 h-5 mt-1 text-blue-600 border-2 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-gray-700 font-medium group-hover:text-gray-900 transition-colors">
                                            Show vacations
                                        </span>
                                        <span className="text-sm text-gray-500">
                                            Display school vacation periods in orange
                                        </span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Sticky week day headers - responsive width */}
            <div className="sticky top-0 bg-white z-20 px-8 pt-2 mb-4">
                <div className="flex gap-8 justify-center">
                    <div className="w-full max-w-[364px] xs:max-w-full xs:w-[392px] sm:w-[420px] md:w-[448px]">
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
                    <div className="hidden md:block w-24 flex-shrink-0">
                        {/* Empty space for sidebar alignment on desktop */}
                    </div>
                </div>
            </div>

            <div className="flex gap-8 px-8 justify-center">
                {/* Calendar section */}
                <div className="w-full max-w-[364px] xs:max-w-full xs:w-[392px] sm:w-[420px] md:w-[448px] flex-col relative">
                    {/* Calendar grid */}
                    <div>
                        {/* Past dates button for mobile */}
                        {hiddenWeeksCount > 0 && !showPastDates && (
                            <button
                                onClick={() => setShowPastDates(true)}
                                className="md:hidden absolute -left-1 -top-22 -translate-x-full origin-bottom-right -rotate-90 text-nowrap text-right text-xs font-serif font-medium text-gray-700 hover:text-blue-500 transition-colors bg-sky-50 hover:bg-sky-100 rounded p-1 z-20"
                            >
                                Past →
                            </button>
                        )}

                        {weeks.map((week, weekIndex) => {
                            // Check if this week has the first day of a new month
                            const firstDayOfMonth = week.find((day) => day && day.isNewMonth);

                            return (
                                <div
                                    key={weekIndex}
                                    className={`relative z-10 transition-all duration-500 ease-in-out ${
                                        shouldHideWeek(week)
                                            ? 'max-h-0 overflow-hidden mb-0 opacity-0'
                                            : 'max-h-[10000px] opacity-100 mb-2 md:mb-0'
                                    }`}
                                >
                                    {/* Month label for mobile - above first day of month */}
                                    {firstDayOfMonth && !shouldHideWeek(week) && (
                                        <div
                                            className="md:hidden"
                                            onClick={() =>
                                                handleMonthClick(firstDayOfMonth.year, firstDayOfMonth.monthName)
                                            }
                                        >
                                            <div className="absolute p-1 z-20 right-full -translate-x-1 translate-y-1 bottom-full origin-bottom-right -rotate-90 text-nowrap text-right text-xs font-serif font-medium text-gray-700 hover:text-blue-500 transition-colors inline-block cursor-pointer">
                                                {firstDayOfMonth.monthName}
                                                {'\u00a0'}
                                                <span className="text-gray-500">{firstDayOfMonth.year}</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-7 gap-1 mb-2 md:mb-0">
                                        {week.map((day, dayIndex) => {
                                            if (!day) {
                                                return <div key={dayIndex} className="h-12 md:h-16" />;
                                            }

                                            const dateStatus = getDateStatus(day.date);

                                            // Determine text color based on day type
                                            let dayClass = 'text-slate-800';
                                            if (dateStatus.isSelected || dateStatus.isInInterval) {
                                                dayClass = 'text-zinc-50';
                                            } else if (day.isVacation) {
                                                dayClass = 'text-orange-600';
                                            } else if (day.isHoliday || day.isWeekend) {
                                                dayClass = 'text-red-600';
                                            }

                                            // Determine background colors based on selection status
                                            let bgClass = 'bg-zinc-50 hover:bg-zinc-100';
                                            if (dateStatus.isSelected || dateStatus.isInInterval) {
                                                if (day.isWorkingDay && !day.isVacation) {
                                                    bgClass = 'bg-slate-600 hover:bg-slate-700';
                                                } else if (day.isVacation) {
                                                    bgClass = 'bg-red-600 hover:bg-red-700';
                                                } else if (day.isHoliday || day.isWeekend) {
                                                    bgClass = 'bg-red-600 hover:bg-orange-700';
                                                } else {
                                                    bgClass = 'bg-slate-500 hover:bg-slate-600';
                                                }
                                            } else if (day.isVacation) {
                                                bgClass = 'bg-orange-50 hover:bg-orange-100';
                                            } else if (day.isHoliday || day.isWeekend) {
                                                bgClass = 'bg-rose-50 hover:bg-rose-100';
                                            }

                                            // Check if today - add ring based on day type and selection
                                            const todayClass = isToday(day.date)
                                                ? 'ring-4 md:ring-4 ring-red-600/30'
                                                : '';

                                            return (
                                                <div
                                                    key={`${day.year}-${day.month}-${day.day}`}
                                                    className="relative z-10 h-12 xs:h-13 sm:h-15 md:h-16 md:w-16 flex justify-center align-center items-center"
                                                    data-date={`${day.year}-${day.month}-${day.day}`}
                                                >
                                                    {/* Day cell */}
                                                    <div
                                                        className={`h-10 w-10 xs:h-12 xs:w-12 sm:h-13 sm:w-13 md:h-14 md:w-14 flex items-center justify-center font-serif text-xl xs:text-2xl md:text-3xl ${bgClass} ${dayClass} ${todayClass} rounded-full transition-colors cursor-pointer`}
                                                        onClick={() => handleDateClick(day.date)}
                                                    >
                                                        {day.day}
                                                    </div>

                                                    {/* Delete button for interval end dates */}
                                                    {dateStatus.isIntervalEnd && (
                                                        <button
                                                            className="absolute -top-1 -right-1 w-4 h-4 md:w-5 md:h-5 bg-red-500 text-white rounded-full hover:bg-red-600 flex items-center justify-center cursor-pointer"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                removeInterval(dateStatus.intervalId!);
                                                            }}
                                                        >
                                                            <X className="w-2.5 h-2.5 md:w-3 md:h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Month sidebar - desktop only */}
                <div className="hidden md:block w-24 flex-shrink-0 relative">
                    {/* Past dates button for desktop */}
                    {hiddenWeeksCount > 0 && !showPastDates && (
                        <button
                            onClick={() => setShowPastDates(true)}
                            className="absolute left-0 -top-12 inline-flex items-center justify-center -ml-3 pl-3 pr-4 py-1.5 bg-sky-50 text-gray-700 rounded hover:bg-sky-100 hover:text-blue-600 transition-colors text-sm font-medium font-serif z-40 cursor-pointer"
                        >
                            ↑ Past
                        </button>
                    )}

                    {monthPositions
                        .filter((monthPos) => !shouldHideWeek(weeks[monthPos.weekIndex]))
                        .map((monthPos) => (
                            <div
                                key={`${monthPos.year}-${monthPos.monthName}`}
                                data-month={`${monthPos.year}-${monthPos.monthName}`}
                                data-week={`${monthPos.weekIndex}`}
                                className="absolute left-0 h-16 flex flex-col items-start justify-center font-serif cursor-pointer"
                                style={{
                                    top: `${(monthPos.weekIndex - hiddenWeeksCount) * 64}px`, // 64px (md:h-16) + 2px (mb-2) per week row + offset
                                }}
                                onClick={() => handleMonthClick(monthPos.year, monthPos.monthName)}
                            >
                                <div className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">
                                    {monthPos.monthName}
                                </div>
                                <div className="text-xs text-gray-500">{monthPos.year}</div>
                            </div>
                        ))}
                </div>
            </div>
        </div>
    );
}
