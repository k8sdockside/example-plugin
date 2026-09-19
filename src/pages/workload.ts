// One Deployment, and the two ways a plugin changes something.
//
// How this page is reached is the point of it. Three different things can open
// it, and it must cope with all three:
//
//  1. The Tree page's link button, which puts the object in `storage` and
//     calls `openView('workload')`.
//  2. The app itself, from a search hit on a Deployment, because the manifest
//     gives this view a `focus` -- the app puts the object in the page's
//     address after the # and opens the tab.
//  3. A person clicking the view in the sidebar, with nothing selected at all.
//
// So it reads the hash first (the app's way), falls back to storage (our way),
// and otherwise offers a list to pick from. A page that only handled its own
// handoff would look broken when the app opened it.
//
// Then the two kinds of write:
//
//  - `patch()` -- a change the page composes at runtime, here the replica
//    count. The app shows the patch, the object and the cluster, and applies
//    it only if the user presses Apply.
//  - `run()` -- one of the actions the manifest declares, which the app also
//    confirms. `actions()` says which are offered right now, so the page draws
//    only the buttons that apply.

import { byId, button, el, replace } from '../ui/dom.js';
import { start, fail, section, where, since } from '../ui/page.js';
import { readiness, readinessText, podState, podTone, restarts } from '../model/status.js';
import { controllerOf, type Pod, type Workload } from '../model/kube.js';

const HANDOFF_KEY = 'workload';

interface Target {
    namespace: string;
    name: string;
}

