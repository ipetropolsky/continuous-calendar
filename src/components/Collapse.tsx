import type { ReactNode } from 'react';

import { usePresence } from '@/hooks/usePresence';

export const COLLAPSE_MS = 200;

interface CollapseProps {
    open: boolean;
    appear?: boolean; // Animate the initial mount
    children: ReactNode;
}

// Content expands and collapses by height, it is unmounted when collapsed.
// Height animation: grid row grows from 0fr to 1fr, the inner wrapper clips the content (no paddings on it,
// otherwise they stay visible when collapsed). Collapsing content is out of the tab order.
export function Collapse({ open, appear, children }: CollapseProps) {
    const { ref, isMounted, isVisible } = usePresence<HTMLDivElement>(open, COLLAPSE_MS, appear);

    if (!isMounted) {
        return null;
    }

    return (
        <div
            ref={ref}
            className={`grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-out ${
                isVisible ? 'grid-rows-[1fr] opacity-100' : `grid-rows-[0fr] opacity-0 ${open ? '' : 'invisible'}`
            }`}
        >
            <div className="min-h-0 overflow-hidden">{children}</div>
        </div>
    );
}
