import { describe, expect, test } from 'vitest';
import { namespaceTree, type Grouped } from './grouping.js';

const obj = (name: string, namespace?: string): K8sDockside.KubeObject => ({
    metadata: { name, ...(namespace === undefined ? {} : { namespace }), uid: `${namespace ?? ''}/${name}` },
});

function groups(over: Partial<Record<string, K8sDockside.KubeObject[]>> = {}): Grouped[] {
    return [
        { kind: 'deployments', typeLabel: 'Deployment', objects: over.deployments ?? [] },
        { kind: 'pods', typeLabel: 'Pod', objects: over.pods ?? [] },
    ];
}

describe('namespaceTree', () => {
    test('groups by namespace, then by kind', () => {
        const tree = namespaceTree(groups({ deployments: [obj('web', 'default')], pods: [obj('web-1', 'default')] }));

        expect(tree).toHaveLength(1);
        expect(tree[0]!.label).toBe('default');
        expect(tree[0]!.detail).toBe('2 objects');
        expect(tree[0]!.children.map((n) => n.label)).toEqual(['Deployment', 'Pod']);
        expect(tree[0]!.children[0]!.children[0]!.label).toBe('web');
    });

    test('keeps the kind order it was given rather than sorting it', () => {
        // The caller's order is a judgement about what matters; alphabetical
        // would throw it away.
        const tree = namespaceTree(groups({ deployments: [obj('d', 'ns')], pods: [obj('p', 'ns')] }));
        expect(tree[0]!.children.map((n) => n.label)).toEqual(['Deployment', 'Pod']);
    });

    test('leaves out a kind with nothing in that namespace', () => {
        const tree = namespaceTree(groups({ deployments: [obj('web', 'default')] }));
        expect(tree[0]!.children.map((n) => n.label)).toEqual(['Deployment']);
    });

    test('sorts namespaces by name and puts cluster-scoped objects last', () => {
        const tree = namespaceTree([
            { kind: 'pods', typeLabel: 'Pod', objects: [obj('z', 'zeta'), obj('a', 'alpha'), obj('node-ish')] },
        ]);
        expect(tree.map((n) => n.label)).toEqual(['alpha', 'zeta', 'cluster-scoped']);
    });

    test('a namespace row opens the namespace, the cluster-scoped bucket opens nothing', () => {
        const tree = namespaceTree([{ kind: 'pods', typeLabel: 'Pod', objects: [obj('a', 'alpha'), obj('free')] }]);
        expect(tree[0]!.object).toEqual({ kind: 'namespaces', namespace: '', name: 'alpha' });
        expect(tree[1]!.object).toBeUndefined();
    });

    test('uses the describe callback for the leaf rows', () => {
        const tree = namespaceTree([
            {
                kind: 'pods',
                typeLabel: 'Pod',
                objects: [obj('p', 'ns')],
                describe: () => ({ detail: 'Running', tone: 'ok' }),
            },
        ]);
        expect(tree[0]!.children[0]!.children[0]!).toMatchObject({ detail: 'Running', tone: 'ok' });
    });
});
