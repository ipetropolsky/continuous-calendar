import { useState, useEffect } from 'react';
import { X, Settings } from 'lucide-react';

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

export function ContinuousCalendar() {
    const [intervals, setIntervals] = useState<DateInterval[]>([]);
    const [selectedStart, setSelectedStart] = useState<Date | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [shouldScrollToFirst, setShouldScrollToFirst] = useState(false);
    const [shouldScrollToMonth, setShouldScrollToMonth] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [showVacations, setShowVacations] = useState(false);
    // Holiday dates in YYYY-MM-DD format
    const holidayDates = [
        // 2025 holidays
        '2025-01-01',
        '2025-01-02',
        '2025-01-03',
        '2025-01-04',
        '2025-01-05',
        '2025-01-06',
        '2025-01-07',
        '2025-01-08',
        '2025-02-23',
        '2025-03-08',
        '2025-05-01',
        '2025-05-02',
        '2025-05-08',
        '2025-05-09',
        '2025-06-12',
        '2025-06-13',
        '2025-11-03',
        '2025-11-04',
        // 2026 holidays
        '2026-01-01',
        '2026-01-02',
        '2026-01-03',
        '2026-01-04',
        '2026-01-05',
        '2026-01-06',
        '2026-01-07',
        '2026-01-08',
        '2026-01-09',
        '2026-02-23',
        '2026-03-09',
        '2026-05-01',
        '2026-05-11',
        '2026-06-12',
        '2026-11-04',
    ];

    // Vacation dates in YYYY-MM-DD format
    const vacationDates = [
        // 2025-10-25 to 2025-11-04
        '2025-10-25',
        '2025-10-26',
        '2025-10-27',
        '2025-10-28',
        '2025-10-29',
        '2025-10-30',
        '2025-10-31',
        '2025-11-01',
        '2025-11-02',
        '2025-11-03',
        '2025-11-04',
        // 2026-02-21 to 2026-03-01
        '2026-02-21',
        '2026-02-22',
        '2026-02-23',
        '2026-02-24',
        '2026-02-25',
        '2026-02-26',
        '2026-02-27',
        '2026-02-28',
        '2026-03-01',
        // 2026-03-28 to 2026-04-05
        '2026-03-28',
        '2026-03-29',
        '2026-03-30',
        '2026-03-31',
        '2026-04-01',
        '2026-04-02',
        '2026-04-03',
        '2026-04-04',
        '2026-04-05',
    ];

    // Format date to YYYY-MM-DD string
    const formatDateString = (date: Date): string => {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Check if a date is a holiday
    const isHoliday = (date: Date): boolean => {
        const dateString = formatDateString(date);
        return holidayDates.includes(dateString);
    };

    // Check if a date is a vacation (only if showVacations is enabled)
    const isVacation = (date: Date): boolean => {
        if (!showVacations) return false;
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

    // Generate all days from 2025-2026
    const generateCalendarData = (): CalendarDay[] => {
        const startDate = new Date(2025, 0, 1); // Jan 1, 2025
        const endDate = new Date(2026, 11, 31); // Dec 31, 2026
        const days: CalendarDay[] = [];

        const monthNames = [
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
        ];

        let currentDate = new Date(startDate);
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
    const organizeIntoWeeks = (days: CalendarDay[]): CalendarDay[][] => {
        const weeks: CalendarDay[][] = [];
        let currentWeek: CalendarDay[] = [];

        // Add empty slots for the beginning if the year doesn't start on Monday
        const firstDay = days[0].date;
        const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0

        for (let i = 0; i < firstDayOfWeek; i++) {
            currentWeek.push(null as any);
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
                currentWeek.push(null as any);
            }
            weeks.push(currentWeek);
        }

        return weeks;
    };

    const days = generateCalendarData();
    const weeks = organizeIntoWeeks(days);

    const weekDayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

    const monthPositions = getMonthPositions();

    // URL encoding/decoding functions
    const encodeIntervalsToURL = (intervals: DateInterval[]): string => {
        if (intervals.length === 0) return '';

        return intervals
            .map((interval) => {
                const startStr = formatDateToString(interval.startDate);
                const endStr = formatDateToString(interval.endDate);
                return `${startStr}-${endStr}`;
            })
            .join(',');
    };

    const decodeIntervalsFromURL = (urlParam: string): DateInterval[] => {
        if (!urlParam) return [];

        try {
            return urlParam
                .split(',')
                .map((intervalStr) => {
                    const [startStr, endStr] = intervalStr.split('-');
                    return {
                        id: `${Date.now()}-${Math.random()}`,
                        startDate: parseStringToDate(startStr),
                        endDate: parseStringToDate(endStr),
                    };
                })
                .filter((interval) => interval.startDate && interval.endDate);
        } catch {
            return [];
        }
    };

    const formatDateToString = (date: Date): string => {
        const year = date.getFullYear().toString().slice(-2); // Last 2 digits of year
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}${month}${day}`;
    };

    const parseStringToDate = (dateStr: string): Date => {
        if (dateStr.length !== 6) throw new Error('Invalid date format');

        const year = parseInt(`20${dateStr.slice(0, 2)}`);
        const month = parseInt(dateStr.slice(2, 4)) - 1; // Month is 0-indexed
        const day = parseInt(dateStr.slice(4, 6));

        return new Date(year, month, day);
    };

    // Parse URL on component mount
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const datesParam = urlParams.get('dates');
        const monthParam = urlParams.get('month');

        if (datesParam) {
            const parsedIntervals = decodeIntervalsFromURL(datesParam);
            setIntervals(parsedIntervals);

            // Priority: month parameter > intervals
            if (!monthParam) {
                setShouldScrollToFirst(true);
            }
        }

        if (monthParam) {
            setShouldScrollToMonth(monthParam);
        }

        const vacationParam = urlParams.has('vc');
        if (vacationParam) {
            setShowVacations(true);
        }

        setIsInitialized(true);
    }, []);

    // Update URL when intervals change (only after initialization)
    useEffect(() => {
        if (!isInitialized) return;

        const urlParams = new URLSearchParams(window.location.search);
        const encodedDates = encodeIntervalsToURL(intervals);

        if (encodedDates) {
            urlParams.set('dates', encodedDates);
        } else {
            urlParams.delete('dates');
        }

        const newUrl = `${window.location.pathname}${urlParams.toString() ? '?' + urlParams.toString() : ''}`;
        window.history.replaceState({}, '', newUrl);
    }, [intervals, isInitialized]);

    // Scroll to first interval after intervals are loaded from URL
    useEffect(() => {
        if (shouldScrollToFirst && intervals.length > 0) {
            // Sort intervals by start date to find the first one
            const sortedIntervals = [...intervals].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
            const firstInterval = sortedIntervals[0];

            scrollToDate(firstInterval.startDate);
            setShouldScrollToFirst(false); // Reset flag
        }
    }, [shouldScrollToFirst, intervals]);

    // Scroll to month when month parameter is set
    useEffect(() => {
        if (shouldScrollToMonth) {
            const monthData = parseMonthFromString(shouldScrollToMonth);
            if (monthData) {
                scrollToMonth(monthData.year, monthData.month);
                setShouldScrollToMonth(null);
            }
        }
    }, [shouldScrollToMonth]);

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
        if (monthStr.length !== 4) return null;

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

        if (monthIndex !== -1) {
            const monthStr = formatMonthToString(year, monthIndex);

            // Update URL
            const urlParams = new URLSearchParams(window.location.search);
            urlParams.set('month', monthStr);
            const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
            window.history.pushState({}, '', newUrl);

            // Scroll to month
            scrollToMonth(year, monthIndex);
        }
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

            setIntervals((prev) => [...prev, newInterval]);
            setSelectedStart(null);
        }
    };

    const removeInterval = (intervalId: string) => {
        setIntervals((prev) => prev.filter((interval) => interval.id !== intervalId));
    };

    // Check if a date is in any interval
    const getDateStatus = (date: Date) => {
        const dateTime = date.getTime();

        // Check if date is selected as start
        if (selectedStart && selectedStart.getTime() === dateTime) {
            return { isSelected: true, isInInterval: false, intervalId: null, isIntervalEnd: false };
        }

        // Check if date is in any interval
        for (const interval of intervals) {
            const startTime = interval.startDate.getTime();
            const endTime = interval.endDate.getTime();

            if (dateTime >= startTime && dateTime <= endTime) {
                return {
                    isSelected: false,
                    isInInterval: true,
                    intervalId: interval.id,
                    isIntervalEnd: dateTime === endTime,
                };
            }
        }

        return { isSelected: false, isInInterval: false, intervalId: null, isIntervalEnd: false };
    };

    return (
        <div className="w-full max-w-7xl mx-auto p-4 md:p-8">
            <div className="flex gap-8 justify-center mb-2">
                <div className="w-full max-w-[448px] md:w-[448px] flex justify-between">
                    <div className="flex-1 flex flex-col md:items-center">
                        <h1 className="text-2xl md:text-3xl font-bold font-serif md:mb-1">Continuous Calendar</h1>
                        <p className="text-gray-500 font-serif">2025 — 2026</p>
                    </div>
                    <div className="md:hidden flex-shrink-0">
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
            <div className="sticky top-0 bg-white z-20 pt-2 mb-4">
                <div className="flex gap-8 justify-center">
                    <div className="w-full max-w-[448px] md:w-[448px]">
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

            <div className="flex gap-8 justify-center">
                {/* Calendar section */}
                <div className="w-full px-4 max-w-[448px] md:w-[448px] flex-col">
                    {/* Calendar grid */}
                    <div>
                        {weeks.map((week, weekIndex) => {
                            // Check if this week has the first day of a new month
                            const firstDayOfMonth = week.find((day) => day && day.isNewMonth);

                            return (
                                <div key={weekIndex} className="relative z-10">
                                    {/* Month label for mobile - above first day of month */}
                                    {firstDayOfMonth && (
                                        <div
                                            className="md:hidden"
                                            onClick={() =>
                                                handleMonthClick(firstDayOfMonth.year, firstDayOfMonth.monthName)
                                            }
                                        >
                                            <div className="absolute p-1 z-20 right-full -translate-x-1 translate-y-1 bottom-full origin-bottom-right -rotate-90 text-nowrap text-right text-xs font-serif font-medium text-gray-500 hover:text-blue-500 transition-colors inline-block cursor-pointer">
                                                {firstDayOfMonth.monthName}{' '}
                                                <span className="text-gray-400">{firstDayOfMonth.year}</span>
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
                                                dayClass = 'text-rose-600';
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

                                            return (
                                                <div
                                                    key={`${day.year}-${day.month}-${day.day}`}
                                                    className="relative z-10 h-14 w-full md:h-16 md:w-16 flex justify-center align-center items-center"
                                                    data-date={`${day.year}-${day.month}-${day.day}`}
                                                >
                                                    {/* Day cell */}
                                                    <div
                                                        className={`h-12 w-12 md:h-14 md:w-14 flex items-center justify-center font-serif text-2xl md:text-3xl ${bgClass} ${dayClass} rounded-full transition-colors cursor-pointer`}
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
                    {monthPositions.map((monthPos) => (
                        <div
                            key={`${monthPos.year}-${monthPos.monthName}`}
                            data-month={`${monthPos.year}-${monthPos.monthName}`}
                            data-week={`${monthPos.weekIndex}`}
                            className="absolute left-0 h-16 flex flex-col items-start justify-center font-serif cursor-pointer"
                            style={{
                                top: `${monthPos.weekIndex * 64}px`, // 64px (md:h-16) + 2px (mb-2) per week row + offset
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
