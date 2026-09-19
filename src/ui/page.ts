// The things every page in this plugin does the same way.
//
// Three of them are worth copying into any plugin:
//
//  1. `start` wraps the page in one try/catch. Every bridge call rejects with
//     an Error carrying a sentence written for a person, so the honest thing
//     to do with a failure is show that sentence -- not a blank page and a
//     console nobody can open, because the page is in a sandboxed frame.
//  2. `fail` puts it where the user is looking.
//  3. Nothing subscribes to the theme: the SDK writes the tokens onto :root
//     before `ready()` resolves and rewrites them when the user switches, so a
//     stylesheet in `var(--text)` follows along on its own. `on('theme')` is
//     only needed when a page draws with colour values rather than CSS -- a
//     canvas, or an inline SVG fill computed in JavaScript.

import { el, replace } from './dom.js';

/** Shows a failure where the user is looking, as a sentence. */
export function fail(host: HTMLElement, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    replace(
        host,
        el('div', { class: 'failure' }, el('strong', {}, 'That did not work. '), el('span', {}, message)),
    );
}

/**
 * Runs a page's body once the bridge is ready, and shows anything that goes
 * wrong instead of dying silently.
 */
export function start(hostId: string, body: (ctx: K8sDockside.Context) => Promise<void>): void {
    const run = async () => {
        const host = document.getElementById(hostId);
        try {
            const ctx = await k8sdockside.ready();
            await body(ctx);
        } catch (err) {
            if (host) fail(host, err);
        }
    };
    void run();
}

/** A labelled number, the tile the overview is built from. */
export function stat(label: string, value: string, tone = ''): HTMLElement {
    return el(
        'div',
        { class: 'stat' },
        el('div', { class: `stat-value tone-${tone || 'none'}` }, value),
        el('div', { class: 'stat-label' }, label),
    );
}

/** A section with a heading and a sentence under it. */
export function section(title: string, note: string, ...children: (Node | null)[]): HTMLElement {
    return el(
        'section',
        { class: 'block' },
        el('h2', {}, title),
        note ? el('p', { class: 'note' }, note) : null,
        ...children.filter((c): c is Node => c !== null),
    );
}

/** `namespace/name`, or just the name when there is no namespace. */
export function where(namespace: string, name: string): string {
    return namespace ? `${namespace}/${name}` : name;
}

/**
 * How long ago a timestamp was, in the app's shorthand. Kubernetes writes
 * RFC 3339; an absent or unparseable one reads as an em dash rather than
 * "NaN", which is the kind of thing users report as a bug.
 */
export function since(timestamp: string | undefined, now = Date.now()): string {
    if (!timestamp) return '—';
    const then = Date.parse(timestamp);
    if (Number.isNaN(then)) return '—';
    const seconds = Math.max(0, Math.round((now - then) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}
