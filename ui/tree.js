// Built by scripts/build.mjs from src/ -- edit the TypeScript there, not this file.
"use strict";
(() => {
  // src/ui/dom.ts
  function el(tag, attrs = {}, ...children) {
    const node2 = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (value === void 0 || value === false) continue;
      if (name === "class") node2.className = String(value);
      else if (name === "text") node2.textContent = String(value);
      else node2.setAttribute(name, String(value));
    }
    for (const child of children) {
      if (child === null || child === void 0 || child === false) continue;
      node2.append(child);
    }
    return node2;
  }
  function replace(parent, ...children) {
    parent.replaceChildren();
    for (const child of children) {
      if (child === null || child === void 0 || child === false) continue;
      parent.append(child);
    }
  }
  function byId(id) {
    const node2 = document.getElementById(id);
    if (!node2) throw new Error(`the page has no #${id}`);
    return node2;
  }
  function svg(markup, className = "icon") {
    const holder = document.createElement("span");
    holder.innerHTML = markup;
    const node2 = holder.firstElementChild;
    node2.setAttribute("class", className);
    return node2;
  }
  function dot(tone) {
    return el("span", { class: `dot dot-${tone || "none"}`, "aria-hidden": "true" });
  }

  // src/ui/icons.ts
  var CHEVRON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>';
  var BOX = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M8 1.7l5.5 3v6.6L8 14.3l-5.5-3V4.7z"/><path d="M2.5 4.7L8 7.7l5.5-3M8 7.7v6.6"/></svg>';
  var LAYERS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M8 1.8l6 3-6 3-6-3z"/><path d="M2 8l6 3 6-3"/><path d="M2 11.2l6 3 6-3"/></svg>';
  var CIRCLE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="5.2"/></svg>';
  var FOLDER = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M1.8 4.2h4l1.4 1.7h7v6.2a.9.9 0 01-.9.9H2.7a.9.9 0 01-.9-.9z"/></svg>';
  var TERMINAL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5l3 3.5-3 3.5M8 11.5h5"/></svg>';
  var EDIT = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M11.2 2.3l2.5 2.5-8 8L2 13.9l1.1-3.7z"/></svg>';
  var LINK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6.6 9.4a2.8 2.8 0 004 0l2-2a2.8 2.8 0 10-4-4l-.8.8"/><path d="M9.4 6.6a2.8 2.8 0 00-4 0l-2 2a2.8 2.8 0 104 4l.8-.8"/></svg>';
  function forType(typeLabel) {
    switch (typeLabel) {
      case "Namespace":
        return FOLDER;
      case "Kind":
        return LAYERS;
      case "Pod":
        return CIRCLE;
      case "ReplicaSet":
        return LAYERS;
      default:
        return BOX;
    }
  }

  // src/ui/tree.ts
  var Tree = class {
    constructor(host, options = {}) {
      this.host = host;
      this.options = options;
    }
    host;
    options;
    open = /* @__PURE__ */ new Set();
    nodes = [];
    selected = "";
    /** Replaces the data and redraws, keeping which rows were open. */
    render(nodes) {
      this.nodes = nodes;
      this.draw();
    }
    /** Opens every row that has children. */
    expandAll() {
      const add = (list) => {
        for (const node2 of list) {
          if (node2.children.length) this.open.add(node2.id);
          add(node2.children);
        }
      };
      add(this.nodes);
      this.draw();
    }
    collapseAll() {
      this.open.clear();
      this.draw();
    }
    /** Opens the rows down to a node, so a linked-to object is on screen. */
    reveal(id) {
      const path = [];
      const find = (list, trail) => {
        for (const node2 of list) {
          if (node2.id === id) {
            path.push(...trail);
            return true;
          }
          if (find(node2.children, [...trail, node2.id])) return true;
        }
        return false;
      };
      if (!find(this.nodes, [])) return;
      for (const step of path) this.open.add(step);
      this.selected = id;
      this.draw();
    }
    /** Which rows are open, to hand to `storage` and put back later. */
    openRows() {
      return [...this.open];
    }
    restoreOpenRows(ids) {
      this.open = new Set(ids);
      this.draw();
    }
    draw() {
      if (!this.nodes.length) {
        replace(this.host, el("p", { class: "empty" }, this.options.empty ?? "Nothing here."));
        return;
      }
      const rows = [];
      const add = (list, depth) => {
        for (const node2 of list) {
          rows.push(this.row(node2, depth));
          if (this.open.has(node2.id)) add(node2.children, depth + 1);
        }
      };
      add(this.nodes, 0);
      replace(this.host, ...rows);
    }
    row(node2, depth) {
      const hasKids = node2.children.length > 0;
      const isOpen = this.open.has(node2.id);
      const twisty = el("button", {
        type: "button",
        class: `twisty${hasKids ? "" : " twisty-leaf"}${isOpen ? " twisty-open" : ""}`,
        "aria-label": hasKids ? isOpen ? "Collapse" : "Expand" : "",
        tabindex: hasKids ? 0 : -1
      });
      if (hasKids) {
        twisty.append(svg(CHEVRON));
        twisty.addEventListener("click", (event) => {
          event.stopPropagation();
          if (isOpen) this.open.delete(node2.id);
          else this.open.add(node2.id);
          this.draw();
        });
      }
      const label = el(
        "button",
        { type: "button", class: "row-label", title: `${node2.typeLabel} ${node2.label}` },
        svg(forType(node2.typeLabel), "icon type-icon"),
        el("span", { class: "row-type" }, node2.typeLabel),
        el("span", { class: "row-name" }, node2.label)
      );
      label.addEventListener("click", () => {
        this.selected = node2.id;
        this.draw();
        this.options.onSelect?.(node2);
      });
      const right = el(
        "span",
        { class: "row-right" },
        node2.detail ? el("span", { class: `row-detail tone-${node2.tone || "none"}` }, node2.detail) : null,
        node2.tone ? dot(node2.tone) : null
      );
      for (const action of this.options.rowActions?.(node2) ?? []) right.append(action);
      const row = el("div", {
        class: `row${this.selected === node2.id ? " row-selected" : ""}`,
        style: `--depth:${depth}`
      }, twisty, label, right);
      return row;
    }
  };

  // src/ui/page.ts
  function fail(host, err) {
    const message = err instanceof Error ? err.message : String(err);
    replace(
      host,
      el("div", { class: "failure" }, el("strong", {}, "That did not work. "), el("span", {}, message))
    );
  }
  function start(hostId, body) {
    const run = async () => {
      const host = document.getElementById(hostId);
      try {
        const ctx = await k8sdockside.ready();
        await body(ctx);
      } catch (err) {
        if (host) fail(host, err);
      }
    };
    void run();
  }

  // src/model/kube.ts
  function controllerOf(obj) {
    return (obj.metadata.ownerReferences ?? []).find((ref) => ref.controller);
  }

  // src/model/status.ts
  function readiness(obj, kind) {
    if (kind === "daemonsets") {
      return {
        ready: obj.status?.numberReady ?? 0,
        desired: obj.status?.desiredNumberScheduled ?? 0
      };
    }
    return {
      ready: obj.status?.readyReplicas ?? 0,
      // A Deployment with no spec.replicas defaults to one, not to none.
      desired: obj.spec?.replicas ?? 1
    };
  }
  function replicaSetReadiness(rs) {
    return { ready: rs.status?.readyReplicas ?? 0, desired: rs.spec?.replicas ?? 0 };
  }
  function readinessTone({ ready, desired }) {
    if (desired === 0) return "";
    if (ready === 0) return "error";
    return ready >= desired ? "ok" : "warn";
  }
  function podState(pod) {
    const statuses = pod.status?.containerStatuses ?? [];
    for (const status of statuses) {
      for (const state of Object.values(status.state ?? {})) {
        const reason = state?.reason;
        if (reason && reason !== "Completed" && reason !== "ContainerCreating") return reason;
      }
    }
    if (pod.metadata.deletionTimestamp) return "Terminating";
    return pod.status?.phase ?? "Unknown";
  }
  function podTone(pod) {
    const state = podState(pod);
    if (state === "Succeeded" || state === "Completed") return "";
    if (state === "Running" && podReady(pod)) return "ok";
    if (state === "Running" || state === "Pending" || state === "ContainerCreating") return "warn";
    if (state === "Terminating") return "warn";
    return "error";
  }
  function podReady(pod) {
    return (pod.status?.conditions ?? []).some((c) => c.type === "Ready" && c.status === "True");
  }
  function readinessText({ ready, desired }) {
    return `${ready}/${desired} ready`;
  }
  function restarts(pod) {
    return (pod.status?.containerStatuses ?? []).reduce((total, c) => total + (c.restartCount ?? 0), 0);
  }

  // src/model/owners.ts
  var TYPE_LABEL = {
    deployments: "Deployment",
    statefulsets: "StatefulSet",
    daemonsets: "DaemonSet",
    replicasets: "ReplicaSet",
    pods: "Pod"
  };
  function ownerTree(lists) {
    const byUid = /* @__PURE__ */ new Map();
    const add = (kind, objects) => {
      for (const obj of objects) {
        const uid = obj.metadata.uid;
        if (uid) byUid.set(uid, { kind, obj });
      }
    };
    add("deployments", lists.deployments);
    add("statefulsets", lists.statefulsets);
    add("daemonsets", lists.daemonsets);
    add("replicasets", lists.replicasets);
    add("pods", lists.pods);
    const children = /* @__PURE__ */ new Map();
    const roots = [];
    for (const entry of byUid.values()) {
      const owner = controllerOf(entry.obj);
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
  var KIND_ORDER = ["deployments", "statefulsets", "daemonsets", "replicasets", "pods"];
  function byKindThenName(a, b) {
    const order = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    if (order !== 0) return order;
    return a.obj.metadata.name.localeCompare(b.obj.metadata.name);
  }
  function byAge(a, b) {
    if (a.kind === "replicasets" && b.kind === "replicasets") {
      const at = a.obj.metadata.creationTimestamp ?? "";
      const bt = b.obj.metadata.creationTimestamp ?? "";
      if (at !== bt) return bt.localeCompare(at);
    }
    return byKindThenName(a, b);
  }
  function node(entry, children) {
    const { kind, obj } = entry;
    const uid = obj.metadata.uid ?? `${kind}/${obj.metadata.namespace}/${obj.metadata.name}`;
    const kids = (children.get(uid) ?? []).sort(byAge).map((child) => node(child, children));
    return {
      id: uid,
      label: obj.metadata.name,
      typeLabel: TYPE_LABEL[kind] ?? kind,
      ...describe(kind, obj),
      object: { kind, namespace: obj.metadata.namespace ?? "", name: obj.metadata.name },
      children: kids
    };
  }
  function describe(kind, obj) {
    if (kind === "pods") {
      const pod = obj;
      const restarted = restarts(pod);
      const state = podState(pod);
      return {
        detail: restarted > 0 ? `${state} · ${restarted} restarts` : state,
        tone: podTone(pod)
      };
    }
    if (kind === "replicasets") {
      const rs = replicaSetReadiness(obj);
      if (rs.desired === 0) return { detail: "superseded", tone: "" };
      return { detail: readinessText(rs), tone: readinessTone(rs) };
    }
    const ready = readiness(obj, kind);
    const paused = obj.spec?.paused === true;
    return {
      detail: paused ? `${readinessText(ready)} · paused` : readinessText(ready),
      tone: paused ? "info" : readinessTone(ready)
    };
  }

  // src/model/grouping.ts
  function namespaceTree(groups) {
    const namespaces = /* @__PURE__ */ new Set();
    for (const group of groups) {
      for (const obj of group.objects) namespaces.add(obj.metadata.namespace ?? "");
    }
    const out = [];
    for (const ns of [...namespaces].sort(clusterScopedLast)) {
      const children = [];
      let total = 0;
      for (const group of groups) {
        const mine = group.objects.filter((obj) => (obj.metadata.namespace ?? "") === ns).sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
        if (!mine.length) continue;
        total += mine.length;
        children.push({
          id: `${ns}/${group.kind}`,
          label: group.typeLabel,
          typeLabel: "Kind",
          detail: String(mine.length),
          tone: "",
          children: mine.map((obj) => ({
            id: obj.metadata.uid ?? `${ns}/${group.kind}/${obj.metadata.name}`,
            label: obj.metadata.name,
            typeLabel: group.typeLabel,
            ...group.describe?.(obj) ?? { detail: "", tone: "" },
            object: { kind: group.kind, namespace: ns, name: obj.metadata.name },
            children: []
          }))
        });
      }
      out.push({
        id: `ns/${ns}`,
        label: ns || "cluster-scoped",
        typeLabel: "Namespace",
        detail: `${total} objects`,
        tone: "",
        // A namespace row is a real object the app can open -- unless it is
        // the bucket standing in for "no namespace at all".
        ...ns ? { object: { kind: "namespaces", namespace: "", name: ns } } : {},
        children
      });
    }
    return out;
  }
  function clusterScopedLast(a, b) {
    if (a === "") return 1;
    if (b === "") return -1;
    return a.localeCompare(b);
  }

  // src/model/tree.ts
  function walk(nodes, visit, depth = 0) {
    for (const node2 of nodes) {
      visit(node2, depth);
      walk(node2.children, visit, depth + 1);
    }
  }
  function count(nodes) {
    let n = 0;
    walk(nodes, () => n++);
    return n;
  }
  function filter(nodes, needle) {
    const want = needle.trim().toLowerCase();
    if (!want) return nodes;
    const keep = (node2) => {
      if (node2.label.toLowerCase().includes(want)) return node2;
      const children = node2.children.map(keep).filter((n) => n !== null);
      return children.length ? { ...node2, children } : null;
    };
    return nodes.map(keep).filter((n) => n !== null);
  }

  // src/pages/tree.ts
  var KINDS = ["deployments", "statefulsets", "daemonsets", "replicasets", "pods"];
  var HANDOFF_KEY = "workload";
  var NAMESPACE_KEY = "tree.namespace";
  var OPEN_ROWS_KEY = "tree.open";
  start("page", async (ctx) => {
    const host = byId("tree");
    const lists = { deployments: [], statefulsets: [], daemonsets: [], replicasets: [], pods: [] };
    let tab = "ownership";
    let namespace = "";
    let needle = "";
    const arrived = /* @__PURE__ */ new Set();
    const tree = new Tree(host, {
      empty: "No workloads here.",
      onSelect: (node2) => {
        if (!node2.object) return;
        void k8sdockside.open(node2.object);
      },
      rowActions: (node2) => rowActions(node2)
    });
    function iconButton(markup, title, onClick) {
      const node2 = el("button", { type: "button", class: "row-action", title, "aria-label": title });
      node2.append(svg(markup));
      node2.addEventListener("click", (event) => {
        event.stopPropagation();
        onClick();
      });
      return node2;
    }
    function rowActions(node2) {
      const object = node2.object;
      if (!object) return [];
      const actions = [];
      if (object.kind === "pods") {
        actions.push(iconButton(TERMINAL, "Open logs", () => void k8sdockside.logs(object)));
      }
      if (object.kind === "deployments") {
        actions.push(
          iconButton(LINK, "Open in the Workload page", async () => {
            try {
              await k8sdockside.storage?.set(HANDOFF_KEY, object);
              await k8sdockside.openView("workload");
            } catch (err) {
              fail(byId("page"), err);
            }
          })
        );
      }
      actions.push(iconButton(EDIT, "Edit YAML", () => void k8sdockside.edit(object)));
      return actions;
    }
    function build() {
      if (tab === "ownership") return ownerTree(lists);
      return namespaceTree([
        { kind: "deployments", typeLabel: "Deployment", objects: lists.deployments, describe: workload("deployments") },
        { kind: "statefulsets", typeLabel: "StatefulSet", objects: lists.statefulsets, describe: workload("statefulsets") },
        { kind: "daemonsets", typeLabel: "DaemonSet", objects: lists.daemonsets, describe: workload("daemonsets") },
        { kind: "replicasets", typeLabel: "ReplicaSet", objects: lists.replicasets, describe: replicaSet },
        { kind: "pods", typeLabel: "Pod", objects: lists.pods, describe: (obj) => ({ detail: podState(obj), tone: podTone(obj) }) }
      ]);
    }
    const workload = (kind) => (obj) => {
      const ready = readiness(obj, kind);
      return { detail: readinessText(ready), tone: readinessTone(ready) };
    };
    const replicaSet = (obj) => {
      const rs = obj;
      const desired = rs.spec?.replicas ?? 0;
      if (desired === 0) return { detail: "superseded", tone: "" };
      const ready = { ready: rs.status?.readyReplicas ?? 0, desired };
      return { detail: readinessText(ready), tone: readinessTone(ready) };
    };
    function redraw() {
      if (arrived.size < KINDS.length) return;
      const all = build();
      const shown = filter(all, needle);
      tree.render(shown);
      const total = count(all);
      const visible = count(shown);
      byId("summary").textContent = needle ? `${visible} of ${total} rows` : `${total} rows`;
      void remember();
    }
    async function remember() {
      try {
        await k8sdockside.storage?.set(OPEN_ROWS_KEY, tree.openRows());
      } catch {
      }
    }
    function drawTabs() {
      const make = (id, label, note) => {
        const node2 = el("button", { type: "button", class: "tab", "aria-selected": String(tab === id), title: note }, label);
        node2.addEventListener("click", () => {
          tab = id;
          drawTabs();
          redraw();
        });
        return node2;
      };
      replace(
        byId("tabs"),
        make("ownership", "Ownership", "Built from metadata.ownerReferences: Deployment, its ReplicaSets, their Pods"),
        make("namespace", "Namespace", "The same objects, grouped by namespace and then by kind")
      );
    }
    const search = byId("search");
    search.addEventListener("input", () => {
      needle = search.value;
      redraw();
    });
    byId("expand").addEventListener("click", () => {
      tree.expandAll();
      void remember();
    });
    byId("collapse").addEventListener("click", () => {
      tree.collapseAll();
      void remember();
    });
    const picker = byId("namespace");
    picker.addEventListener("change", () => {
      namespace = picker.value;
      void k8sdockside.storage?.set(NAMESPACE_KEY, namespace).catch(() => {
      });
      restart();
    });
    let stops = [];
    function restart() {
      for (const stop of stops) stop();
      stops = [];
      arrived.clear();
      for (const kind of KINDS) lists[kind] = [];
      replace(byId("tree"), el("p", { class: "loading" }, "Reading the cluster…"));
      for (const kind of KINDS) {
        const stop = k8sdockside.watch(
          { kind, namespace, interval: 5e3 },
          (items) => {
            lists[kind] = items;
            arrived.add(kind);
            redraw();
          },
          (err) => {
            arrived.add(kind);
            byId("footnote").textContent = `${kind} could not be read: ${err.message}`;
            redraw();
          }
        );
        stops.push(stop);
      }
    }
    drawTabs();
    try {
      const names = await k8sdockside.namespaces();
      for (const name of names) picker.append(el("option", { value: name }, name));
    } catch {
    }
    const saved = await k8sdockside.storage?.get(NAMESPACE_KEY).catch(() => null);
    if (saved && [...picker.options].some((o) => o.value === saved)) {
      namespace = saved;
      picker.value = saved;
    }
    byId("footnote").textContent = `Polling every 5s on ${ctx.contextName}. Rows open the object in the app; the buttons are logs, the Workload page, and the YAML editor.`;
    restart();
    const openRows = await k8sdockside.storage?.get(OPEN_ROWS_KEY).catch(() => null);
    if (Array.isArray(openRows)) tree.restoreOpenRows(openRows);
  });
})();
