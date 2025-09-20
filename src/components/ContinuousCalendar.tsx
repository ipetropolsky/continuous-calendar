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

export function ContinuousCalendar() {
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

    return (
        <div className="w-full max-w-7xl mx-auto p-8">
            <div className="mb-8 text-center">
                <h1 className="text-3xl font-light mb-2">2025 – 2026</h1>
                <p className="text-muted-foreground">Continuous Calendar</p>
            </div>

            <div className="flex gap-8">
                {/* Calendar section */}
                <div className="flex-1">
                    {/* Week day headers */}
                    <div className="grid grid-cols-7 gap-1 mb-4 sticky top-0 bg-background z-10 py-2">
                        {weekDayLabels.map((label) => (
                            <div
                                key={label}
                                className="h-8 flex items-center justify-center text-xs font-medium text-muted-foreground border-b border-border/50"
                            >
                                {label}
                            </div>
                        ))}
                    </div>

                    {/* Calendar grid */}
                    <div className="relative w-112">
                        {weeks.map((week, weekIndex) => (
                            <div key={weekIndex} className="grid grid-cols-7 gap-1 relative">
                                {week.map((day, dayIndex) => {
                                    if (!day) {
                                        return <div key={dayIndex} className="h-16" />;
                                    }

                                    const dayStyle = day.isWorkingDay
                                        ? { fontSize: '30px', color: '#aaaaaa' }
                                        : { fontSize: '30px' };

                                    return (
                                        <div key={`${day.year}-${day.month}-${day.day}`} className="relative">
                                            {/* Day cell */}
                                            <div
                                                className="h-16 w-16 flex items-center justify-center hover:bg-accent/50 rounded-full transition-colors cursor-pointer"
                                                style={dayStyle}
                                            >
                                                {day.day}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Month sidebar */}
                <div className="w-48 flex-shrink-0 relative">
                    {monthPositions.map((monthPos) => (
                        <div
                            key={`${monthPos.year}-${monthPos.monthName}`}
                            className="absolute left-4"
                            style={{
                                top: `${monthPos.weekIndex * 64 + 64 + 16}px`, // 64px per week row + header height + offset
                            }}
                        >
                            <div className="text-sm font-medium text-foreground/80">{monthPos.monthName}</div>
                            <div className="text-xs text-muted-foreground">{monthPos.year}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
