// A panel in every Pod's detail view: what owns this Pod, all the way up.
//
// A `section` in the manifest puts a page inside the app's detail view for one
// kind, and the app tells the page which object it is drawn for. Two things
// differ from a tab:
//
//  - `ready().object` is set, and `object()` re-reads that same object live.
//    There is no need to ask which Pod -- the app already said.
//  - The page is a fixed height (the manifest's `height`), and the SDK
//    measures the content and follows it. `resize()` is only for a layout a
//    ResizeObserver cannot see.
//
// The chain itself is `ownerChain` from src/model/owners.ts, with `get()` as
// the resolver: each owner reference names a uid and a kind, and the page asks
// the app for that object to find the next link up.

import { byId, button, el, replace, svg } from '../ui/dom.js';
import { start, fail, where } from '../ui/page.js';
import { ownerChain } from '../model/owners.js';
import { CHEVRON } from '../ui/icons.js';
import type { Pod } from '../model/kube.js';

/**
 * Kubernetes owner references name a kind in singular PascalCase ("ReplicaSet");
 * the bridge wants the app's plural lowercase name ("replicasets"). Only the
 * kinds this plugin declares can be read, so anything else is left unresolved
 * rather than guessed at.
 */
const KIND_OF: Record<string, K8sDockside.Kind> = {
    Deployment: 'deployments',
    ReplicaSet: 'replicasets',
    StatefulSet: 'statefulsets',
    DaemonSet: 'daemonsets',
    Pod: 'pods',
};

start('page', async (ctx) => {
    const host = byId('chain');

    if (!ctx.object) {
        replace(host, el('p', { class: 'empty' }, 'This page is a panel; open it from a Pod.'));
        return;
    }
    const namespace = ctx.object.namespace;

    try {
        // The object the panel is drawn for, read live.
        const pod = await k8sdockside.object<Pod>();

        // Climb. Each step needs the owner's object to find *its* owner, so the
        // resolver is a `get` -- and the chain is short, so this is a handful of
        // calls, not a traversal of the cluster.
        const resolved = new Map<string, K8sDockside.KubeObject>();
        let current: K8sDockside.KubeObject = pod;
        for (;;) {
            const owner = (current.metadata.ownerReferences ?? []).find((r) => r.controller);
            if (!owner) break;
            const kind = KIND_OF[owner.kind];
            if (!kind) break;
            try {
                const parent = await k8sdockside.get({ kind, namespace, name: owner.name });
                resolved.set(owner.uid, parent);
                current = parent;
            } catch {
                // Gone, or not a kind we may read. The chain stops here rather
                // than pretending it ended.
                break;
            }
        }

        const chain = ownerChain(pod, (ref) => resolved.get(ref.uid));

        if (!chain.length) {
            replace(
                host,
                el('p', { class: 'faint' }, 'Nothing owns this Pod — it was created directly, not by a controller.'),
            );
            return;
        }

        const steps: HTMLElement[] = [
            el('span', { class: 'chain-step' }, el('span', { class: 'row-type' }, 'Pod'), el('span', {}, pod.metadata.name)),
        ];
        for (const owner of chain) {
            const kind = KIND_OF[owner.kind];
            steps.push(svg(CHEVRON, 'icon chain-sep') as unknown as HTMLElement);
            const step = el('span', { class: 'chain-step' }, el('span', { class: 'row-type' }, owner.kind));
            if (kind) {
                step.append(button(owner.name, () => void k8sdockside.open({ kind, namespace, name: owner.name })));
            } else {
                step.append(el('span', {}, owner.name));
            }
            steps.push(step);
        }

        replace(
            host,
            el('div', { class: 'chain' }, ...steps),
            el(
                'p',
                { class: 'note', style: 'margin-top:10px' },
                `Walked from ${where(namespace, pod.metadata.name)} up through metadata.ownerReferences. Each name opens that object.`,
            ),
        );
    } catch (err) {
        fail(host, err);
    }
});
