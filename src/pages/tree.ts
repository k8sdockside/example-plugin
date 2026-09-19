// The tree, in two tabs over the same data.
//
//   Ownership -- Deployment -> ReplicaSet -> Pod, discovered from
//                metadata.ownerReferences (src/model/owners.ts)
//   Namespace -- namespace -> kind -> object, imposed on the same lists
//                (src/model/grouping.ts)
//
// What to take from this page:
//
//  - `watch` rather than `list`: the app polls and calls back, and the tree is
//    rebuilt from each answer. Open rows survive because they are held by node
//    id, not by position (src/ui/tree.ts).
//  - Five kinds are read at once. `watch` does one kind, so there are five
//    watches and one shared redraw. A cluster with no StatefulSets still has
//    the kind -- an empty list is not an error -- but a kind the cluster does
//    not serve at all rejects, which is why each watch has an onError that
//    leaves the rest running.
//  - `storage` remembers the namespace and which rows were open, per cluster.
//    It is optional on older apps, so every use is behind a check.
//  - Clicking a row opens the object in the app (`open`); the buttons on a row
//    are `logs` and `edit`; the Deployment rows link to this plugin's own
//    Workload page (`openView`) with the object handed over through `storage`.

import { Tree } from '../ui/tree.js';
import { byId, el, svg, replace } from '../ui/dom.js';
import { start, fail } from '../ui/page.js';
import { EDIT, TERMINAL, LINK } from '../ui/icons.js';
import { ownerTree, type WorkloadLists } from '../model/owners.js';
import { namespaceTree } from '../model/grouping.js';
import { count, filter, type TreeNode } from '../model/tree.js';
import { podState, podTone, readiness, readinessText, readinessTone } from '../model/status.js';
import type { Pod, ReplicaSet, Workload } from '../model/kube.js';

type Tab = 'ownership' | 'namespace';

const KINDS = ['deployments', 'statefulsets', 'daemonsets', 'replicasets', 'pods'] as const;

/** Where the page hands the selected workload to workload.html. */
export const HANDOFF_KEY = 'workload';
const NAMESPACE_KEY = 'tree.namespace';
const OPEN_ROWS_KEY = 'tree.open';

