// Draws a TreeNode[] and nothing else.
//
// It knows about rows, indentation and which rows are open. It knows nothing
// about Kubernetes -- that is entirely in src/model -- which is why the same
// renderer draws the ownership tree and the namespace tree. When you copy this
// plugin, this file is the part you keep as it is.
//
// Open rows are held by node id rather than by position, so the tree can be
// rebuilt from scratch on every poll (five seconds, by default) without
// collapsing under the user's hands. That is the whole reason TreeNode.id
// exists.

import { el, dot, svg, replace } from './dom.js';
import { CHEVRON, forType } from './icons.js';
import type { TreeNode } from '../model/tree.js';

export interface TreeOptions {
    /** Called when a row's label is clicked. */
    onSelect?: (node: TreeNode) => void;
    /** Extra buttons on the right of a row, when it has any. */
    rowActions?: (node: TreeNode) => HTMLElement[];
    /** What to draw when there is nothing at all. */
    empty?: string;
}

export class Tree {
    private open = new Set<string>();
    private nodes: TreeNode[] = [];
    private selected = '';

    constructor(
        private readonly host: HTMLElement,
        private readonly options: TreeOptions = {},
    ) {}

    /** Replaces the data and redraws, keeping which rows were open. */
    render(nodes: TreeNode[]): void {
        this.nodes = nodes;
        this.draw();
    }

    /** Opens every row that has children. */
    expandAll(): void {
        const add = (list: TreeNode[]) => {
            for (const node of list) {
                if (node.children.length) this.open.add(node.id);
                add(node.children);
            }
        };
        add(this.nodes);
        this.draw();
    }

    collapseAll(): void {
        this.open.clear();
        this.draw();
    }

    /** Opens the rows down to a node, so a linked-to object is on screen. */
    reveal(id: string): void {
        const path: string[] = [];
        const find = (list: TreeNode[], trail: string[]): boolean => {
            for (const node of list) {
                if (node.id === id) {
                    path.push(...trail);
                    return true;
                }
                if (find(node.children, [...trail, node.id])) return true;
            }
            return false;
        };
        if (!find(this.nodes, [])) return;
        for (const step of path) this.open.add(step);
        this.selected = id;
        this.draw();
    }

    /** Which rows are open, to hand to `storage` and put back later. */
    openRows(): string[] {
        return [...this.open];
    }

    restoreOpenRows(ids: string[]): void {
        this.open = new Set(ids);
        this.draw();
    }

    private draw(): void {
        if (!this.nodes.length) {
            replace(this.host, el('p', { class: 'empty' }, this.options.empty ?? 'Nothing here.'));
            return;
        }
        const rows: HTMLElement[] = [];
        const add = (list: TreeNode[], depth: number) => {
            for (const node of list) {
                rows.push(this.row(node, depth));
                if (this.open.has(node.id)) add(node.children, depth + 1);
            }
        };
        add(this.nodes, 0);
        replace(this.host, ...rows);
    }

    private row(node: TreeNode, depth: number): HTMLElement {
        const hasKids = node.children.length > 0;
        const isOpen = this.open.has(node.id);

        const twisty = el('button', {
            type: 'button',
            class: `twisty${hasKids ? '' : ' twisty-leaf'}${isOpen ? ' twisty-open' : ''}`,
            'aria-label': hasKids ? (isOpen ? 'Collapse' : 'Expand') : '',
            tabindex: hasKids ? 0 : -1,
        });
        if (hasKids) {
            twisty.append(svg(CHEVRON));
            twisty.addEventListener('click', (event) => {
                event.stopPropagation();
                if (isOpen) this.open.delete(node.id);
                else this.open.add(node.id);
                this.draw();
            });
        }

        const label = el(
            'button',
            { type: 'button', class: 'row-label', title: `${node.typeLabel} ${node.label}` },
            svg(forType(node.typeLabel), 'icon type-icon'),
            el('span', { class: 'row-type' }, node.typeLabel),
            el('span', { class: 'row-name' }, node.label),
        );
        label.addEventListener('click', () => {
            this.selected = node.id;
            this.draw();
            this.options.onSelect?.(node);
        });

        const right = el(
            'span',
            { class: 'row-right' },
            node.detail ? el('span', { class: `row-detail tone-${node.tone || 'none'}` }, node.detail) : null,
            node.tone ? dot(node.tone) : null,
        );
        for (const action of this.options.rowActions?.(node) ?? []) right.append(action);

        const row = el('div', {
            class: `row${this.selected === node.id ? ' row-selected' : ''}`,
            style: `--depth:${depth}`,
        }, twisty, label, right);
        return row;
    }
}
