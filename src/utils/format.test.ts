import { describe, it, expect } from 'vitest';
import {
  truncate,
  escapeHtml,
  applyMentionsHtml,
  applyZaloMarkupHtml,
  formatGroupMsg,
  formatGroupMsgHtml,
  groupCaption,
  topicName,
} from './format.js';

describe('truncate', () => {
  it('returns short text as-is', () => {
    expect(truncate('hello')).toBe('hello');
  });
  it('truncates long text with ellipsis', () => {
    const long = 'a'.repeat(100);
    const result = truncate(long, 10);
    expect(result).toBe('aaaaaaaaa…');
    expect(result.length).toBe(10);
  });
  it('defaults to 4096 max', () => {
    const long = 'a'.repeat(5000);
    expect(truncate(long).length).toBe(4096);
  });
});

describe('escapeHtml', () => {
  it('escapes & < >', () => {
    expect(escapeHtml('&<>')).toBe('&amp;&lt;&gt;');
  });
  it('passes safe text through', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('applyMentionsHtml', () => {
  it('wraps mention spans in <b>', () => {
    const result = applyMentionsHtml('@Alice hello', [{ pos: 0, len: 6, type: 0 }]);
    expect(result).toBe('<b>@Alice</b> hello');
  });
  it('returns escaped text when no mentions', () => {
    expect(applyMentionsHtml('hello <world>', [])).toBe('hello &lt;world&gt;');
  });
  it('handles multiple mentions', () => {
    const result = applyMentionsHtml('@Alice @Bob hi', [
      { pos: 0, len: 6, type: 0 },
      { pos: 7, len: 4, type: 0 },
    ]);
    expect(result).toBe('<b>@Alice</b> <b>@Bob</b> hi');
  });
  it('skips out-of-range mentions', () => {
    const result = applyMentionsHtml('hi', [{ pos: 10, len: 5, type: 0 }]);
    expect(result).toBe('hi');
  });
});

describe('applyZaloMarkupHtml', () => {
  it('applies bold style', () => {
    const result = applyZaloMarkupHtml('hello world', undefined, [{ start: 0, len: 5, st: 'b' }]);
    expect(result).toBe('<b>hello</b> world');
  });
  it('applies italic and underline', () => {
    const result = applyZaloMarkupHtml('test', undefined, [
      { start: 0, len: 2, st: 'i' },
      { start: 2, len: 2, st: 'u' },
    ]);
    expect(result).toBe('<i>te</i><u>st</u>');
  });
  it('replaces mention with label', () => {
    const result = applyZaloMarkupHtml('@Alice hi', [
      { pos: 0, len: 6, type: 0, label: '@Người dùng' },
    ]);
    expect(result).toBe('<b>@Người dùng</b> hi');
  });
  it('escapes HTML in text', () => {
    const result = applyZaloMarkupHtml('<script>', undefined, [{ start: 0, len: 8, st: 'b' }]);
    expect(result).toBe('<b>&lt;script&gt;</b>');
  });
  it('returns escaped text when no styles or mentions', () => {
    expect(applyZaloMarkupHtml('a < b')).toBe('a &lt; b');
  });
  it('ignores unknown style tags', () => {
    const result = applyZaloMarkupHtml('hello', undefined, [{ start: 0, len: 5, st: 'c_ff0000' }]);
    expect(result).toBe('hello');
  });
});

describe('formatGroupMsg', () => {
  it('formats with sender name and content', () => {
    expect(formatGroupMsg('Alice', 'Hello')).toBe('<b>Alice:</b>\nHello');
  });
  it('truncates long sender names', () => {
    const longName = 'A'.repeat(100);
    const result = formatGroupMsg(longName, 'Hi');
    expect(result).toContain('<b>');
    // Name should be truncated to 64 chars
    expect(result.split('</b>')[0]!.length).toBeLessThanOrEqual(69); // <b> + 64 + </b>
  });
});

describe('formatGroupMsgHtml', () => {
  it('wraps sender in bold with pre-escaped body', () => {
    expect(formatGroupMsgHtml('Alice', '<b>Hello</b>')).toBe('<b>Alice:</b>\n<b>Hello</b>');
  });
});

describe('groupCaption', () => {
  it('returns bold sender name', () => {
    expect(groupCaption('Alice')).toBe('<b>Alice</b>');
  });
});

describe('topicName', () => {
  it('formats DM topic', () => {
    expect(topicName('Alice', 0)).toContain('Alice');
  });
  it('formats group topic', () => {
    expect(topicName('Friends', 1)).toContain('Friends');
  });
  it('limits to 128 chars', () => {
    const long = 'A'.repeat(200);
    expect(topicName(long, 0).length).toBeLessThanOrEqual(128);
  });
});