start('page', async (ctx) => {
    const host = byId('tree');
    const lists: WorkloadLists = { deployments: [], statefulsets: [], daemonsets: [], replicasets: [], pods: [] };
    let tab: Tab = 'ownership';
    let namespace = '';
    let needle = '';
    // Each kind's first answer. Drawing before they are all in would flash a
    // tree with the Pods but not the Deployments that own them.
    const arrived = new Set<string>();

    const tree = new Tree(host, {
        empty: 'No workloads here.',
        onSelect: (node) => {
            if (!node.object) return;
            void k8sdockside.open(node.object);
        },
        rowActions: (node) => rowActions(node),
    });

    // ----- what the rows do --------------------------------------------------

    function iconButton(markup: string, title: string, onClick: () => void): HTMLElement {
        const node = el('button', { type: 'button', class: 'row-action', title, 'aria-label': title });
        node.append(svg(markup));
        node.addEventListener('click', (event) => {
            event.stopPropagation();
            onClick();
        });
        return node;
    }

    function rowActions(node: TreeNode): HTMLElement[] {
        const object = node.object;
        if (!object) return [];
        const actions: HTMLElement[] = [];
        if (object.kind === 'pods') {
            actions.push(iconButton(TERMINAL, 'Open logs', () => void k8sdockside.logs(object)));
        }
        if (object.kind === 'deployments') {
            // The page-to-page link. `storage` carries which object, `openView`
            // changes the tab. The hash is set too, so the same page opened
            // from a search hit -- which sets the hash and not storage -- lands
            // in the same place. See the manifest's `focus`.
            actions.push(
                iconButton(LINK, 'Open in the Workload page', async () => {
                    try {
                        await k8sdockside.storage?.set(HANDOFF_KEY, object);
                        await k8sdockside.openView('workload');
                    } catch (err) {
                        fail(byId('page'), err);
                    }
                }),
            );
        }
        actions.push(iconButton(EDIT, 'Edit YAML', () => void k8sdockside.edit(object)));
        return actions;
    }

    // ----- drawing -----------------------------------------------------------

    function build(): TreeNode[] {
        if (tab === 'ownership') return ownerTree(lists);
        return namespaceTree([
            { kind: 'deployments', typeLabel: 'Deployment', objects: lists.deployments, describe: workload('deployments') },
            { kind: 'statefulsets', typeLabel: 'StatefulSet', objects: lists.statefulsets, describe: workload('statefulsets') },
            { kind: 'daemonsets', typeLabel: 'DaemonSet', objects: lists.daemonsets, describe: workload('daemonsets') },
            { kind: 'replicasets', typeLabel: 'ReplicaSet', objects: lists.replicasets, describe: replicaSet },
            { kind: 'pods', typeLabel: 'Pod', objects: lists.pods, describe: (obj) => ({ detail: podState(obj as Pod), tone: podTone(obj as Pod) }) },
        ]);
    }

    const workload = (kind: string) => (obj: K8sDockside.KubeObject) => {
        const ready = readiness(obj as Workload, kind);
        return { detail: readinessText(ready), tone: readinessTone(ready) };
    };

    const replicaSet = (obj: K8sDockside.KubeObject) => {
        const rs = obj as ReplicaSet;
        const desired = rs.spec?.replicas ?? 0;
        if (desired === 0) return { detail: 'superseded', tone: '' as const };
        const ready = { ready: rs.status?.readyReplicas ?? 0, desired };
        return { detail: readinessText(ready), tone: readinessTone(ready) };
    };

    function redraw(): void {
        if (arrived.size < KINDS.length) return;
        const all = build();
        const shown = filter(all, needle);
        tree.render(shown);
        const total = count(all);
        const visible = count(shown);
        byId('summary').textContent = needle ? `${visible} of ${total} rows` : `${total} rows`;
        void remember();
    }

    async function remember(): Promise<void> {
        try {
            await k8sdockside.storage?.set(OPEN_ROWS_KEY, tree.openRows());
        } catch {
            // Storage is a convenience: a plugin over its 64-key budget, or an
            // app too old to have it, must not break the tree.
        }
    }

    // ----- the controls ------------------------------------------------------

    function drawTabs(): void {
        const make = (id: Tab, label: string, note: string) => {
            const node = el('button', { type: 'button', class: 'tab', 'aria-selected': String(tab === id), title: note }, label);
            node.addEventListener('click', () => {
                tab = id;
                drawTabs();
                redraw();
            });
            return node;
        };
        replace(
            byId('tabs'),
            make('ownership', 'Ownership', 'Built from metadata.ownerReferences: Deployment, its ReplicaSets, their Pods'),
            make('namespace', 'Namespace', 'The same objects, grouped by namespace and then by kind'),
        );
    }

    const search = byId<HTMLInputElement>('search');
    search.addEventListener('input', () => {
        needle = search.value;
        redraw();
    });

    byId('expand').addEventListener('click', () => {
        tree.expandAll();
        void remember();
    });
    byId('collapse').addEventListener('click', () => {
        tree.collapseAll();
        void remember();
    });

    const picker = byId<HTMLSelectElement>('namespace');
    picker.addEventListener('change', () => {
        namespace = picker.value;
        void k8sdockside.storage?.set(NAMESPACE_KEY, namespace).catch(() => {});
        restart();
    });

    // ----- reading the cluster -----------------------------------------------

    let stops: K8sDockside.Unsubscribe[] = [];

    function restart(): void {
        for (const stop of stops) stop();
        stops = [];
        arrived.clear();
        for (const kind of KINDS) lists[kind] = [];
        replace(byId('tree'), el('p', { class: 'loading' }, 'Reading the cluster…'));

        for (const kind of KINDS) {
            const stop = k8sdockside.watch<never>(
                { kind, namespace, interval: 5000 },
                (items) => {
                    // The lists are typed per kind; the watch is generic over
                    // one type, so this is the one place a cast is honest.
                    (lists[kind] as K8sDockside.KubeObject[]) = items;
                    arrived.add(kind);
                    redraw();
                },
                (err) => {
                    // One kind failing -- a cluster that does not serve it, or
                    // RBAC that does not allow it -- must not empty the tree.
                    arrived.add(kind);
                    byId('footnote').textContent = `${kind} could not be read: ${err.message}`;
                    redraw();
                },
            );
            stops.push(stop);
        }
    }

    // ----- go ----------------------------------------------------------------

    drawTabs();

    try {
        const names = await k8sdockside.namespaces();
        for (const name of names) picker.append(el('option', { value: name }, name));
    } catch {
        // Not fatal: the picker just stays on "all namespaces".
    }

    // What this page remembered last time, on this cluster.
    const saved = await k8sdockside.storage?.get<string>(NAMESPACE_KEY).catch(() => null);
    if (saved && [...picker.options].some((o) => o.value === saved)) {
        namespace = saved;
        picker.value = saved;
    }

    byId('footnote').textContent =
        `Polling every 5s on ${ctx.contextName}. Rows open the object in the app; the buttons are logs, the Workload page, and the YAML editor.`;

    restart();

    const openRows = await k8sdockside.storage?.get<string[]>(OPEN_ROWS_KEY).catch(() => null);
    if (Array.isArray(openRows)) tree.restoreOpenRows(openRows);
});
