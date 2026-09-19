// The slices of Kubernetes objects these pages actually read.
//
// The bridge hands back whole objects (`spec`, `status` and all) typed only as
// K8sDockside.KubeObject, whose `spec` and `status` are `unknown`. Narrowing
// them here, once, is what makes the rest of src/ type-safe: every page says
// `list<Deployment>(...)` and gets fields rather than casts.
//
// Only the fields the pages read are declared. Everything else is still there
// at runtime -- KubeObject's index signature keeps it -- it just is not typed,
// which is the honest description of what we know.

/** A kind the manifest declares. Narrower than K8sDockside.Kind on purpose. */
export type WorkloadKind = 'deployments' | 'statefulsets' | 'daemonsets';
export type TreeKind = WorkloadKind | 'replicasets' | 'pods';

export interface Condition {
    type: string;
    status: 'True' | 'False' | 'Unknown' | string;
    reason?: string;
    message?: string;
    lastTransitionTime?: string;
}

export interface ContainerStatus {
    name: string;
    ready?: boolean;
    restartCount?: number;
    image?: string;
    started?: boolean;
    state?: Record<string, { reason?: string; message?: string; exitCode?: number }>;
}

export interface Pod extends K8sDockside.KubeObject {
    spec?: {
        nodeName?: string;
        containers?: { name: string; image?: string }[];
    };
    status?: {
        phase?: string;
        podIP?: string;
        startTime?: string;
        conditions?: Condition[];
        containerStatuses?: ContainerStatus[];
    };
}

export interface ReplicaSet extends K8sDockside.KubeObject {
    spec?: { replicas?: number };
    status?: { replicas?: number; readyReplicas?: number };
}

export interface Workload extends K8sDockside.KubeObject {
    spec?: { replicas?: number; paused?: boolean };
    status?: {
        replicas?: number;
        readyReplicas?: number;
        updatedReplicas?: number;
        availableReplicas?: number;
        // DaemonSets count differently from the others.
        desiredNumberScheduled?: number;
        numberReady?: number;
        conditions?: Condition[];
    };
}

/** The controller that owns an object, if one does. */
export function controllerOf(obj: K8sDockside.KubeObject): K8sDockside.OwnerReference | undefined {
    return (obj.metadata.ownerReferences ?? []).find((ref) => ref.controller);
}

/** `namespace/name`, or just the name for a cluster-scoped object. */
export function ref(obj: K8sDockside.KubeObject): string {
    const ns = obj.metadata.namespace;
    return ns ? `${ns}/${obj.metadata.name}` : obj.metadata.name;
}
