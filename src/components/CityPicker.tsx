import { useEffect, useRef, useState } from 'react';

import { MapPin, X } from 'lucide-react';

import { type City, formatCityLabel, searchCities } from '@/services/weather';

interface CityPickerProps {
    currentCity: City | null;
    align: 'left' | 'right';
    onSelect: (city: City) => void;
    onClose: () => void;
}

export function CityPicker({ currentCity, align, onSelect, onClose }: CityPickerProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<City[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

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

    return (
        <div
            ref={containerRef}
            className={`absolute top-full mt-1 z-30 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 p-3 font-sans ${
                align === 'right' ? 'right-0' : 'left-0'
            }`}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-1 text-sm text-gray-700 min-w-0">
                    <MapPin className="w-4 h-4 flex-shrink-0 text-gray-400" />
                    <span className="truncate">{currentCity ? formatCityLabel(currentCity) : 'Choose a city'}</span>
                </div>
                <button
                    className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={onClose}
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <input
                autoFocus
                type="text"
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
            {!isLoading && query.trim().length >= 2 && results.length === 0 && (
                <div className="mt-2 text-xs text-gray-500">Nothing found</div>
            )}
            {results.length > 0 && (
                <ul className="mt-2 max-h-56 overflow-y-auto">
                    {results.map((city) => (
                        <li key={city.id}>
                            <button
                                className={`w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-gray-100 transition-colors cursor-pointer ${
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
        </div>
    );
}
