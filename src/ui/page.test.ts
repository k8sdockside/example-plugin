import { describe, expect, test } from 'vitest';
import { since, where } from './page.js';

describe('since', () => {
    const now = Date.parse('2026-06-01T12:00:00Z');

    test('counts in the app shorthand', () => {
        expect(since('2026-06-01T11:59:30Z', now)).toBe('30s');
        expect(since('2026-06-01T11:30:00Z', now)).toBe('30m');
        expect(since('2026-06-01T02:00:00Z', now)).toBe('10h');
        expect(since('2026-05-20T12:00:00Z', now)).toBe('12d');
    });

    test('an absent or unparseable timestamp is a dash, never NaN', () => {
        expect(since(undefined, now)).toBe('—');
        expect(since('', now)).toBe('—');
        expect(since('not a date', now)).toBe('—');
    });

    test('a clock that disagrees does not produce a negative age', () => {
        expect(since('2026-06-01T12:05:00Z', now)).toBe('0s');
    });
});

describe('where', () => {
    test('joins a namespaced object, and leaves a cluster-scoped one alone', () => {
        expect(where('default', 'web')).toBe('default/web');
        expect(where('', 'node-1')).toBe('node-1');
    });
});
