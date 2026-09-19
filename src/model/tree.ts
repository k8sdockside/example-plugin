// The shape both trees are built into, so one renderer can draw either.
//
// A node is deliberately flat: everything the renderer needs to draw a row is
// on the node itself, and `children` is the only structure. Keeping the view
// model separate from the Kubernetes objects is what lets the same
// src/ui/tree.ts draw an ownership tree and a namespace tree without knowing
// anything about either.

export type Tone = 'ok' | 'warn' | 'error' | 'info' | '';

export interface TreeNode {
    /**
     * Stable across rebuilds -- the tree is rebuilt from scratch on every poll
     * of `watch`, and this is what carries which rows the user had open. A
     * Kubernetes uid where there is one; a synthetic path where there is not.
     */
    id: string;
    label: string;
    /** The dim text on the right of the row. */
    detail: string;
    tone: Tone;
    /** A word for what this row is: "Deployment", "Pod", "Namespace". */
    typeLabel: string;
    /** Set when the row is a real object the app can open. */
    object?: { kind: K8sDockside.Kind; namespace: string; name: string };
    children: TreeNode[];
}

/** Depth-first walk, parents before children. */
export function walk(nodes: TreeNode[], visit: (node: TreeNode, depth: number) => void, depth = 0): void {
    for (const node of nodes) {
        visit(node, depth);
        walk(node.children, visit, depth + 1);
    }
}

/** Every node's id, for "expand all". */
export function allIds(nodes: TreeNode[]): string[] {
    const ids: string[] = [];
    walk(nodes, (node) => ids.push(node.id));
    return ids;
}

/** How many nodes the tree holds, all depths. */
export function count(nodes: TreeNode[]): number {
    let n = 0;
    walk(nodes, () => n++);
    return n;
}

/**
 * Keeps only the branches with a node whose label matches, and every ancestor
 * of one. A parent that matches keeps all its children, so filtering to a
 * Deployment shows the Pods under it.
 */
export function filter(nodes: TreeNode[], needle: string): TreeNode[] {
    const want = needle.trim().toLowerCase();
    if (!want) return nodes;
    const keep = (node: TreeNode): TreeNode | null => {
        if (node.label.toLowerCase().includes(want)) return node;
        const children = node.children.map(keep).filter((n): n is TreeNode => n !== null);
        return children.length ? { ...node, children } : null;
    };
    return nodes.map(keep).filter((n): n is TreeNode => n !== null);
}