start('page', async (ctx) => {
    const body = byId('body');

    const target = await pick();
    if (!target) {
        await offerAChoice();
        return;
    }
    await draw(target);

    /** Where the app or the Tree page said to go, in that order. */
    async function pick(): Promise<Target | null> {
        // 1. The app's way: the manifest's `focus` puts the object in the hash.
        const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
        const name = hash.get('name');
        if (name) return { namespace: hash.get('namespace') ?? '', name };

        // 2. Our way: the Tree page left it in storage.
        try {
            const saved = await k8sdockside.storage?.get<{ namespace: string; name: string }>(HANDOFF_KEY);
            if (saved?.name) return { namespace: saved.namespace ?? '', name: saved.name };
        } catch {
            // Storage is optional; falling through to the chooser is correct.
        }
        return null;
    }

    /** Nothing was handed over, so let the user choose. */
    async function offerAChoice(): Promise<void> {
        byId('lead').textContent =
            'Nothing was handed to this page. Open it from the Tree, from a search hit on a Deployment, or pick one here.';
        const deployments = await k8sdockside.list<Workload>({ kind: 'deployments' });
        if (!deployments.length) {
            replace(body, el('p', { class: 'empty' }, 'This cluster has no Deployments.'));
            return;
        }
        replace(
            body,
            section(
                'Deployments',
                '',
                el(
                    'div',
                    { class: 'links' },
                    ...deployments.slice(0, 40).map((d) =>
                        button(where(d.metadata.namespace ?? '', d.metadata.name), () =>
                            void draw({ namespace: d.metadata.namespace ?? '', name: d.metadata.name }),
                        ),
                    ),
                ),
            ),
        );
    }

    async function draw(target: Target): Promise<void> {
        try {
            const deployment = await k8sdockside.get<Workload>({ kind: 'deployments', ...target });
            const ready = readiness(deployment, 'deployments');

            byId('title').textContent = deployment.metadata.name;
            byId('lead').textContent = `${where(target.namespace, target.name)} on ${ctx.contextName} — ${readinessText(ready)}${
                deployment.spec?.paused ? ', rollout paused' : ''
            }.`;

            replace(body);
            body.append(await scaling(deployment, ready.desired));
            body.append(await declaredActions(target));
            body.append(await pods(deployment, target));
            body.append(
                section(
                    'Elsewhere in the app',
                    'A plugin page is not a dead end: it can hand the user back to the parts of the app that already do a job well.',
                    el(
                        'div',
                        { class: 'links' },
                        button('Open in the details panel', () => void k8sdockside.open({ kind: 'deployments', ...target })),
                        button('Edit the YAML', () => void k8sdockside.edit({ kind: 'deployments', ...target })),
                        button('Back to the tree', () => void k8sdockside.openView('tree')),
                    ),
                ),
            );
        } catch (err) {
            fail(body, err);
        }
    }

    // ----- patch(): a change the page composes --------------------------------

    async function scaling(deployment: Workload, current: number): Promise<HTMLElement> {
        const input = el('input', { type: 'number', min: 0, max: 100, value: String(current) }) as HTMLInputElement;
        const apply = button('Scale', async () => {
            const want = Number(input.value);
            if (!Number.isInteger(want) || want < 0) return;
            apply.disabled = true;
            try {
                // A JSON merge patch. The app shows it to the user with the
                // object and the cluster, and applies it only on Apply.
                await k8sdockside.patch({
                    kind: 'deployments',
                    namespace: deployment.metadata.namespace ?? '',
                    name: deployment.metadata.name,
                    patch: { spec: { replicas: want } },
                });
                await draw({ namespace: deployment.metadata.namespace ?? '', name: deployment.metadata.name });
            } catch (err) {
                // Rejecting is the normal path when the user says no, so this
                // is a note rather than a failure.
                byId('lead').textContent = err instanceof Error ? err.message : String(err);
            } finally {
                apply.disabled = false;
            }
        }, { class: 'primary' });

        return section(
            'Change it',
            ctx.write
                ? 'patch() sends a JSON merge patch. The app shows you the change and applies it only when you press Apply — the page never writes to the cluster itself.'
                : 'This plugin does not declare "ui": { "write": true }, so patch() would be refused.',
            el('div', { class: 'bar' }, el('label', { for: 'replicas' }, 'Replicas'), input, apply),
        );
    }

    // ----- run(): the actions the manifest declares ----------------------------

    async function declaredActions(target: Target): Promise<HTMLElement> {
        let offered: K8sDockside.OfferedAction[] = [];
        try {
            // Only the ones offered on this object right now -- the app has
            // already applied each action's `when`.
            offered = await k8sdockside.actions({ kind: 'deployments', ...target });
        } catch {
            offered = [];
        }
        const buttons = offered.map((action) =>
            button(action.label, async () => {
                try {
                    await k8sdockside.run(action.id, target);
                    await draw(target);
                } catch (err) {
                    byId('lead').textContent = err instanceof Error ? err.message : String(err);
                }
            }, action.tone === 'danger' ? { class: 'primary' } : {}),
        );

        return section(
            'Actions from the manifest',
            offered.length
                ? 'These are declared in plugin.json, not written here: the manifest says what to patch, and run() asks the app to do it. actions() returns only the ones offered right now, so the page draws only those buttons.'
                : 'This plugin declares actions on Deployments, but the app is offering none on this one.',
            buttons.length ? el('div', { class: 'links' }, ...buttons) : el('p', { class: 'faint' }, 'Nothing offered.'),
        );
    }

    // ----- the pods under it ----------------------------------------------------

    async function pods(deployment: Workload, target: Target): Promise<HTMLElement> {
        // The Pods of a Deployment are its ReplicaSets' Pods -- two hops down
        // the owner chain, which is why this is a filter over lists rather than
        // a label selector. A selector would catch Pods of other Deployments
        // that happen to share labels.
        const uid = deployment.metadata.uid;
        const sets = await k8sdockside.list({ kind: 'replicasets', namespace: target.namespace });
        const mine = new Set(
            sets.filter((rs) => controllerOf(rs)?.uid === uid).map((rs) => rs.metadata.uid ?? ''),
        );
        const all = await k8sdockside.list<Pod>({ kind: 'pods', namespace: target.namespace });
        const ours = all.filter((pod) => mine.has(controllerOf(pod)?.uid ?? ''));

        if (!ours.length) return section('Pods', 'None right now.');

        const rows = ours
            .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name))
            .map((pod) => {
                const open = button('logs', () => void k8sdockside.logs({ kind: 'pods', namespace: pod.metadata.namespace ?? '', name: pod.metadata.name }));
                return el(
                    'tr',
                    {},
                    el('td', {}, pod.metadata.name),
                    el('td', { class: `tone-${podTone(pod)}` }, podState(pod)),
                    el('td', {}, String(restarts(pod))),
                    el('td', {}, since(pod.metadata.creationTimestamp)),
                    el('td', {}, open),
                );
            });

        return section(
            'Pods',
            'Found by walking ownerReferences down: this Deployment’s ReplicaSets, and their Pods. A label selector would also catch other Deployments’ Pods.',
            el(
                'table',
                {},
                el('thead', {}, el('tr', {}, ...['Pod', 'State', 'Restarts', 'Age', ''].map((h) => el('th', {}, h)))),
                el('tbody', {}, ...rows),
            ),
        );
    }
});
