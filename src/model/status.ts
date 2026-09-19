// Turning an object's status into a number and a colour.
//
// Kept apart from the tree builders because it is the part with real
// Kubernetes knowledge in it -- DaemonSets count their replicas under
// different field names from everything else, and a Pod's phase alone is not
// its health.

import type { Tone } from './tree.js';
import type { Pod, Workload, ReplicaSet } from './kube.js';

export interface Readiness {
    ready: number;
    desired: number;
}

/**
 * How many of a workload's replicas are ready, and how many it wants.
 *
 * DaemonSets have no `spec.replicas` -- the cluster decides how many there
 * are -- so they report `desiredNumberScheduled`/`numberReady` instead. Every
 * other workload uses `spec.replicas`/`status.readyReplicas`.
 */
export function readiness(obj: Workload, kind: string): Readiness {
    if (kind === 'daemonsets') {
        return {
            ready: obj.status?.numberReady ?? 0,
            desired: obj.status?.desiredNumberScheduled ?? 0,
        };
    }
    return {
        ready: obj.status?.readyReplicas ?? 0,
        // A Deployment with no spec.replicas defaults to one, not to none.
        desired: obj.spec?.replicas ?? 1,
    };
}

export function replicaSetReadiness(rs: ReplicaSet): Readiness {
    return { ready: rs.status?.readyReplicas ?? 0, desired: rs.spec?.replicas ?? 0 };
}

/** Green when every replica is ready, grey when none are wanted, amber between. */
export function readinessTone({ ready, desired }: Readiness): Tone {
    if (desired === 0) return '';
    if (ready === 0) return 'error';
    return ready >= desired ? 'ok' : 'warn';
}

/**
 * A Pod's state in one word, preferring the container's reason over the
 * phase: a Pod stuck in ImagePullBackOff or CrashLoopBackOff is still
 * `phase: Running` or `Pending`, and the phase alone would hide it.
 */
export function podState(pod: Pod): string {
    const statuses = pod.status?.containerStatuses ?? [];
    for (const status of statuses) {
        for (const state of Object.values(status.state ?? {})) {
            const reason = state?.reason;
            if (reason && reason !== 'Completed' && reason !== 'ContainerCreating') return reason;
        }
    }
    if (pod.metadata.deletionTimestamp) return 'Terminating';
    return pod.status?.phase ?? 'Unknown';
}

export function podTone(pod: Pod): Tone {
    const state = podState(pod);
    if (state === 'Succeeded' || state === 'Completed') return '';
    if (state === 'Running' && podReady(pod)) return 'ok';
    if (state === 'Running' || state === 'Pending' || state === 'ContainerCreating') return 'warn';
    if (state === 'Terminating') return 'warn';
    return 'error';
}

/** Whether the Pod's `Ready` condition says True. */
export function podReady(pod: Pod): boolean {
    return (pod.status?.conditions ?? []).some((c) => c.type === 'Ready' && c.status === 'True');
}

/** "2/3 ready", or "3/3 ready" -- the detail text on a workload row. */
export function readinessText({ ready, desired }: Readiness): string {
    return `${ready}/${desired} ready`;
}

/** How many times a Pod's containers have restarted, added up. */
export function restarts(pod: Pod): number {
    return (pod.status?.containerStatuses ?? []).reduce((total, c) => total + (c.restartCount ?? 0), 0);
}
