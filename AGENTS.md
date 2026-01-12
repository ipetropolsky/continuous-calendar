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
- `dates`: Encoded intervals in format `YYMMDD-YYMMDD,YYMMDD-YYMMDD`
  - Example: `?dates=250101-250115,250201-250215`
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
- Desktop: sidebar with month labels positioned by week index
- Mobile: month labels rotate -90° above first day of month
- Month click updates URL and scrolls to month

### Settings
- Toggle for showing vacation dates (orange highlight)
- Updates `vc` URL parameter

## Development Commands
```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build to /build
npm run deploy   # Deploy to GitHub Pages
npm run ts-check # TypeScript type checking
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
