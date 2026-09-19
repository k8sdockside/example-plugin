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
  function stat(label, value, tone = "") {
    return el(
      "div",
      { class: "stat" },
      el("div", { class: `stat-value tone-${tone || "none"}` }, value),
      el("div", { class: "stat-label" }, label)
    );
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

  // src/pages/overview.ts
  start("page", async (ctx) => {
    byId("hello").textContent = `Hello, ${ctx.contextName}.`;
    byId("lead").textContent = "This plugin exists to be read. Everything below is a live call to the bridge, and every page in it is a few dozen lines of TypeScript in src/pages.";
    const summary = await k8sdockside.summary();
    const tiles = [];
    for (const card of summary.cards) {
      tiles.push(stat(card.label, card.error ? "—" : String(card.total), card.error ? "error" : ""));
    }
    tiles.push(stat("Kinds readable", String(ctx.readable.length)));
    tiles.push(stat("May change", ctx.write ? "yes" : "no", ctx.write ? "warn" : ""));
    replace(byId("stats"), ...tiles);
    const blocks = byId("blocks");
    const go = (viewId, label) => button(label, () => void k8sdockside.openView(viewId), { class: "primary" });
    blocks.append(
      section(
        "The pages",
        "Each one is here to show a different part of the bridge.",
        el(
          "div",
          { class: "links" },
          go("tree", "Open the Tree"),
          go("workload", "Open a Workload")
        ),
        el(
          "table",
          {},
          el(
            "tbody",
            {},
            row("Tree", "watch() on five kinds, a tree built from ownerReferences, and the same objects grouped by namespace"),
            row("Workload", "get(), a patch() the user confirms, and the plugin’s own actions through actions() and run()"),
            row("Owner chain", "a panel on every Pod’s detail view — object(), then get() up the chain"),
            row("This page", "ready(), summary(), openView() and open()")
          )
        )
      )
    );
    const requirements = el("table", {}, el("tbody", {}, ...summary.requirements.map(
      (req) => row(
        req.label || req.kind,
        req.error ? req.error : req.served ? "served by this cluster" : "not served",
        req.error ? "warn" : req.served ? "ok" : "error"
      )
    )));
    blocks.append(
      section(
        "What the manifest asks for",
        summary.checked ? summary.installed ? "Everything the manifest requires is here — which for this plugin is only Pods and Deployments, so it is true anywhere." : "Something the manifest requires is missing." : "The cluster could not be asked, which is not the same as finding nothing.",
        requirements
      )
    );
    blocks.append(
      section(
        "What ready() knows",
        "Every page gets this before it draws anything. It is the answer to “where am I, and what may I do here?”",
        facts([
          ["Plugin", `${ctx.plugin?.name ?? ctx.pluginId} ${ctx.plugin?.version ?? ""}`.trim()],
          ["View", ctx.viewId || ctx.sectionId || "(none)"],
          ["Cluster", `${ctx.contextName} (${ctx.contextId})`],
          ["Theme", `${ctx.theme.id || "unnamed"} — a ${ctx.theme.base} one`],
          ["Readable kinds", ctx.readable.join(", ")],
          ["Declared actions", ctx.actions.map((a) => `${a.label} (on ${a.kind})`).join(", ") || "(none)"],
          ["Registries", ctx.registries ? "allowed" : "not asked for"],
          ["Storage", k8sdockside.storage ? "available" : "not on this app version"]
        ])
      )
    );
    const links = ctx.plugin?.links ?? [];
    if (links.length) {
      blocks.append(
        section(
          "Read further",
          "These open in your browser — the page itself has no network, so it asks the app to do it.",
          el(
            "div",
            { class: "links" },
            ...links.map((link) => button(link.label, () => void k8sdockside.openUrl(link.url)))
          )
        )
      );
    }
  });
  function row(name, note, tone = "") {
    return el(
      "tr",
      {},
      el("td", {}, el("strong", {}, name)),
      el("td", { class: `tone-${tone || "none"}` }, note)
    );
  }
  function facts(pairs) {
    const list = el("dl", { class: "facts" });
    for (const [term, value] of pairs) {
      list.append(el("dt", {}, term), el("dd", { class: "mono" }, value || "—"));
    }
    return list;
  }
})();
