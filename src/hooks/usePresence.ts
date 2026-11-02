import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Mount and unmount an element with enter and exit transitions. The element is mounted in the hidden state,
// its styles are computed (forced reflow) and then it is made visible before the paint, so the enter transition
// starts in the first frame without waiting for animation frames. `appear` animates the initial mount too.
export function usePresence<T extends HTMLElement>(show: boolean, durationMs: number, appear = false) {
    const ref = useRef<T>(null);
    const [isMounted, setIsMounted] = useState(show);
    const [isVisible, setIsVisible] = useState(show && !appear);

    useLayoutEffect(() => {
        if (show) {
            setIsMounted(true);
            return;
        }
        if (!isMounted) {
            return;
        }
        setIsVisible(false);
        const timeoutId = setTimeout(() => setIsMounted(false), durationMs);
        return () => clearTimeout(timeoutId);
    }, [show, isMounted, durationMs]);

    useLayoutEffect(() => {
        if (show && isMounted && !isVisible) {
            ref.current?.getBoundingClientRect();
            setIsVisible(true);
        }
    }, [show, isMounted, isVisible]);

    return { ref, isMounted, isVisible };
}

// The last non-empty value, keeps the content of an element while it disappears
export function useLastValue<T>(value: T | null | undefined): T | null {
    const [lastValue, setLastValue] = useState<T | null>(value ?? null);
    if (value != null && value !== lastValue) {
        setLastValue(value);
    }
    return value ?? lastValue;
}

export interface PresenceEntry<T> {
    key: string;
    item: T;
    isPresent: boolean; // false while the removed item disappears
    isAdded: boolean; // Added after the first render, so it should appear with animation
}

// Removed items stay after their previous neighbour until they disappear
const mergeEntries = <T>(entries: PresenceEntry<T>[], items: T[], getKey: (item: T) => string) => {
    const result: PresenceEntry<T>[] = items.map((item) => {
        const key = getKey(item);
        const previous = entries.find((entry) => entry.key === key);
        return { key, item, isPresent: true, isAdded: previous ? previous.isAdded : true };
    });
    const keys = new Set(result.map(({ key }) => key));
    entries.forEach((entry, index) => {
        if (keys.has(entry.key)) {
            return;
        }
        const position = index > 0 ? result.findIndex(({ key }) => key === entries[index - 1].key) + 1 : 0;
        result.splice(position, 0, { ...entry, isPresent: false });
    });
    return result;
};

// List with removed items kept until their exit transition ends. `items` should keep its identity between renders.
export function useListPresence<T>(items: T[], getKey: (item: T) => string, durationMs: number): PresenceEntry<T>[] {
    const [entries, setEntries] = useState<PresenceEntry<T>[]>(() =>
        items.map((item) => ({ key: getKey(item), item, isPresent: true, isAdded: false }))
    );
    const [previousItems, setPreviousItems] = useState(items);

    let currentEntries = entries;
    if (items !== previousItems) {
        currentEntries = mergeEntries(entries, items, getKey);
        setPreviousItems(items);
        setEntries(currentEntries);
    }

    const hasLeaving = entries.some(({ isPresent }) => !isPresent);
    useEffect(() => {
        if (!hasLeaving) {
            return;
        }
        const timeoutId = setTimeout(() => setEntries((prev) => prev.filter(({ isPresent }) => isPresent)), durationMs);
        return () => clearTimeout(timeoutId);
    }, [entries, hasLeaving, durationMs]);

    return currentEntries;
}
