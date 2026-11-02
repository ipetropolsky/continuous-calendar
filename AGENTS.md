# Continuous Calendar - Agent Guide

## Project Overview

Single-page React calendar application for visualizing dates from 2025-2026 with interval selection capabilities. Based on a Figma design. Key features:

- Date interval selection (click start date, then end date)
- URL persistence for intervals and month selection
- Automatic scrolling to first interval or selected month on load
- Holiday/vacation highlighting with toggle
- Responsive design (mobile/desktop)

## Technology Stack

- React 18.3.1 + TypeScript 5.9.2 + Vite 7.1.5
- Tailwind CSS 4.1.13 for styling
- Lucide React for icons
- gh-pages for deployment

## Key Functionality

### Date Interval Selection

- Two-click selection: first click = start date, second click = end date
- Intervals stored in state as `DateInterval[]` with unique IDs
- Visual highlighting with different colors for working days/holidays/vacations
- Delete button on interval end dates

### URL Parameter System

**Parameters:**

- `dates`: Encoded intervals, one param per interval, format `YYMMDD-YYMMDD[_cityId]`
    - Example: `?dates=250101-250115_524901&dates=250201-250215`
    - `cityId` is an Open-Meteo geocoding (geonames) id, optional
- `month`: Month to scroll to in format `YYMM`
    - Example: `?month=2506` (June 2025)
- `vc`: Show vacation dates (`?vc=true`)

**Encoding/Decoding:**

- `encodeIntervalsToURL()` / `decodeIntervalsFromURL()` in ContinuousCalendar.tsx
- `formatDateToString()`: converts Date to `YYMMDD`
- `parseStringToDate()`: converts `YYMMDD` to Date

**URL Management:**

- On mount: parse URL, set intervals/month/vacation flag
- On interval change: update URL via `history.replaceState()`
- Month clicks update URL via `history.pushState()`

### Scrolling Behavior

**Priority:** Month parameter > Intervals > No scroll

- **If intervals exist and no month parameter:** Scrolls to first interval start date
- **If month parameter exists:** Scrolls to first day of month

### Calendar Data Generation

- Generates days from Jan 1, 2025 to Dec 31, 2026
- Organizes into weeks starting with Monday
- Holiday/vacation dates hardcoded in arrays (YYYY-MM-DD format)
- Day classification: working days, weekends, holidays, vacations

### Month Navigation

- Month labels rotate -90° to the left of the week with the first day of month (all screen sizes)
- Month click updates URL and scrolls to month

### Weather

- Open-Meteo API (no key) in `src/services/weather.ts`: city search/lookup, daily weather (forecast for the last week and up to 16 days ahead, archive for older dates — forecast API has gaps in the past). Beyond the forecast horizon days show typical weather calculated from the last 5 full years of the archive (±3 days window), rendered semi-transparent
- Each interval has its own city, shown as a label with a pin in the bottom-left corner of its first day (not truncated, continues to the right, a later label covers an earlier one; click opens the city picker). A day shows the weather of the interval that starts later (ends later if both start on the same day); days without interval weather show the default city weather (whole calendar range)
- Weather art is drawn inside the day circle under the number by `src/components/weather/WeatherLayer.tsx` (from weather-svg-kit v8): WMO code → `WeatherKind` in `weatherPresentation.ts`, trusted inline SVG geometry in `weatherScenes.ts`, opacity via CSS variables in `weather-opacity.css`
- Day circle uses `.weather-day` sized by `--weather-day-size` (40/48/52/56/72px, xl cells are 80px), number size is `53cqi`; today is marked with a pink outline as in the kit preview; don't add width/height/text-size classes to it
- `surface`: `selected-off` for selected weekends/holidays/vacations, `vacation` for unselected vacation weekdays; `contrast` is `on-dark` for selected days
- localStorage: `defaultCity`, `recentCities` (last 3 chosen, the first one is the city of new intervals; legacy `lastCity` is migrated)

### Intervals panel

- `IntervalsPanel`: default city and the list of intervals with city picker, delete and scroll-to-interval
- Wide screens (`min-width: 64rem`): sticky column on the right; narrow screens: floating button opens `BottomSheet` (full-screen, slides from the bottom, closes with swipe down anywhere unless inner content is scrolled)
- Open sheet and settings have their own paths `${BASE_URL}intervals` / `${BASE_URL}settings` (pushState), so system "Back" closes them; `rememberURL()` must be called after every history write, so search params stay in sync between the overlay entry and the page entry
- Any other path on load (including overlay paths after a reload) is replaced with `${BASE_URL}`, keeping search params; on GitHub Pages `404.html` (second build input, `%BASE_URL%` is substituted by Vite) redirects unknown paths to the app
- `CityPicker`: expands with animation, keyboard: arrows move focus between input and cities, Enter/Space select, Esc closes, Tab out closes; focus returns to the opener
- Only one panel instance is mounted at a time (`isDesktop` via `matchMedia`), otherwise `CityPicker` outside-click handlers conflict
- New interval opens its city picker in the desktop panel; on mobile the sheet opens only if there is no city to use

### Settings

- Toggle for showing vacation dates (orange highlight, including weekends; selected vacations look like selected weekends)
- Updates `vc` URL parameter

## Development Commands

```bash
# Start dev server (localhost:3000)
npm run dev

# Check types
npm run ts-check

# Lint specific files
npm run lint-files file1 file2 ...

# Format specific files
npm run format-files file1 file2 ...

# Check types, lint and format entire repo
npm run check

# Production build to /build
npm run build

# Deploy to GitHub Pages
npm run deploy
```

## Testing

Don't add any tests without explicit request.

## Key Files for Modification

Main file: ContinuousCalendar.tsx

### Configuration

- `vite.config.ts`: Base path for GitHub Pages
- `tailwind.config.js`: Custom fonts (Roboto, Roboto Slab)
- `tsconfig.json`: Path alias `@/` for `src/`

## Notes for Agents

1. **URL sharing**: Intervals and month can be shared via URL
2. **Mobile responsive**: Uses Tailwind breakpoints (xs: 26rem)
3. **No backend**: All state in URL and React state
4. **Holidays fixed**: Hardcoded for Russia
5. **Scroll dependencies**: Uses DOM query selectors with `data-date` attributes

## Common Tasks

- Adding new holiday dates: update `holidayDates` array
- Adding new vacation dates: update `vacationDates` array
- Extending date range: modify `generateCalendarData()` start/end
- Changing color scheme: update Tailwind classes in day rendering
- Adding new URL parameters: extend URL parsing/updating logic
