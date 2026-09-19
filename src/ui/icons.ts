// The handful of icons the pages draw, as inline SVG.
//
// Inline because the page has no network: it cannot fetch an icon font or a
// sprite sheet, and an <img> would need a bundled data URI anyway. These are
// 16x16, stroke-based, and inherit `currentColor` so they follow the theme
// without a second thought.

export const CHEVRON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>';
export const BOX = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M8 1.7l5.5 3v6.6L8 14.3l-5.5-3V4.7z"/><path d="M2.5 4.7L8 7.7l5.5-3M8 7.7v6.6"/></svg>';
export const LAYERS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M8 1.8l6 3-6 3-6-3z"/><path d="M2 8l6 3 6-3"/><path d="M2 11.2l6 3 6-3"/></svg>';
export const CIRCLE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="5.2"/></svg>';
export const FOLDER = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M1.8 4.2h4l1.4 1.7h7v6.2a.9.9 0 01-.9.9H2.7a.9.9 0 01-.9-.9z"/></svg>';
export const TERMINAL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5l3 3.5-3 3.5M8 11.5h5"/></svg>';
export const EDIT = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M11.2 2.3l2.5 2.5-8 8L2 13.9l1.1-3.7z"/></svg>';
export const LINK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6.6 9.4a2.8 2.8 0 004 0l2-2a2.8 2.8 0 10-4-4l-.8.8"/><path d="M9.4 6.6a2.8 2.8 0 00-4 0l-2 2a2.8 2.8 0 104 4l.8-.8"/></svg>';
export const SEARCH = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="7" cy="7" r="4.3"/><path d="M10.2 10.2L14 14"/></svg>';

/** The icon for a row, by what the row is. */
export function forType(typeLabel: string): string {
    switch (typeLabel) {
        case 'Namespace': return FOLDER;
        case 'Kind': return LAYERS;
        case 'Pod': return CIRCLE;
        case 'ReplicaSet': return LAYERS;
        default: return BOX;
    }
}
