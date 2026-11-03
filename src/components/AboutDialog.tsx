import { type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { X } from 'lucide-react';

import { usePresence } from '@/hooks/usePresence';

interface AboutDialogProps {
    open: boolean;
    onClose: () => void;
}

const ANIMATION_MS = 200;

const Link = ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
        {children}
    </a>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <section>
        <h3 className="mb-1 text-sm font-semibold text-slate-800">{title}</h3>
        <div className="space-y-2">{children}</div>
    </section>
);

// Methodology of the weather data. Modal `<dialog>` makes the rest of the page inert and keeps the focus inside,
// it is rendered into the body, so swipes inside it don't drag the bottom sheet.
export function AboutDialog({ open, onClose }: AboutDialogProps) {
    const { ref: dialogRef, isMounted, isVisible } = usePresence<HTMLDialogElement>(open, ANIMATION_MS);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useLayoutEffect(() => {
        const dialog = dialogRef.current;
        if (!isMounted || !dialog) {
            return;
        }
        dialog.showModal();
        return () => dialog.close();
    }, [isMounted, dialogRef]);

    // Page doesn't scroll under the dialog, the previous value is restored, as the bottom sheet may lock it too
    useEffect(() => {
        if (!isMounted) {
            return;
        }
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isMounted]);

    if (!isMounted) {
        return null;
    }

    // Esc closes only the dialog: the calendar handlers on the document would close the sheet or cancel the selection
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
        }
    };

    return createPortal(
        <dialog
            ref={dialogRef}
            aria-labelledby="about-title"
            className="fixed inset-0 m-0 w-full h-full max-w-none max-h-none p-4 bg-transparent backdrop:bg-transparent flex items-center justify-center font-sans"
            onCancel={(e) => {
                // Closed with the exit animation
                e.preventDefault();
                onCloseRef.current();
            }}
            onKeyDown={handleKeyDown}
        >
            <div
                className={`absolute inset-0 bg-slate-900/50 transition-opacity duration-200 ease-out ${
                    isVisible ? 'opacity-100' : 'opacity-0'
                }`}
                aria-hidden="true"
                onClick={onClose}
            />
            <div
                className={`relative w-full max-w-xl max-h-full flex flex-col bg-white rounded-2xl shadow-2xl transition-[opacity,scale] duration-200 ease-out ${
                    isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                }`}
            >
                <div className="flex justify-between items-center px-5 pt-4 pb-3 border-b border-gray-100">
                    <h2 id="about-title" className="text-xl font-semibold font-serif text-gray-800">
                        About the weather
                    </h2>
                    <button
                        className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                        aria-label="Close"
                        onClick={onClose}
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="overflow-y-auto overscroll-contain px-5 py-4 space-y-4 text-sm leading-relaxed text-slate-600">
                    <p>
                        Weather data comes from <Link href="https://open-meteo.com/">Open-Meteo</Link>, an open weather
                        API built on numerical models of national weather services. All values are for the model grid
                        cell of the city, not for a weather station, and days are counted in the local time of the city.
                    </p>

                    <Section title="Forecast: the last week and 16 days ahead">
                        <p>
                            <Link href="https://open-meteo.com/en/docs">Forecast API</Link> with the{' '}
                            <code className="text-xs">best_match</code> model: the best available models for the
                            location (for example, DWD ICON in Europe), refined by high-resolution local models where
                            they exist. A forecast is reused for up to 12 hours, it is updated when the page becomes
                            active and at midnight.
                        </p>
                    </Section>

                    <Section title="Past: reanalysis">
                        <p>
                            Days older than a week come from the{' '}
                            <Link href="https://open-meteo.com/en/docs/historical-weather-api">
                                Historical Weather API
                            </Link>
                            , based on the{' '}
                            <Link href="https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels">
                                ECMWF ERA5
                            </Link>{' '}
                            reanalysis combined with the ECMWF IFS analysis. Reanalysis is a weather model re-run with
                            past observations assimilated, the most consistent record of what actually happened.
                        </p>
                    </Section>

                    <Section title="Beyond 16 days: typical weather">
                        <p>
                            Not a forecast, but statistics of the same reanalysis for the last 5 full years, using the 3
                            days on each side of the date (35 days in total). Temperatures are the mean daily maximum
                            and minimum. The day is rainy or snowy if at least 45% of these days had 1 mm of
                            precipitation or more, otherwise its cloudiness is the mean cloud cover. Typical days are
                            drawn semi-transparent, and they are also shown until the forecast is loaded.
                        </p>
                    </Section>

                    <Section title="Day icons">
                        <p>
                            Icons follow the{' '}
                            <Link href="https://open-meteo.com/en/docs#weather_variable_documentation">
                                WMO weather codes
                            </Link>
                            . Open-Meteo takes the daily code from the most severe hour, so a single overcast hour makes
                            the whole day overcast. That is why for days without precipitation the calendar recalculates
                            the cloudiness itself from the mean cloud cover of the day: less than 20% is clear, less
                            than 45% mainly clear, less than 80% partly cloudy, more is overcast. Compared with a year
                            of observations at eight European weather stations, this matches the observed cloud cover on
                            61% of days and is at most one step off on 96%. Rain, snow, fog and thunderstorms are shown
                            as reported by the model.
                        </p>
                    </Section>

                    <Section title="Data and privacy">
                        <p>
                            Cities are looked up with the{' '}
                            <Link href="https://open-meteo.com/en/docs/geocoding-api">Open-Meteo Geocoding API</Link> (
                            <Link href="https://www.geonames.org/">GeoNames</Link>). There is no server: intervals and
                            cities live in the page address, weather is cached in your browser. Public holidays are for
                            Russia.
                        </p>
                    </Section>

                    <p className="pt-3 border-t border-gray-100 text-xs text-gray-500">
                        <Link href="https://open-meteo.com/">Weather data by Open-Meteo.com</Link>, licensed under{' '}
                        <Link href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Link>. Reanalysis:
                        Copernicus Climate Change Service, ERA5.
                    </p>
                </div>
            </div>
        </dialog>,
        document.body
    );
}
