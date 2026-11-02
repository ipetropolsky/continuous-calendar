import { type CSSProperties, memo, type ReactElement } from 'react';

import type { WeatherContrast, WeatherKind } from './weatherPresentation';
import { WEATHER_SCENES } from './weatherScenes';

import './weather-day.css';
import './weather-opacity.css';

export interface WeatherLayerProps {
    kind: WeatherKind;
    contrast: WeatherContrast;
    surface?: 'default' | 'selected-off' | 'vacation';
    // Equal sectors for different weather in overlapping city intervals.
    // Values are optional; a normal day uses one complete background.
    sectorIndex?: number;
    sectorCount?: number;
}

const getSymbolId = (contrast: WeatherContrast, kind: WeatherKind): string => `weather-${contrast}-${kind}`;

// Scenes are defined once and referenced by every day with `<use>`, so the DOM doesn't repeat their geometry.
// Styles of `weather-opacity.css` apply to the symbol content, CSS variables are inherited from the `<use>` host.
// Must be rendered once on the page where `WeatherLayer` is used.
export const WeatherSymbols = memo(function WeatherSymbols(): ReactElement {
    return (
        <svg className="absolute w-0 h-0 overflow-hidden" aria-hidden="true" focusable="false">
            {(Object.keys(WEATHER_SCENES) as WeatherContrast[]).flatMap((contrast) =>
                (Object.keys(WEATHER_SCENES[contrast]) as WeatherKind[])
                    .filter((kind) => WEATHER_SCENES[contrast][kind])
                    .map((kind) => (
                        // Generated local geometry only; never insert API or user text here.
                        <symbol
                            key={getSymbolId(contrast, kind)}
                            id={getSymbolId(contrast, kind)}
                            viewBox="0 0 100 100"
                            dangerouslySetInnerHTML={{ __html: WEATHER_SCENES[contrast][kind] }}
                        />
                    ))
            )}
        </svg>
    );
});

const sectorClip = (index: number, count: number): string | undefined => {
    if (!Number.isInteger(count) || count <= 1) {
        return undefined;
    }
    const safeIndex = Number.isFinite(index) ? Math.max(0, Math.min(count - 1, Math.trunc(index))) : 0;
    const points: string[] = ['50% 50%'];
    const start = -Math.PI / 2 + (safeIndex / count) * Math.PI * 2;
    const end = -Math.PI / 2 + ((safeIndex + 1) / count) * Math.PI * 2;
    // An outside radius covers the square; the round day clip supplies the disc edge.
    const steps = Math.max(4, Math.ceil(24 / count));
    for (let step = 0; step <= steps; step += 1) {
        const angle = start + ((end - start) * step) / steps;
        points.push(`${50 + Math.cos(angle) * 100}% ${50 + Math.sin(angle) * 100}%`);
    }
    return `polygon(${points.join(', ')})`;
};

export const WeatherLayer = ({
    kind,
    contrast,
    surface = 'default',
    sectorIndex = 0,
    sectorCount = 1,
}: WeatherLayerProps): ReactElement | null => {
    if (kind === 'none') {
        return null;
    }
    const style: CSSProperties = { clipPath: sectorClip(sectorIndex, sectorCount) };
    return (
        <span
            className="weather-art"
            data-weather-contrast={contrast}
            data-weather-surface={surface}
            style={style}
            aria-hidden="true"
        >
            <svg className="weather-art__image" viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
                <use href={`#${getSymbolId(contrast, kind)}`} />
            </svg>
        </span>
    );
};
