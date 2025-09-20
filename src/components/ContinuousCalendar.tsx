import { useState } from 'react';

interface CalendarDay {
    date: Date;
    day: number;
    month: number;
    year: number;
    isNewMonth: boolean;
    monthName: string;
    isWorkingDay: boolean;
    isHoliday: boolean;
}

interface DateInterval {
    id: string;
    startDate: Date;
    endDate: Date;
}

export function ContinuousCalendar() {
    const [intervals, setIntervals] = useState<DateInterval[]>([]);
    const [selectedStart, setSelectedStart] = useState<Date | null>(null);
    // Check if a date is a holiday
    const isHoliday = (date: Date): boolean => {
        const year = date.getFullYear();
        const month = date.getMonth() + 1; // JavaScript months are 0-indexed
        const day = date.getDate();

        if (year === 2025) {
            // 1 jan - 8 jan
            if (month === 1 && day >= 1 && day <= 8) return true;
            // 23 feb
            if (month === 2 && day === 23) return true;
            // 8 mar
            if (month === 3 && day === 8) return true;
            // 1 may
            if (month === 5 && day === 1) return true;
            // 9 may
            if (month === 5 && day === 9) return true;
            // 12 june
            if (month === 6 && day === 12) return true;
            // 25 oct - 4 nov
            if ((month === 10 && day >= 25) || (month === 11 && day <= 4)) return true;
        }

        if (year === 2026) {
            // 1 jan - 9 jan
            if (month === 1 && day >= 1 && day <= 9) return true;
            // 21 feb - 1 mar
            if ((month === 2 && day >= 21) || (month === 3 && day === 1)) return true;
            // 9 mar
            if (month === 3 && day === 9) return true;
            // 28 mar - 5 apr
            if ((month === 3 && day >= 28) || (month === 4 && day <= 5)) return true;
            // 1 may
            if (month === 5 && day === 1) return true;
            // 11 may
            if (month === 5 && day === 11) return true;
            // 12 jun
            if (month === 6 && day === 12) return true;
            // 4 nov
            if (month === 11 && day === 4) return true;
        }

        return false;
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
        <div className="w-full max-w-7xl mx-auto p-8">
            <div className="mb-8 text-center">
                <h1 className="text-3xl font-light mb-2">2025 – 2026</h1>
                <p className="text-gray-500">Continuous Calendar</p>
            </div>

            <div className="flex gap-8 justify-center">
                {/* Calendar section */}
                <div className="w-[448px] flex-col">
                    {/* Week day headers */}
                    <div className="grid grid-cols-7 gap-1 mb-4 sticky top-0 bg-white z-10 pt-2">
                        {weekDayLabels.map((label) => (
                            <div
                                key={label}
                                className="w-16 h-8 flex items-center justify-center text-xs font-medium text-gray-500 border-b"
                            >
                                {label}
                            </div>
                        ))}
                    </div>

                    {/* Calendar grid */}
                    <div className="relative">
                        {weeks.map((week, weekIndex) => (
                            <div key={weekIndex} className="grid grid-cols-7 gap-1 relative">
                                {week.map((day, dayIndex) => {
                                    if (!day) {
                                        return <div key={dayIndex} className="h-16" />;
                                    }

                                    const dayClass = day.isWorkingDay ? 'text-gray-400' : 'text-black';

                                    const dateStatus = getDateStatus(day.date);

                                    // Determine background colors based on selection status
                                    let bgClass = 'hover:bg-gray-100';
                                    if (dateStatus.isSelected || dateStatus.isInInterval) {
                                        bgClass = 'bg-slate-500 hover:bg-slate-600 text-zinc-50';
                                    }

                                    return (
                                        <div
                                            key={`${day.year}-${day.month}-${day.day}`}
                                            className="relative h-16 w-16 flex justify-center align-center"
                                        >
                                            {/* Day cell */}
                                            <div
                                                className={`h-14 w-14 flex items-center justify-center text-3xl ${bgClass} ${dayClass} rounded-full transition-colors cursor-pointer`}
                                                onClick={() => handleDateClick(day.date)}
                                            >
                                                {day.day}
                                            </div>

                                            {/* Delete button for interval end dates */}
                                            {dateStatus.isIntervalEnd && (
                                                <button
                                                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 flex items-center justify-center cursor-pointer"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        removeInterval(dateStatus.intervalId!);
                                                    }}
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Month sidebar */}
                <div className="w-24 flex-shrink-0 relative">
                    {monthPositions.map((monthPos) => (
                        <div
                            key={`${monthPos.year}-${monthPos.monthName}`}
                            className="absolute left-0"
                            style={{
                                top: `${monthPos.weekIndex * 64 + 64 + 4}px`, // 64px per week row + header height + offset
                            }}
                        >
                            <div className="text-sm font-medium text-gray-700">{monthPos.monthName}</div>
                            <div className="text-xs text-gray-500">{monthPos.year}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
