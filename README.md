# example-plugin

The example [K8s Dockside](https://github.com/k8sdockside/k8sdockside) plugin.
A hello world that keeps going: a tree built from `ownerReferences`, pages that
hand objects to each other, a panel on every Pod, and one of every kind of
bridge call — in about 1500 lines of TypeScript, a fifth of it comments explaining why.

It reads **Pods, Deployments, ReplicaSets, StatefulSets and DaemonSets** and
nothing else, so it works on any cluster with nothing installed in it.

## Install it

**Settings → Plugins → From a repository**, and paste

```
https://github.com/k8sdockside/example-plugin
```

The app clones the repository and reads `plugin.json` and `ui/` as they are.
**Nothing is built on install**, which is why the built `ui/` is committed here
next to the TypeScript it comes from.

## What each page is for

| Page | What it shows | Bridge calls |
| --- | --- | --- |
| **Overview** | Hello world, then what `ready()` knows about where a page is running | `ready`, `summary`, `openView`, `openUrl` |
| **Tree** | The centrepiece. Two trees over the same five kinds | `watch`, `namespaces`, `storage`, `open`, `logs`, `edit`, `openView` |
| **Workload** | One Deployment, and the two ways a plugin changes something | `get`, `list`, `patch`, `actions`, `run`, `open`, `edit` |
| **Owner chain** | A panel in every Pod's detail view | `object`, `get`, `open` |

### The tree, and why there are two of them

**Ownership** is the one worth copying. The bridge reads one kind at a time, so
a tree that spans kinds is assembled on the page: list each kind, index every
object by `metadata.uid`, and join children to parents through the owner
reference with `controller: true`.

```
▾ Deployment  web              3/3 ready ●
  ▾ ReplicaSet  web-7d4f9      3/3 ready ●
      Pod  web-7d4f9-2xk11     Running ●
      Pod  web-7d4f9-mq8vd     CrashLoopBackOff · 7 restarts ●
  ▸ ReplicaSet  web-5b2c1      superseded
```

Nothing in [`src/model/owners.ts`](src/model/owners.ts) is specific to
Deployments — the same 60 lines build a tree for any CRD whose operator sets
owner references, which is most of them.

**Namespace** is the same objects grouped by namespace and then by kind
([`src/model/grouping.ts`](src/model/grouping.ts)). It is here for contrast:
most "show me what is in here" trees are this much simpler kind, and it is
worth seeing both before you choose for your own plugin.

Both build the same `TreeNode[]`, so
[one renderer](src/ui/tree.ts) draws either. When you copy this plugin, that
file is the part you keep unchanged.

### How a page hands an object to another page

Three different things can open the Workload page, and it copes with all three:

1. **The Tree's link button** — puts the object in `storage`, then calls
   `openView('workload')`.
2. **The app**, from a search hit on a Deployment — the manifest gives that
   view a `focus`, so the app puts the object in the page's address after the
   `#` and opens the tab.
3. **A person clicking it in the sidebar**, with nothing selected — the page
   offers a list to pick from.

A page that only handled its own handoff would look broken when the app opened
it. Reading the hash first and falling back to storage is the whole trick.

## Things this plugin learned the hard way

Worth knowing before you write your own.

**A `when` condition compares strings, and a boolean field reads as absent.**
The app evaluates a manifest condition with `unstructured.NestedString`, which
returns `""` for anything that is not a string. So `"field": "spec.paused"`
with `"in": ["true"]` never matches, and with `"notIn": ["true"]` always
matches — quietly, in both directions. Gate on a string field, or on
`status.conditions[Ready]`, which is read specially and gives you the
condition's `status`.

**`phase` is not health.** A Pod in `CrashLoopBackOff` or `ImagePullBackOff` is
still `phase: Running` or `Pending`. [`podState`](src/model/status.ts) prefers
the container's reason, and there is a test for exactly that, because a tree
that trusted `phase` draws a broken workload green.

**DaemonSets count their replicas under different field names.** No
`spec.replicas`; `desiredNumberScheduled` and `numberReady` instead. Passing
the kind into `readiness()` is not ceremony — reading a DaemonSet as a
Deployment silently reports `0/1`.

**An owner may be missing from what you listed.** A Pod whose ReplicaSet was
deleted, or a namespace filter that caught the child but not the parent. Adopt
those as roots; dropping them loses rows without saying so.

**Keep `ui.kinds` to what you actually read.** It is the first thing a careful
user looks at on your plugin's card in Settings. This plugin declares five
kinds and reads five kinds.

## Working on it

```sh
npm install
npm run watch     # rebuilds ui/ on every change under src/
npm test          # the model, which is where the logic is
npm run check     # typecheck + tests + "is ui/ in step with src/"
```

Point the app at your checkout with **Settings → Plugins → Watch another
folder**. A page you change is picked up when you reopen its tab; the manifest
when you press **Reload**.

Run the app's own checks — the same ones CI runs — with:

```sh
go run github.com/k8sdockside/k8sdockside/cmd/plugincheck@main .
```

**Commit `ui/`.** Installing clones the repository, so a change to `src/` whose
`ui/` was not rebuilt never reaches anyone. `npm run check` fails when the two
disagree, and so does CI.

## Layout

```
plugin.json              the manifest -- views, cards, actions, sections
src/
  model/                 no DOM, all the logic, all the tests
    owners.ts            the ownership tree, and ownerChain
    grouping.ts          the namespace tree
    status.ts            readiness, pod state, tones
    tree.ts              the shape both trees are built into
  ui/                    no cluster knowledge, all the DOM
    tree.ts              the renderer both trees share
    dom.ts               the SDK's el() and friends, and why there is no innerHTML
  pages/                 one .html + one .ts per page
  styles/                the app's theme tokens, no colours of its own
ui/                      what the build writes, and what the app serves
```

The split between `model/` and `ui/` is what makes the tests worth having: the
model is plain functions over plain objects, so testing the interesting part
needs no DOM and no cluster.

## Two rules the app enforces

**No network.** `fetch`, XHR and websockets are refused by the page's
Content-Security-Policy. Bundle everything; the icons here are inline SVG for
that reason.

**A classic script, not a module.** The page runs in a sandboxed frame with an
opaque origin, where `type="module"` is a cross-origin load. The build uses
esbuild's `--format=iife`.

Cluster data goes on the page as **text, never HTML** — there is no `innerHTML`
in `src/` except [`svg()`](src/ui/dom.ts), which only ever receives the icon
constants. Building rows with `el()` means an object's name cannot carry markup
into the page.

## Read next

- [Writing a plugin](https://github.com/k8sdockside/k8sdockside/blob/main/docs/writing-plugins.md) — the path from an empty folder to this
- [The plugin reference](https://github.com/k8sdockside/k8sdockside/blob/main/docs/plugins.md) — every manifest field and bridge call
- [`@k8sdockside/plugin-sdk`](https://github.com/k8sdockside/k8sdockside/tree/main/packages/plugin-sdk) — the bridge's types, the `k8sdockside-plugin` build and the DOM helpers; its `k8sdockside.d.ts` is the most precise description of the bridge there is

## License

Apache-2.0. Copy any of it.
