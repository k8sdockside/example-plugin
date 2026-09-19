import { describe, expect, test } from 'vitest';
import { allIds, count, filter, walk, type TreeNode } from './tree.js';

const node = (id: string, label: string, children: TreeNode[] = []): TreeNode => ({
    id, label, detail: '', tone: '', typeLabel: 'Thing', children,
});

const tree = [
    node('1', 'web', [node('1a', 'web-rs', [node('1a1', 'web-pod-1'), node('1a2', 'web-pod-2')])]),
    node('2', 'api', [node('2a', 'api-rs')]),
];

describe('walk', () => {
    test('visits parents before children, with depth', () => {
        const seen: [string, number][] = [];
        walk(tree, (n, depth) => seen.push([n.label, depth]));
        expect(seen).toEqual([
            ['web', 0], ['web-rs', 1], ['web-pod-1', 2], ['web-pod-2', 2],
            ['api', 0], ['api-rs', 1],
        ]);
    });
});

describe('count and allIds', () => {
    test('cover every depth', () => {
        expect(count(tree)).toBe(6);
        expect(allIds(tree)).toEqual(['1', '1a', '1a1', '1a2', '2', '2a']);
    });
});

describe('filter', () => {
    test('keeps a matching leaf and every ancestor of it', () => {
        const found = filter(tree, 'pod-1');
        expect(found).toHaveLength(1);
        expect(found[0]!.label).toBe('web');
        expect(found[0]!.children[0]!.children.map((n) => n.label)).toEqual(['web-pod-1']);
    });

    test('a matching parent keeps all of its children', () => {
        const found = filter(tree, 'web');
        expect(found[0]!.children[0]!.children).toHaveLength(2);
    });

    test('an empty needle is the whole tree, unchanged', () => {
        expect(filter(tree, '   ')).toBe(tree);
    });

    test('no match is an empty forest, not a crash', () => {
        expect(filter(tree, 'nothing')).toEqual([]);
    });

    test('ignores case', () => {
        expect(filter(tree, 'WEB')).toHaveLength(1);
    });
});
