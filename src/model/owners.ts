// The ownership tree: Deployment -> ReplicaSet -> Pod, built by walking
// `metadata.ownerReferences`.
//
// This is the trick worth copying out of this plugin. The bridge reads one
// kind at a time, so a tree that spans kinds is built on the page: list each
// kind, index every object by `metadata.uid`, and join children to parents
// through the `controller: true` owner reference. Nothing here is specific to
// Deployments -- the same shape works for a CRD whose operator sets owner
// references, which is most of them.
//
// Two details that are easy to get wrong, and are why this has tests:
//
//  - An object may have several ownerReferences but at most one with
//    `controller: true`. That is the one that makes a tree rather than a
//    graph; the rest are for garbage collection.
//  - An owner may be missing from what we listed -- a Pod whose ReplicaSet was
//    deleted, a Job's Pod when Jobs were not listed, a namespace filter that
//    caught the child but not the parent. Those objects still have to appear,
//    or the tree quietly loses rows. They are adopted as roots.

import { controllerOf, type Pod, type ReplicaSet, type Workload } from './kube.js';
import type { TreeNode } from './tree.js';
import { podState, podTone, readiness, readinessText, readinessTone, replicaSetReadiness, restarts } from './status.js';

export interface WorkloadLists {
    deployments: Workload[];
    statefulsets: Workload[];
    daemonsets: Workload[];
    replicasets: ReplicaSet[];
    pods: Pod[];
}

const TYPE_LABEL: Record<string, string> = {
    deployments: 'Deployment',
    statefulsets: 'StatefulSet',
    daemonsets: 'DaemonSet',
    replicasets: 'ReplicaSet',
    pods: 'Pod',
};

/** One object plus the kind we listed it as -- uid alone does not say. */
interface Entry {
    kind: string;
    obj: K8sDockside.KubeObject;
}

/**
 * Builds the forest. Roots are the workloads nothing in the set owns, in
 * kind then name order; under each, its ReplicaSets (newest first, because
 * that is the one rolling out) and then their Pods.
 */
export function ownerTree(lists: WorkloadLists): TreeNode[] {
    const byUid = new Map<string, Entry>();
    const add = (kind: string, objects: K8sDockside.KubeObject[]) => {
        for (const obj of objects) {
            const uid = obj.metadata.uid;
            if (uid) byUid.set(uid, { kind, obj });
        }
    };
    add('deployments', lists.deployments);
    add('statefulsets', lists.statefulsets);
    add('daemonsets', lists.daemonsets);
    add('replicasets', lists.replicasets);
    add('pods', lists.pods);

    // uid of parent -> the entries it controls.
    const children = new Map<string, Entry[]>();
    const roots: Entry[] = [];
    for (const entry of byUid.values()) {
        const owner = controllerOf(entry.obj);
        // No controller, or a controller we did not list: it stands on its own
        // rather than disappearing.
        if (!owner || !byUid.has(owner.uid)) {
            roots.push(entry);
            continue;
        }
        const siblings = children.get(owner.uid);
        if (siblings) siblings.push(entry);
        else children.set(owner.uid, [entry]);
    }

    return roots.sort(byKindThenName).map((entry) => node(entry, children));
}

const KIND_ORDER = ['deployments', 'statefulsets', 'daemonsets', 'replicasets', 'pods'];

function byKindThenName(a: Entry, b: Entry): number {
    const order = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    if (order !== 0) return order;
    return a.obj.metadata.name.localeCompare(b.obj.metadata.name);
}

/** Newest first for ReplicaSets, by name for everything else. */
function byAge(a: Entry, b: Entry): number {
    if (a.kind === 'replicasets' && b.kind === 'replicasets') {
        const at = a.obj.metadata.creationTimestamp ?? '';
        const bt = b.obj.metadata.creationTimestamp ?? '';
        if (at !== bt) return bt.localeCompare(at);
    }
    return byKindThenName(a, b);
}

function node(entry: Entry, children: Map<string, Entry[]>): TreeNode {
    const { kind, obj } = entry;
    const uid = obj.metadata.uid ?? `${kind}/${obj.metadata.namespace}/${obj.metadata.name}`;
    const kids = (children.get(uid) ?? []).sort(byAge).map((child) => node(child, children));
    return {
        id: uid,
        label: obj.metadata.name,
        typeLabel: TYPE_LABEL[kind] ?? kind,
        ...describe(kind, obj),
        object: { kind, namespace: obj.metadata.namespace ?? '', name: obj.metadata.name },
        children: kids,
    };
}

/** The detail text and colour for a row, which differs by kind. */
function describe(kind: string, obj: K8sDockside.KubeObject): { detail: string; tone: TreeNode['tone'] } {
    if (kind === 'pods') {
        const pod = obj as Pod;
        const restarted = restarts(pod);
        const state = podState(pod);
        return {
            detail: restarted > 0 ? `${state} · ${restarted} restarts` : state,
            tone: podTone(pod),
        };
    }
    if (kind === 'replicasets') {
        const rs = replicaSetReadiness(obj as ReplicaSet);
        // A superseded ReplicaSet is scaled to zero. That is not a fault, so it
        // is drawn plain rather than red.
        if (rs.desired === 0) return { detail: 'superseded', tone: '' };
        return { detail: readinessText(rs), tone: readinessTone(rs) };
    }
    const ready = readiness(obj as Workload, kind);
    const paused = (obj as Workload).spec?.paused === true;
    return {
        detail: paused ? `${readinessText(ready)} · paused` : readinessText(ready),
        tone: paused ? 'info' : readinessTone(ready),
    };
}

/**
 * The chain from an object up to the thing nothing owns, nearest owner first.
 * What the Pod panel draws, and the reason the panel needs no tree at all.
 */
export function ownerChain(
    start: K8sDockside.KubeObject,
    resolve: (ref: K8sDockside.OwnerReference) => K8sDockside.KubeObject | undefined,
): K8sDockside.OwnerReference[] {
    const chain: K8sDockside.OwnerReference[] = [];
    const seen = new Set<string>([start.metadata.uid ?? '']);
    let current: K8sDockside.KubeObject | undefined = start;
    while (current) {
        const owner = controllerOf(current);
        // A cycle cannot happen in a healthy cluster, but a broken operator can
        // write one, and an example that hangs the tab is a poor example.
        if (!owner || seen.has(owner.uid)) break;
        seen.add(owner.uid);
        chain.push(owner);
        current = resolve(owner);
    }
    return chain;
}
