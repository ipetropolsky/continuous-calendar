import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';

import { X } from 'lucide-react';

import { usePresence } from '@/hooks/usePresence';

interface BottomSheetProps {
    open: boolean;
    title: string;
    onClose: () => void;
    children: ReactNode;
}

const ANIMATION_MS = 300;
// Swipe down closes the sheet if it is released below a quarter of its height (unless flicked back up)
// or flicked down fast enough from any position, otherwise it goes back up. Thresholds as in vaul.
const CLOSE_DISTANCE_RATIO = 0.25;
const CLOSE_VELOCITY = 0.4; // px/ms
// Release velocity is measured over the last moves
const VELOCITY_WINDOW_MS = 100;
const MIN_CLOSE_MS = 120;

// Ease-out curve starting with the given speed relative to the average one (0..3).
// The initial slope of a cubic bezier is y1 / x1.
const getCloseEasing = (initialSpeedRatio: number): string =>
    `cubic-bezier(0.33, ${(Math.min(3, initialSpeedRatio) * 0.33).toFixed(3)}, 0.67, 1)`;

// Element or one of its ancestors inside the sheet is scrolled down, so a swipe should scroll it instead of the sheet
const isScrolledInside = (target: EventTarget | null, sheet: HTMLElement): boolean => {
    for (let element = target as HTMLElement | null; element && element !== sheet; element = element.parentElement) {
        if (element.scrollTop > 0) {
            return true;
        }
    }
    return false;
};

// Sheet sliding from the bottom almost to the top, over a backdrop that darkens with the sheet position. Visibility state lives here, so animation frames
// re-render only the sheet, not the whole calendar.
export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
    // Mounted in the hidden position and slides in right away, slides out and then unmounts
    const { ref: sheetRef, isMounted, isVisible } = usePresence<HTMLDivElement>(open, ANIMATION_MS);
    const backdropRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    // Reopened while sliding out after a swipe: drop the inline styles left by the swipe
    useLayoutEffect(() => {
        if (!isVisible) {
            return;
        }
        if (sheetRef.current) {
            sheetRef.current.style.transition = '';
            sheetRef.current.style.translate = '';
        }
        if (backdropRef.current) {
            backdropRef.current.style.transition = '';
            backdropRef.current.style.opacity = '';
        }
    }, [isVisible, sheetRef]);

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
        const backdrop = backdropRef.current;
        if (!isMounted || !sheet || !backdrop) {
            return;
        }

        let startY = 0;
        let offset = 0;
        let moves: { offset: number; time: number }[] = [];
        let isTracking = false;
        let isDragging = false;

        const handleTouchStart = (e: TouchEvent) => {
            isTracking = e.touches.length === 1 && !isScrolledInside(e.target, sheet);
            isDragging = false;
            startY = e.touches[0].clientY;
            offset = 0;
            moves = [];
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
                sheet.style.transition = 'none';
                backdrop.style.transition = 'none';
            }
            e.preventDefault();
            offset = Math.max(0, e.touches[0].clientY - startY);
            sheet.style.translate = `0 ${offset}px`;
            moves.push({ offset, time: e.timeStamp });
            moves = moves.filter(({ time }) => e.timeStamp - time <= VELOCITY_WINDOW_MS);
            // The backdrop gets lighter as the sheet goes down
            backdrop.style.opacity = String(Math.max(0, 1 - offset / sheet.offsetHeight));
        };

        const handleTouchEnd = (e: TouchEvent) => {
            if (!isDragging) {
                isTracking = false;
                return;
            }
            isTracking = false;
            isDragging = false;
            const firstMove = moves[0];
            const velocity = firstMove ? (offset - firstMove.offset) / Math.max(1, e.timeStamp - firstMove.time) : 0;

            const isFarEnough = offset > sheet.offsetHeight * CLOSE_DISTANCE_RATIO;
            if (velocity > CLOSE_VELOCITY || (isFarEnough && velocity > -CLOSE_VELOCITY)) {
                // Slide out right away from the released position with the finger speed. The inline position
                // overrides the class one (both set `translate`), so the sheet doesn't wait for the hidden state
                // after history navigation and doesn't go back up to it.
                const distance = sheet.offsetHeight - offset;
                const speed = Math.max(velocity, 0);
                const duration = Math.round(
                    Math.min(ANIMATION_MS, Math.max(MIN_CLOSE_MS, (3 * distance) / Math.max(speed, 0.01)))
                );
                const easing = getCloseEasing((speed * duration) / Math.max(distance, 1));
                sheet.style.transition = `translate ${duration}ms ${easing}`;
                sheet.style.translate = '0 100%';
                backdrop.style.transition = `opacity ${duration}ms ${easing}`;
                backdrop.style.opacity = '0';
                onCloseRef.current();
                return;
            }
            // Go back to the open position from the released one
            sheet.style.transition = '';
            sheet.style.translate = '';
            backdrop.style.transition = '';
            backdrop.style.opacity = '';
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
        <>
            <div
                ref={backdropRef}
                className={`fixed inset-0 z-50 bg-slate-900/50 transition-opacity duration-300 ease-out ${
                    isVisible ? 'opacity-100' : 'opacity-0'
                }`}
                aria-hidden="true"
                onClick={onClose}
            />
            <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={`fixed inset-x-0 bottom-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 bg-white rounded-t-2xl shadow-[0_-4px_24px_rgb(15_23_42/0.2)] overflow-hidden flex flex-col will-change-transform transition-[transform,translate] duration-300 ease-out ${
                    isVisible ? 'translate-y-0' : 'translate-y-full'
                }`}
            >
                {/* Grip shows that the sheet can be dragged down */}
                <div className="flex justify-center pt-2" aria-hidden="true">
                    <div className="w-10 h-1.5 rounded-full bg-gray-300" />
                </div>
                <div className="flex justify-between items-center px-4 pt-1 pb-3 border-b border-gray-100">
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
        </>
    );
}
