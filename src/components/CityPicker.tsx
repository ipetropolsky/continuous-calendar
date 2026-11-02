import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { MapPin, X } from 'lucide-react';

import { type City, formatCityLabel, searchCities } from '@/services/weather';

interface CityPickerProps {
    currentCity: City | null;
    recentCities: City[];
    onSelect: (city: City) => void;
    onClose: () => void;
    onClear?: () => void; // Shows "Don't use a city" action
}

export function CityPicker({ currentCity, recentCities, onSelect, onClose, onClear }: CityPickerProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<City[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [isExpanded, setIsExpanded] = useState(false);

    // Expand after the collapsed state is painted
    useEffect(() => {
        let frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => {
                setIsExpanded(true);
                // Focus without scrolling the clipping wrapper, autoFocus would shift the content while it expands
                inputRef.current?.focus({ preventScroll: true });
            });
        });
        return () => cancelAnimationFrame(frame);
    }, []);

    // Return focus to the control that opened the picker, unless the user has moved it elsewhere
    useLayoutEffect(() => {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const container = containerRef.current;
        return () => {
            const { activeElement } = document;
            const isFocusLost = !activeElement || activeElement === document.body || container?.contains(activeElement);
            if (isFocusLost && opener?.isConnected) {
                opener.focus();
            }
        };
    }, []);

    // Close on Esc and on click outside
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        const handleMouseDown = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleMouseDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleMouseDown);
        };
    }, [onClose]);

    // Debounced city search
    useEffect(() => {
        const trimmedQuery = query.trim();
        if (trimmedQuery.length < 2) {
            setResults([]);
            setIsLoading(false);
            return;
        }

        const controller = new AbortController();
        setIsLoading(true);
        const timeoutId = setTimeout(() => {
            searchCities(trimmedQuery, controller.signal)
                .then(setResults)
                .catch(() => {
                    if (!controller.signal.aborted) {
                        setResults([]);
                    }
                })
                .finally(() => {
                    if (!controller.signal.aborted) {
                        setIsLoading(false);
                    }
                });
        }, 300);

        return () => {
            clearTimeout(timeoutId);
            controller.abort();
        };
    }, [query]);

    // Arrows move focus between the search input and the list of cities, Enter/Space select a focused city
    const handleArrowKeys = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
            return;
        }
        const options = Array.from(containerRef.current?.querySelectorAll<HTMLElement>('[data-city-option]') ?? []);
        const focusables = [inputRef.current, ...options].filter((element) => !!element);
        const index = focusables.indexOf(document.activeElement as HTMLElement);
        if (index === -1) {
            return;
        }
        e.preventDefault();
        const nextIndex = e.key === 'ArrowDown' ? Math.min(index + 1, focusables.length - 1) : Math.max(index - 1, 0);
        focusables[nextIndex].focus();
    };

    const isQueryShort = query.trim().length < 2;
    // Recently chosen cities until the user types a query
    const visibleCities = isQueryShort ? recentCities : results;

    return (
        // Height animation: grid row grows from 0fr to 1fr, the inner wrapper clips the content
        <div
            className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
        >
            {/* Padding keeps the shadow visible inside the clipping wrapper */}
            <div className="min-h-0 overflow-hidden -mx-2 px-2 -mb-3 pb-3">
                <div
                    ref={containerRef}
                    className="mt-2 bg-white rounded-xl shadow-lg border border-gray-100 p-3 font-sans"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={handleArrowKeys}
                    onBlur={(e) => {
                        // Close when Tab moves focus out of the picker
                        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) {
                            onClose();
                        }
                    }}
                >
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-1 text-sm text-gray-700 min-w-0">
                            <MapPin className="w-4 h-4 flex-shrink-0 text-gray-400" />
                            <span className="truncate">
                                {currentCity ? formatCityLabel(currentCity) : 'Choose a city'}
                            </span>
                        </div>
                        <button
                            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                            aria-label="Close"
                            onClick={onClose}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <input
                        ref={inputRef}
                        type="text"
                        aria-label="Search city"
                        value={query}
                        placeholder="Search city…"
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key !== 'Enter') {
                                return;
                            }
                            if (results.length > 0) {
                                onSelect(results[0]);
                            } else if (query.trim().length >= 2) {
                                // Don't wait for debounced search results
                                searchCities(query.trim())
                                    .then(([firstCity]) => firstCity && onSelect(firstCity))
                                    .catch(() => {});
                            }
                        }}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    {isLoading && <div className="mt-2 text-xs text-gray-500">Searching…</div>}
                    {!isLoading && !isQueryShort && results.length === 0 && (
                        <div className="mt-2 text-xs text-gray-500">Nothing found</div>
                    )}
                    {isQueryShort && recentCities.length > 0 && (
                        <div className="mt-2 text-xs text-gray-500">Recent</div>
                    )}
                    {visibleCities.length > 0 && (
                        <ul className="mt-1 max-h-56 overflow-y-auto">
                            {visibleCities.map((city) => (
                                <li key={city.id}>
                                    <button
                                        data-city-option
                                        className={`w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-gray-100 focus:bg-gray-100 focus:outline-none transition-colors cursor-pointer ${
                                            city.id === currentCity?.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                                        }`}
                                        onClick={() => onSelect(city)}
                                    >
                                        {formatCityLabel(city)}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {onClear && currentCity && (
                        <button
                            data-city-option
                            className="mt-2 w-full text-left px-2 py-1.5 text-sm text-gray-500 rounded-md hover:bg-gray-100 hover:text-gray-700 focus:bg-gray-100 focus:text-gray-700 focus:outline-none transition-colors cursor-pointer"
                            onClick={onClear}
                        >
                            Don't use a city
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
