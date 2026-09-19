import { describe, expect, test } from 'vitest';
import { podReady, podState, podTone, readiness, readinessText, readinessTone, restarts } from './status.js';
import type { Pod, Workload } from './kube.js';

const pod = (over: Partial<Pod['status']> = {}, meta: Partial<K8sDockside.ObjectMeta> = {}): Pod => ({
    metadata: { name: 'p', namespace: 'default', ...meta },
    status: { phase: 'Running', ...over },
});

describe('readiness', () => {
    test('a deployment with no spec.replicas wants one, not none', () => {
        const d: Workload = { metadata: { name: 'd' }, status: { readyReplicas: 1 } };
        expect(readiness(d, 'deployments')).toEqual({ ready: 1, desired: 1 });
    });

    test('a daemonset counts under its own field names', () => {
        const ds: Workload = {
            metadata: { name: 'ds' },
            status: { desiredNumberScheduled: 4, numberReady: 3 },
        };
        expect(readiness(ds, 'daemonsets')).toEqual({ ready: 3, desired: 4 });
    });

    test('a daemonset read as a deployment would be wrong -- which is why kind is passed', () => {
        const ds: Workload = { metadata: { name: 'ds' }, status: { desiredNumberScheduled: 4, numberReady: 3 } };
        expect(readiness(ds, 'deployments')).toEqual({ ready: 0, desired: 1 });
    });

    test('tones', () => {
        expect(readinessTone({ ready: 3, desired: 3 })).toBe('ok');
        expect(readinessTone({ ready: 1, desired: 3 })).toBe('warn');
        expect(readinessTone({ ready: 0, desired: 3 })).toBe('error');
        expect(readinessTone({ ready: 0, desired: 0 })).toBe('');
    });

    test('text', () => {
        expect(readinessText({ ready: 2, desired: 3 })).toBe('2/3 ready');
    });
});

describe('podState', () => {
    test('prefers a container reason over the phase', () => {
        // The bug this guards: phase says Running while the container is in
        // CrashLoopBackOff, and a tree that trusted phase would draw it green.
        const crashing = pod({
            phase: 'Running',
            containerStatuses: [{ name: 'app', restartCount: 7, state: { waiting: { reason: 'CrashLoopBackOff' } } }],
        });
        expect(podState(crashing)).toBe('CrashLoopBackOff');
        expect(podTone(crashing)).toBe('error');
    });

    test('ignores the reasons that are not problems', () => {
        const starting = pod({ phase: 'Pending', containerStatuses: [{ name: 'app', state: { waiting: { reason: 'ContainerCreating' } } }] });
        expect(podState(starting)).toBe('Pending');
    });

    test('a finished job pod is not a fault', () => {
        const done = pod({ phase: 'Succeeded', containerStatuses: [{ name: 'app', state: { terminated: { reason: 'Completed', exitCode: 0 } } }] });
        expect(podState(done)).toBe('Succeeded');
        expect(podTone(done)).toBe('');
    });

    test('a deleted pod is terminating whatever its phase says', () => {
        const going = pod({ phase: 'Running' }, { deletionTimestamp: '2026-01-01T00:00:00Z' });
        expect(podState(going)).toBe('Terminating');
        expect(podTone(going)).toBe('warn');
    });

    test('running but not ready is amber, running and ready is green', () => {
        expect(podTone(pod({ phase: 'Running' }))).toBe('warn');
        expect(podTone(pod({ phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] }))).toBe('ok');
    });

    test('readiness reads the Ready condition, not the phase', () => {
        expect(podReady(pod({ conditions: [{ type: 'Ready', status: 'False' }] }))).toBe(false);
        expect(podReady(pod({ conditions: [{ type: 'Initialized', status: 'True' }] }))).toBe(false);
    });
});

describe('restarts', () => {
    test('adds up every container', () => {
        expect(restarts(pod({ containerStatuses: [{ name: 'a', restartCount: 2 }, { name: 'b', restartCount: 3 }] }))).toBe(5);
    });

    test('is zero when the cluster has not said', () => {
        expect(restarts(pod())).toBe(0);
    });
});
