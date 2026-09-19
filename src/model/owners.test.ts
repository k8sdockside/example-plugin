import { describe, expect, test } from 'vitest';
import { ownerTree, ownerChain, type WorkloadLists } from './owners.js';
import { count, walk } from './tree.js';
import type { Pod, ReplicaSet, Workload } from './kube.js';

/** A Deployment -> ReplicaSet -> Pod chain, as the cluster writes it. */
function chain(name: string, pods: number) {
    const deployment: Workload = {
        metadata: { name, namespace: 'default', uid: `uid-${name}` },
        spec: { replicas: pods },
        status: { readyReplicas: pods },
    };
    const rs: ReplicaSet = {
        metadata: {
            name: `${name}-abc`,
            namespace: 'default',
            uid: `uid-${name}-rs`,
            creationTimestamp: '2026-01-01T00:00:00Z',
            ownerReferences: [
                { apiVersion: 'apps/v1', kind: 'Deployment', name, uid: `uid-${name}`, controller: true },
            ],
        },
        spec: { replicas: pods },
        status: { readyReplicas: pods },
    };
    const podList: Pod[] = Array.from({ length: pods }, (_, i) => ({
        metadata: {
            name: `${name}-abc-${i}`,
            namespace: 'default',
            uid: `uid-${name}-pod-${i}`,
            ownerReferences: [
                { apiVersion: 'apps/v1', kind: 'ReplicaSet', name: `${name}-abc`, uid: `uid-${name}-rs`, controller: true },
            ],
        },
        status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
    }));
    return { deployment, rs, pods: podList };
}

function lists(over: Partial<WorkloadLists> = {}): WorkloadLists {
    return { deployments: [], statefulsets: [], daemonsets: [], replicasets: [], pods: [], ...over };
}

describe('ownerTree', () => {
    test('nests pods under their replicaset under their deployment', () => {
        const web = chain('web', 2);
        const tree = ownerTree(lists({ deployments: [web.deployment], replicasets: [web.rs], pods: web.pods }));

        expect(tree).toHaveLength(1);
        expect(tree[0]!.label).toBe('web');
        expect(tree[0]!.typeLabel).toBe('Deployment');
        expect(tree[0]!.children).toHaveLength(1);
        expect(tree[0]!.children[0]!.label).toBe('web-abc');
        expect(tree[0]!.children[0]!.children.map((n) => n.label)).toEqual(['web-abc-0', 'web-abc-1']);
    });

    test('keeps an object whose owner was not listed, as a root', () => {
        // The Pod's ReplicaSet is missing -- deleted, or filtered out by a
        // namespace. Losing the Pod would be the bug worth guarding.
        const web = chain('web', 1);
        const tree = ownerTree(lists({ pods: web.pods }));

        expect(tree).toHaveLength(1);
        expect(tree[0]!.label).toBe('web-abc-0');
        expect(tree[0]!.typeLabel).toBe('Pod');
    });

    test('ignores an owner reference that is not the controller', () => {
        const pod: Pod = {
            metadata: {
                name: 'lonely',
                namespace: 'default',
                uid: 'uid-lonely',
                ownerReferences: [
                    // Present, but not the controller: it must not make a parent.
                    { apiVersion: 'v1', kind: 'ConfigMap', name: 'cfg', uid: 'uid-cfg' },
                ],
            },
            status: { phase: 'Running' },
        };
        const owner: Workload = { metadata: { name: 'cfg', namespace: 'default', uid: 'uid-cfg' } };
        const tree = ownerTree(lists({ pods: [pod], deployments: [owner] }));

        expect(tree.map((n) => n.label).sort()).toEqual(['cfg', 'lonely']);
    });

    test('puts every object in the tree exactly once', () => {
        const a = chain('web', 2);
        const b = chain('api', 1);
        const tree = ownerTree(
            lists({
                deployments: [a.deployment, b.deployment],
                replicasets: [a.rs, b.rs],
                pods: [...a.pods, ...b.pods],
            }),
        );

        expect(count(tree)).toBe(2 + 2 + 3);
        const ids = new Set<string>();
        walk(tree, (node) => ids.add(node.id));
        expect(ids.size).toBe(7);
    });

    test('sorts replicasets newest first, so the one rolling out is on top', () => {
        const deployment: Workload = { metadata: { name: 'web', namespace: 'default', uid: 'd' }, spec: { replicas: 1 } };
        const older: ReplicaSet = {
            metadata: {
                name: 'web-old', namespace: 'default', uid: 'rs-old', creationTimestamp: '2026-01-01T00:00:00Z',
                ownerReferences: [{ apiVersion: 'apps/v1', kind: 'Deployment', name: 'web', uid: 'd', controller: true }],
            },
            spec: { replicas: 0 },
        };
        const newer: ReplicaSet = {
            metadata: {
                name: 'web-new', namespace: 'default', uid: 'rs-new', creationTimestamp: '2026-06-01T00:00:00Z',
                ownerReferences: [{ apiVersion: 'apps/v1', kind: 'Deployment', name: 'web', uid: 'd', controller: true }],
            },
            spec: { replicas: 1 }, status: { readyReplicas: 1 },
        };
        const tree = ownerTree(lists({ deployments: [deployment], replicasets: [older, newer] }));

        expect(tree[0]!.children.map((n) => n.label)).toEqual(['web-new', 'web-old']);
        expect(tree[0]!.children[1]!.detail).toBe('superseded');
    });

    test('a paused deployment says so rather than looking broken', () => {
        const deployment: Workload = {
            metadata: { name: 'web', namespace: 'default', uid: 'd' },
            spec: { replicas: 2, paused: true },
            status: { readyReplicas: 2 },
        };
        const tree = ownerTree(lists({ deployments: [deployment] }));
        expect(tree[0]!.detail).toBe('2/2 ready · paused');
        expect(tree[0]!.tone).toBe('info');
    });
});

describe('ownerChain', () => {
    test('climbs from pod to replicaset to deployment', () => {
        const web = chain('web', 1);
        const byUid = new Map([
            ['uid-web-rs', web.rs as K8sDockside.KubeObject],
            ['uid-web', web.deployment as K8sDockside.KubeObject],
        ]);
        const found = ownerChain(web.pods[0]!, (ref) => byUid.get(ref.uid));

        expect(found.map((o) => `${o.kind}/${o.name}`)).toEqual(['ReplicaSet/web-abc', 'Deployment/web']);
    });

    test('stops rather than looping when owners point at each other', () => {
        const a: K8sDockside.KubeObject = {
            metadata: { name: 'a', uid: 'a', ownerReferences: [{ apiVersion: 'v1', kind: 'B', name: 'b', uid: 'b', controller: true }] },
        };
        const b: K8sDockside.KubeObject = {
            metadata: { name: 'b', uid: 'b', ownerReferences: [{ apiVersion: 'v1', kind: 'A', name: 'a', uid: 'a', controller: true }] },
        };
        const byUid = new Map([['a', a], ['b', b]]);
        const found = ownerChain(a, (ref) => byUid.get(ref.uid));

        expect(found.map((o) => o.name)).toEqual(['b']);
    });

    test('is empty for something nothing owns', () => {
        const solo: K8sDockside.KubeObject = { metadata: { name: 'solo', uid: 's' } };
        expect(ownerChain(solo, () => undefined)).toEqual([]);
    });
});
