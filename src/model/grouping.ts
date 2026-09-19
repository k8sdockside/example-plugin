// The other tree: namespace -> kind -> object.
//
// The counterpart to owners.ts, and deliberately much simpler. Where the
// ownership tree discovers its shape from the data, this one imposes a shape
// on it -- two levels of grouping over a flat list. Most "show me what is in
// here" trees are this, not the other one, and it is worth seeing both next to
// each other before choosing for your own plugin.

import type { TreeNode, Tone } from './tree.js';

export interface Grouped {
    kind: K8sDockside.Kind;
    typeLabel: string;
    objects: K8sDockside.KubeObject[];
    /** How a row of this kind is described. */
    describe?: (obj: K8sDockside.KubeObject) => { detail: string; tone: Tone };
}

/**
 * Groups objects by `metadata.namespace`, then by kind. Namespaces come in
 * name order; kinds keep the order they were given, which is the order the
 * caller thinks they matter in, not alphabetical.
 *
 * Cluster-scoped objects (no namespace) are gathered under one heading rather
 * than dropped.
 */
export function namespaceTree(groups: Grouped[]): TreeNode[] {
    const namespaces = new Set<string>();
    for (const group of groups) {
        for (const obj of group.objects) namespaces.add(obj.metadata.namespace ?? '');
    }

    const out: TreeNode[] = [];
    for (const ns of [...namespaces].sort(clusterScopedLast)) {
        const children: TreeNode[] = [];
        let total = 0;
        for (const group of groups) {
            const mine = group.objects
                .filter((obj) => (obj.metadata.namespace ?? '') === ns)
                .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
            if (!mine.length) continue;
            total += mine.length;
            children.push({
                id: `${ns}/${group.kind}`,
                label: group.typeLabel,
                typeLabel: 'Kind',
                detail: String(mine.length),
                tone: '',
                children: mine.map((obj) => ({
                    id: obj.metadata.uid ?? `${ns}/${group.kind}/${obj.metadata.name}`,
                    label: obj.metadata.name,
                    typeLabel: group.typeLabel,
                    ...(group.describe?.(obj) ?? { detail: '', tone: '' as Tone }),
                    object: { kind: group.kind, namespace: ns, name: obj.metadata.name },
                    children: [],
                })),
            });
        }
        out.push({
            id: `ns/${ns}`,
            label: ns || 'cluster-scoped',
            typeLabel: 'Namespace',
            detail: `${total} objects`,
            tone: '',
            // A namespace row is a real object the app can open -- unless it is
            // the bucket standing in for "no namespace at all".
            ...(ns ? { object: { kind: 'namespaces', namespace: '', name: ns } } : {}),
            children,
        });
    }
    return out;
}

function clusterScopedLast(a: string, b: string): number {
    if (a === '') return 1;
    if (b === '') return -1;
    return a.localeCompare(b);
}
