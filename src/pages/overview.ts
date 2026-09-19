// The overview: hello world, and a map of the rest of the plugin.
//
// A plugin gets a generated overview for free -- the manifest's `requires` and
// `cards`, drawn by the app. Declaring `overview.entry` replaces it with a page
// of your own, and then `summary()` hands you the same ingredients the
// generated one would have used, so you can still say first whether the thing
// is in this cluster at all before drawing anything clever.
//
// This page is the one to read first: it shows what `ready()` knows, which is
// most of what a plugin ever needs to know about where it is running.

import { byId, button, el, replace } from '../ui/dom.js';
import { start, stat, section } from '../ui/page.js';

start('page', async (ctx) => {
    byId('hello').textContent = `Hello, ${ctx.contextName}.`;
    byId('lead').textContent =
        'This plugin exists to be read. Everything below is a live call to the bridge, and every page in it is a few dozen lines of TypeScript in src/pages.';

    // ----- what the app already told us -------------------------------------

    // `summary()` is the generated overview's own data: the manifest's
    // requires, checked against this cluster, and its cards, counted.
    const summary = await k8sdockside.summary();

    const tiles: HTMLElement[] = [];
    for (const card of summary.cards) {
        tiles.push(stat(card.label, card.error ? '—' : String(card.total), card.error ? 'error' : ''));
    }
    tiles.push(stat('Kinds readable', String(ctx.readable.length)));
    tiles.push(stat('May change', ctx.write ? 'yes' : 'no', ctx.write ? 'warn' : ''));
    replace(byId('stats'), ...tiles);

    const blocks = byId('blocks');

    // ----- where to go next --------------------------------------------------

    const go = (viewId: string, label: string) =>
        button(label, () => void k8sdockside.openView(viewId), { class: 'primary' });

    blocks.append(
        section(
            'The pages',
            'Each one is here to show a different part of the bridge.',
            el(
                'div',
                { class: 'links' },
                go('tree', 'Open the Tree'),
                go('workload', 'Open a Workload'),
            ),
            el(
                'table',
                {},
                el(
                    'tbody',
                    {},
                    row('Tree', 'watch() on five kinds, a tree built from ownerReferences, and the same objects grouped by namespace'),
                    row('Workload', 'get(), a patch() the user confirms, and the plugin’s own actions through actions() and run()'),
                    row('Owner chain', 'a panel on every Pod’s detail view — object(), then get() up the chain'),
                    row('This page', 'ready(), summary(), openView() and open()'),
                ),
            ),
        ),
    );

    // ----- what requires said ------------------------------------------------

    const requirements = el('table', {}, el('tbody', {}, ...summary.requirements.map((req) =>
        row(
            req.label || req.kind,
            req.error ? req.error : req.served ? 'served by this cluster' : 'not served',
            req.error ? 'warn' : req.served ? 'ok' : 'error',
        ),
    )));
    blocks.append(
        section(
            'What the manifest asks for',
            summary.checked
                ? summary.installed
                    ? 'Everything the manifest requires is here — which for this plugin is only Pods and Deployments, so it is true anywhere.'
                    : 'Something the manifest requires is missing.'
                : 'The cluster could not be asked, which is not the same as finding nothing.',
            requirements,
        ),
    );

    // ----- where the page is ---------------------------------------------------

    blocks.append(
        section(
            'What ready() knows',
            'Every page gets this before it draws anything. It is the answer to “where am I, and what may I do here?”',
            facts([
                ['Plugin', `${ctx.plugin?.name ?? ctx.pluginId} ${ctx.plugin?.version ?? ''}`.trim()],
                ['View', ctx.viewId || ctx.sectionId || '(none)'],
                ['Cluster', `${ctx.contextName} (${ctx.contextId})`],
                ['Theme', `${ctx.theme.id || 'unnamed'} — a ${ctx.theme.base} one`],
                ['Readable kinds', ctx.readable.join(', ')],
                ['Declared actions', ctx.actions.map((a) => `${a.label} (on ${a.kind})`).join(', ') || '(none)'],
                ['Registries', ctx.registries ? 'allowed' : 'not asked for'],
                ['Storage', k8sdockside.storage ? 'available' : 'not on this app version'],
            ]),
        ),
    );

    // ----- credit --------------------------------------------------------------

    const links = ctx.plugin?.links ?? [];
    if (links.length) {
        blocks.append(
            section(
                'Read further',
                'These open in your browser — the page itself has no network, so it asks the app to do it.',
                el(
                    'div',
                    { class: 'links' },
                    ...links.map((link) => button(link.label, () => void k8sdockside.openUrl(link.url))),
                ),
            ),
        );
    }
});

function row(name: string, note: string, tone = ''): HTMLElement {
    return el(
        'tr',
        {},
        el('td', {}, el('strong', {}, name)),
        el('td', { class: `tone-${tone || 'none'}` }, note),
    );
}

function facts(pairs: [string, string][]): HTMLElement {
    const list = el('dl', { class: 'facts' });
    for (const [term, value] of pairs) {
        list.append(el('dt', {}, term), el('dd', { class: 'mono' }, value || '—'));
    }
    return list;
}
