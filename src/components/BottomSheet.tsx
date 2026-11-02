import { type ReactNode, useEffect, useRef, useState } from 'react';

import { X } from 'lucide-react';

interface BottomSheetProps {
    open: boolean;
    title: string;
    onClose: () => void;
    children: ReactNode;
}

const ANIMATION_MS = 300;
// Swipe down closes the sheet if it is dragged far enough or flicked fast enough
const CLOSE_DISTANCE = 120; // px
const CLOSE_VELOCITY = 0.5; // px/ms

// Element or one of its ancestors inside the sheet is scrolled down, so a swipe should scroll it instead of the sheet
const isScrolledInside = (target: EventTarget | null, sheet: HTMLElement): boolean => {
    for (let element = target as HTMLElement | null; element && element !== sheet; element = element.parentElement) {
        if (element.scrollTop > 0) {
            return true;
        }
    }
    return false;
};

// Full-screen sheet sliding from the bottom. Visibility state lives here, so animation frames
// re-render only the sheet, not the whole calendar.
export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
    const [isMounted, setIsMounted] = useState(open);
    const [isVisible, setIsVisible] = useState(false);
    const sheetRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    // Mount, wait until the hidden position is painted, then slide in; slide out, then unmount
    useEffect(() => {
        if (open) {
            setIsMounted(true);
            let frame = requestAnimationFrame(() => {
                frame = requestAnimationFrame(() => setIsVisible(true));
            });
            return () => cancelAnimationFrame(frame);
        }
        setIsVisible(false);
        const timeoutId = setTimeout(() => setIsMounted(false), ANIMATION_MS);
        return () => clearTimeout(timeoutId);
    }, [open]);

    // Lock page scroll under the sheet
    useEffect(() => {
        if (!isMounted) {
            return;
        }
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, [isMounted]);

    // Swipe down anywhere in the sheet. Listeners are native to make touchmove non-passive.
    useEffect(() => {
        const sheet = sheetRef.current;
        if (!isMounted || !sheet) {
            return;
        }

        let startY = 0;
        let startTime = 0;
        let offset = 0;
        let isTracking = false;
        let isDragging = false;

        const handleTouchStart = (e: TouchEvent) => {
            isTracking = e.touches.length === 1 && !isScrolledInside(e.target, sheet);
            isDragging = false;
            startY = e.touches[0].clientY;
            startTime = e.timeStamp;
            offset = 0;
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (!isTracking) {
                return;
            }
            const delta = e.touches[0].clientY - startY;
            if (!isDragging) {
                if (delta < 0) {
                    // Swipe up scrolls the content
                    isTracking = false;
                    return;
                }
                if (delta < 8) {
                    return;
                }
                isDragging = true;
                startY += delta;
                startTime = e.timeStamp;
                sheet.style.transition = 'none';
            }
            e.preventDefault();
            offset = Math.max(0, e.touches[0].clientY - startY);
            sheet.style.translate = `0 ${offset}px`;
        };

        const handleTouchEnd = (e: TouchEvent) => {
            if (!isDragging) {
                isTracking = false;
                return;
            }
            isTracking = false;
            isDragging = false;
            const velocity = offset / Math.max(1, e.timeStamp - startTime);
            sheet.style.transition = '';
            if (offset > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY) {
                // Continue sliding down from the current position
                sheet.style.translate = '0 100%';
                onCloseRef.current();
            } else {
                sheet.style.translate = '';
            }
        };

        sheet.addEventListener('touchstart', handleTouchStart, { passive: true });
        sheet.addEventListener('touchmove', handleTouchMove, { passive: false });
        sheet.addEventListener('touchend', handleTouchEnd);
        sheet.addEventListener('touchcancel', handleTouchEnd);
        return () => {
            sheet.removeEventListener('touchstart', handleTouchStart);
            sheet.removeEventListener('touchmove', handleTouchMove);
            sheet.removeEventListener('touchend', handleTouchEnd);
            sheet.removeEventListener('touchcancel', handleTouchEnd);
        };
    }, [isMounted]);

    if (!isMounted) {
        return null;
    }

    return (
        <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`fixed inset-0 z-50 bg-white flex flex-col will-change-transform transition-transform duration-300 ease-out ${
                isVisible ? 'translate-y-0' : 'translate-y-full'
            }`}
        >
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-100">
                <h2 className="text-xl font-semibold font-serif text-gray-800">{title}</h2>
                <button
                    className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                    aria-label="Close"
                    onClick={onClose}
                >
                    <X className="w-6 h-6" />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        </div>
    );
}
