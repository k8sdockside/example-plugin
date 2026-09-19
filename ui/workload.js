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
  function section(title, note, ...children) {
    return el(
      "section",
      { class: "block" },
      el("h2", {}, title),
      note ? el("p", { class: "note" }, note) : null,
      ...children.filter((c) => c !== null)
    );
  }
  function where(namespace, name) {
    return namespace ? `${namespace}/${name}` : name;
  }
  function since(timestamp, now = Date.now()) {
    if (!timestamp) return "—";
    const then = Date.parse(timestamp);
    if (Number.isNaN(then)) return "—";
    const seconds = Math.max(0, Math.round((now - then) / 1e3));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
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

  // src/model/kube.ts
  function controllerOf(obj) {
    return (obj.metadata.ownerReferences ?? []).find((ref) => ref.controller);
  }

  // src/pages/workload.ts
  var HANDOFF_KEY = "workload";
  start("page", async (ctx) => {
    const body = byId("body");
    const target = await pick();
    if (!target) {
      await offerAChoice();
      return;
    }
    await draw(target);
    async function pick() {
      const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
      const name = hash.get("name");
      if (name) return { namespace: hash.get("namespace") ?? "", name };
      try {
        const saved = await k8sdockside.storage?.get(HANDOFF_KEY);
        if (saved?.name) return { namespace: saved.namespace ?? "", name: saved.name };
      } catch {
      }
      return null;
    }
    async function offerAChoice() {
      byId("lead").textContent = "Nothing was handed to this page. Open it from the Tree, from a search hit on a Deployment, or pick one here.";
      const deployments = await k8sdockside.list({ kind: "deployments" });
      if (!deployments.length) {
        replace(body, el("p", { class: "empty" }, "This cluster has no Deployments."));
        return;
      }
      replace(
        body,
        section(
          "Deployments",
          "",
          el(
            "div",
            { class: "links" },
            ...deployments.slice(0, 40).map(
              (d) => button(
                where(d.metadata.namespace ?? "", d.metadata.name),
                () => void draw({ namespace: d.metadata.namespace ?? "", name: d.metadata.name })
              )
            )
          )
        )
      );
    }
    async function draw(target2) {
      try {
        const deployment = await k8sdockside.get({ kind: "deployments", ...target2 });
        const ready = readiness(deployment, "deployments");
        byId("title").textContent = deployment.metadata.name;
        byId("lead").textContent = `${where(target2.namespace, target2.name)} on ${ctx.contextName} — ${readinessText(ready)}${deployment.spec?.paused ? ", rollout paused" : ""}.`;
        replace(body);
        body.append(await scaling(deployment, ready.desired));
        body.append(await declaredActions(target2));
        body.append(await pods(deployment, target2));
        body.append(
          section(
            "Elsewhere in the app",
            "A plugin page is not a dead end: it can hand the user back to the parts of the app that already do a job well.",
            el(
              "div",
              { class: "links" },
              button("Open in the details panel", () => void k8sdockside.open({ kind: "deployments", ...target2 })),
              button("Edit the YAML", () => void k8sdockside.edit({ kind: "deployments", ...target2 })),
              button("Back to the tree", () => void k8sdockside.openView("tree"))
            )
          )
        );
      } catch (err) {
        fail(body, err);
      }
    }
    async function scaling(deployment, current) {
      const input = el("input", { type: "number", min: 0, max: 100, value: String(current) });
      const apply = button("Scale", async () => {
        const want = Number(input.value);
        if (!Number.isInteger(want) || want < 0) return;
        apply.disabled = true;
        try {
          await k8sdockside.patch({
            kind: "deployments",
            namespace: deployment.metadata.namespace ?? "",
            name: deployment.metadata.name,
            patch: { spec: { replicas: want } }
          });
          await draw({ namespace: deployment.metadata.namespace ?? "", name: deployment.metadata.name });
        } catch (err) {
          byId("lead").textContent = err instanceof Error ? err.message : String(err);
        } finally {
          apply.disabled = false;
        }
      }, { class: "primary" });
      return section(
        "Change it",
        ctx.write ? "patch() sends a JSON merge patch. The app shows you the change and applies it only when you press Apply — the page never writes to the cluster itself." : 'This plugin does not declare "ui": { "write": true }, so patch() would be refused.',
        el("div", { class: "bar" }, el("label", { for: "replicas" }, "Replicas"), input, apply)
      );
    }
    async function declaredActions(target2) {
      let offered = [];
      try {
        offered = await k8sdockside.actions({ kind: "deployments", ...target2 });
      } catch {
        offered = [];
      }
      const buttons = offered.map(
        (action) => button(action.label, async () => {
          try {
            await k8sdockside.run(action.id, target2);
            await draw(target2);
          } catch (err) {
            byId("lead").textContent = err instanceof Error ? err.message : String(err);
          }
        }, action.tone === "danger" ? { class: "primary" } : {})
      );
      return section(
        "Actions from the manifest",
        offered.length ? "These are declared in plugin.json, not written here: the manifest says what to patch, and run() asks the app to do it. actions() returns only the ones offered right now, so the page draws only those buttons." : "This plugin declares actions on Deployments, but the app is offering none on this one.",
        buttons.length ? el("div", { class: "links" }, ...buttons) : el("p", { class: "faint" }, "Nothing offered.")
      );
    }
    async function pods(deployment, target2) {
      const uid = deployment.metadata.uid;
      const sets = await k8sdockside.list({ kind: "replicasets", namespace: target2.namespace });
      const mine = new Set(
        sets.filter((rs) => controllerOf(rs)?.uid === uid).map((rs) => rs.metadata.uid ?? "")
      );
      const all = await k8sdockside.list({ kind: "pods", namespace: target2.namespace });
      const ours = all.filter((pod) => mine.has(controllerOf(pod)?.uid ?? ""));
      if (!ours.length) return section("Pods", "None right now.");
      const rows = ours.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)).map((pod) => {
        const open = button("logs", () => void k8sdockside.logs({ kind: "pods", namespace: pod.metadata.namespace ?? "", name: pod.metadata.name }));
        return el(
          "tr",
          {},
          el("td", {}, pod.metadata.name),
          el("td", { class: `tone-${podTone(pod)}` }, podState(pod)),
          el("td", {}, String(restarts(pod))),
          el("td", {}, since(pod.metadata.creationTimestamp)),
          el("td", {}, open)
        );
      });
      return section(
        "Pods",
        "Found by walking ownerReferences down: this Deployment’s ReplicaSets, and their Pods. A label selector would also catch other Deployments’ Pods.",
        el(
          "table",
          {},
          el("thead", {}, el("tr", {}, ...["Pod", "State", "Restarts", "Age", ""].map((h) => el("th", {}, h)))),
          el("tbody", {}, ...rows)
        )
      );
    }
  });
})();
