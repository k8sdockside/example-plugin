// Built by scripts/build.mjs from src/ -- edit the TypeScript there, not this file.
"use strict";
(() => {
  // src/ui/dom.ts
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (value === void 0 || value === false) continue;
      if (name === "class") node.className = String(value);
      else if (name === "text") node.textContent = String(value);
      else node.setAttribute(name, String(value));
    }
    for (const child of children) {
      if (child === null || child === void 0 || child === false) continue;
      node.append(child);
    }
    return node;
  }
  function button(label, onClick, attrs = {}) {
    const node = el("button", { type: "button", ...attrs }, label);
    node.addEventListener("click", onClick);
    return node;
  }
  function replace(parent, ...children) {
    parent.replaceChildren();
    for (const child of children) {
      if (child === null || child === void 0 || child === false) continue;
      parent.append(child);
    }
  }
  function byId(id) {
    const node = document.getElementById(id);
    if (!node) throw new Error(`the page has no #${id}`);
    return node;
  }
  function svg(markup, className = "icon") {
    const holder = document.createElement("span");
    holder.innerHTML = markup;
    const node = holder.firstElementChild;
    node.setAttribute("class", className);
    return node;
  }

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
  function where(namespace, name) {
    return namespace ? `${namespace}/${name}` : name;
  }

  // src/model/kube.ts
  function controllerOf(obj) {
    return (obj.metadata.ownerReferences ?? []).find((ref) => ref.controller);
  }

  // src/model/owners.ts
  function ownerChain(start2, resolve) {
    const chain = [];
    const seen = /* @__PURE__ */ new Set([start2.metadata.uid ?? ""]);
    let current = start2;
    while (current) {
      const owner = controllerOf(current);
      if (!owner || seen.has(owner.uid)) break;
      seen.add(owner.uid);
      chain.push(owner);
      current = resolve(owner);
    }
    return chain;
  }

  // src/ui/icons.ts
  var CHEVRON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>';

  // src/pages/owners.ts
  var KIND_OF = {
    Deployment: "deployments",
    ReplicaSet: "replicasets",
    StatefulSet: "statefulsets",
    DaemonSet: "daemonsets",
    Pod: "pods"
  };
  start("page", async (ctx) => {
    const host = byId("chain");
    if (!ctx.object) {
      replace(host, el("p", { class: "empty" }, "This page is a panel; open it from a Pod."));
      return;
    }
    const namespace = ctx.object.namespace;
    try {
      const pod = await k8sdockside.object();
      const resolved = /* @__PURE__ */ new Map();
      let current = pod;
      for (; ; ) {
        const owner = (current.metadata.ownerReferences ?? []).find((r) => r.controller);
        if (!owner) break;
        const kind = KIND_OF[owner.kind];
        if (!kind) break;
        try {
          const parent = await k8sdockside.get({ kind, namespace, name: owner.name });
          resolved.set(owner.uid, parent);
          current = parent;
        } catch {
          break;
        }
      }
      const chain = ownerChain(pod, (ref) => resolved.get(ref.uid));
      if (!chain.length) {
        replace(
          host,
          el("p", { class: "faint" }, "Nothing owns this Pod — it was created directly, not by a controller.")
        );
        return;
      }
      const steps = [
        el("span", { class: "chain-step" }, el("span", { class: "row-type" }, "Pod"), el("span", {}, pod.metadata.name))
      ];
      for (const owner of chain) {
        const kind = KIND_OF[owner.kind];
        steps.push(svg(CHEVRON, "icon chain-sep"));
        const step = el("span", { class: "chain-step" }, el("span", { class: "row-type" }, owner.kind));
        if (kind) {
          step.append(button(owner.name, () => void k8sdockside.open({ kind, namespace, name: owner.name })));
        } else {
          step.append(el("span", {}, owner.name));
        }
        steps.push(step);
      }
      replace(
        host,
        el("div", { class: "chain" }, ...steps),
        el(
          "p",
          { class: "note", style: "margin-top:10px" },
          `Walked from ${where(namespace, pod.metadata.name)} up through metadata.ownerReferences. Each name opens that object.`
        )
      );
    } catch (err) {
      fail(host, err);
    }
  });
})();
