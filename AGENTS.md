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
- After the first click `PendingIntervalCard` (start date, "Choose the end date" hint, cancel button, no city controls) is shown in the intervals panel at the position of the future interval; on narrow screens it floats at the bottom next to the floating button. Esc cancels the selection

### URL Parameter System

**Parameters:**

- `dates`: Encoded intervals, one param per interval, format `YYMMDD-YYMMDD[_cityId]`
    - Example: `?dates=250101-250115_524901&dates=250201-250215`
    - `cityId` is an Open-Meteo geocoding (geonames) id, optional
- `month`: Month to scroll to in format `YYMM`
    - Example: `?month=2506` (June 2025)
- `vc`: Show vacation dates (`?vc=true`)
- `city`: Default city, Open-Meteo geocoding (geonames) id (`?city=524901`)
    - From the URL it is used without saving to localStorage (a shared link doesn't change own settings); without the param the stored default city is written to the URL; choosing or clearing the default city updates the param

**Encoding/Decoding:**

- `encodeIntervalsToURL()` / `decodeIntervalsFromURL()` in ContinuousCalendar.tsx
- `formatDateToString()`: converts Date to `YYMMDD`
- `parseStringToDate()`: converts `YYMMDD` to Date

**URL Management:**

- Before the first render (`useState` initializers): intervals, vacation flag and the visible range (`getInitialVisibleFrom`) are read from the URL, so selected days are drawn selected and the hidden weeks don't expand after loading
- On mount: scroll target (month/first interval/today), cities of intervals, default city
- On interval change: update URL via `history.replaceState()`
- Month clicks update URL via `history.pushState()`

### Scrolling Behavior

**Priority:** Month parameter > Intervals > No scroll

- **If intervals exist and no month parameter:** Scrolls to first interval start date
- **If month parameter exists:** Scrolls to first day of month

### Calendar Data Generation

- Generates days from Jan 1, 2025 to Dec 31, 2027 (`calendarConfig`)
- Visible range starts at `visibleFrom`: Monday 2 weeks before today, or earlier if intervals/month from the URL need it. Earlier weeks are hidden (their days are not rendered), each "Past" click shows 3 more months. Weather is loaded only for visible days
- Calendar data (`days`, `weeks`) is memoized, the grid is the memoized `CalendarGrid` and day cells are the memoized `DayCell` with primitive props and stable handlers (latest-ref), so panel/sheet/settings state doesn't touch the calendar and a selection change re-renders only changed days. Weather of the days (`weatherByDay`, via the module-level `getDayWeather`) is memoized and doesn't depend on the selection. Keep it this way: the calendar has hundreds of cells
- Organizes into weeks starting with Monday
- Holiday/vacation dates hardcoded in arrays (YYYY-MM-DD format)
- Day classification: working days, weekends, holidays, vacations

### Month Navigation

- Month labels rotate -90° to the left of the week with the first day of month (all screen sizes)
- Month click updates URL and scrolls to month

### Weather

- Open-Meteo API (no key) in `src/services/weather.ts`: city search/lookup, daily weather (forecast for the last week and up to 16 days ahead, archive for older dates — forecast API has gaps in the past). Beyond the forecast horizon days show typical weather calculated from the last 5 full years of the archive (±3 days window), rendered semi-transparent; typical weather is also shown from the last week on until the forecast is loaded
- Weather cache: `src/services/weatherStorage.ts` (async interface over localStorage, `weather:v1:*` keys), used only by `weather.ts`; the app doesn't know about it. Archive days and typical weather are stored forever (typical until the 5-year window changes), archive requests skip stored days and days already being requested. Forecast is stored with its request time and requested again if older than 12 hours; the app re-requests weather on tab activation (`visibilitychange`), every hour and right after midnight, when `todayTime` (today mark, forecast and typical ranges) moves to the next day. Typical weather requests are cached in memory by city and years, so a page left open over the New Year gets the new years
- Each interval has its own city, shown as a label with a pin in the bottom-left corner of its first day (not truncated, continues to the right, a later label covers an earlier one; click opens the city picker). A day shows the weather of the interval that starts later (ends later if both start on the same day); days without interval weather show the default city weather (whole calendar range)
- Weather art is drawn inside the day circle under the number by `src/components/weather/WeatherLayer.tsx` (from weather-svg-kit v8): WMO code → `WeatherKind` in `weatherPresentation.ts`, trusted inline SVG geometry in `weatherScenes.ts`, opacity via CSS variables in `weather-opacity.css`. Scenes are rendered once as `<symbol>` by `WeatherSymbols` (mounted in `ContinuousCalendar`), days reference them with `<use>`; opacity rules must stay plain class selectors, because the symbol content doesn't match selectors through the `<use>` host (CSS variables are inherited from it)
- Day circle uses `.weather-day` sized by `--weather-day-size` (40/48/52/56/72px, xl cells are 80px), number size is `53cqi`; today is marked with a pink outline as in the kit preview; don't add width/height/text-size classes to it
- Temperature (setting "Show temperature", off by default, `showTemperature` in localStorage): a quiet line centered above the number (day, then lighter night), so the city label doesn't cover it (`.weather-day__temperature` in `weather-day.css`, night is lighter, real minus sign, a halo of the circle color `--temperature-halo` separates it from the art, 20% lighter on unselected days via `--temperature-opacity`), shown only in 72px circles (container query), the full text is in the day title
- `surface`: `selected-off` for selected weekends/holidays/vacations, `vacation` for unselected vacation weekdays; `contrast` is `on-dark` for selected days
- localStorage: `defaultCity`, `recentCities` (last 5 chosen, the first one is the city of new intervals; legacy `lastCity` is migrated), `knownCities` (last 500 cities looked up by id, so cities from the URL are known before the first render on the next visits). While a city from the URL is being looked up, the panel shows a placeholder instead of "Choose a city" (`loadingCityIds`)

### Intervals panel

- `IntervalsPanel`: default city and the list of intervals with city picker, delete and scroll-to-interval
- A click on an interval scrolls to it (`scrollToDate` resolves when the first day is fully visible below the week day headers, on `scrollend` or a timeout) and then plays waves from its days (`pulse` → `DayCell.pulseKey`, a new key replays them): a translucent circle of the circle color spreading once for 1s and fading, like the sun halo in `src/components/day-pulse.css`, under the circles (`z-index: -1` inside the week), removed after `DAY_PULSE_MS`, hidden with `prefers-reduced-motion`
- Wide screens (`min-width: 64rem`): sticky column on the right, at the level of the week day headers ("Default city" is aligned with the week days); it continues down with the page until it sticks to the top edge, then it gets the viewport height and scrolls inside (paddings are inside the scroll area; the right padding `DESKTOP_PANEL_SCROLLBAR_SPACE` fits the widest scrollbar — overlay ones on macOS expand on hover — and a classic scrollbar takes its width from it with `scrollbar-gutter: stable`, so the content doesn't move), it keeps scrolling after unsticking until scrolled back to the top, so the content doesn't jump; a panel scrolled to the end (or without scroll) stays at the end when its content grows (settings, new interval), keeping the focused element (picker of a new interval) visible; narrow screens: floating button opens `BottomSheet` (slides from the bottom almost to the top, rounded top corners and a grip; the backdrop darkens with the sheet position and closes it on click; closes with swipe down anywhere unless inner content is scrolled: released below 25% of its height or flicked faster than 0.4 px/ms, as in vaul, otherwise goes back up; slides out with the finger speed)
- Open sheet has its own path `${BASE_URL}intervals` (pushState), so system "Back" closes it; `rememberURL()` must be called after every history write, so search params stay in sync between the overlay entry and the page entry
- Any other path on load (including overlay paths after a reload) is replaced with `${BASE_URL}`, keeping search params; on GitHub Pages `404.html` (second build input, `%BASE_URL%` is substituted by Vite) redirects unknown paths to the app
- `CityPicker`: expands and collapses in `Collapse`, a click on the row of the open picker closes it (its `mousedown` is stopped and prevented, so the outside-click handler and blur don't close it first); keyboard: arrows move focus between input and cities, Enter/Space select, Esc closes, Tab out closes; focus returns to the opener
- Everything that appears or disappears is animated: `usePresence` (`src/hooks/usePresence.ts`) keeps an element mounted during the exit transition and starts the enter transition before the first paint (forced reflow, no rAF); `Collapse` animates height; `useListPresence` keeps removed list items (intervals, the pending card) until they collapse; `useLastValue` keeps the content of a disappearing element
- Only one panel instance is mounted at a time (`isDesktop` via `matchMedia`), otherwise `CityPicker` outside-click handlers conflict
- New interval opens its city picker in the desktop panel; on mobile the sheet opens only if there is no city to use

### Settings

- The last block of `IntervalsPanel` (desktop panel and mobile sheet): collapsed by default, the button with a chevron expands/collapses settings in place with animation (`isSettingsOpen` lives in `ContinuousCalendar`)
- Toggle for showing vacation dates (orange highlight, including weekends; selected vacations look like selected weekends)
- Updates `vc` URL parameter
- Toggle for showing day and night temperature in the day circles (off by default, stored in localStorage `showTemperature`, not in the URL)

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
