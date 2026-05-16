import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Mock fs / zlib BEFORE importing store ───────────────────────────────────
vi.mock('fs', () => ({
  readFileSync:   vi.fn(),
  writeFileSync:  vi.fn(),
  existsSync:     vi.fn().mockReturnValue(false),
  mkdirSync:      vi.fn(),
  statSync:       vi.fn(),
}));
vi.mock('zlib', () => ({
  gzipSync:       vi.fn(),
  gunzipSync:     vi.fn(),
}));

// Set env vars required by config before any module import
process.env.TG_TOKEN    = 'test:token';
process.env.TG_GROUP_ID = '-100123';
process.env.ZALO_CREDENTIALS_PATH = '/tmp/test-creds.json';

import {
  sentMsgStore,
  msgStore,
  mediaGroupStore,
  zaloAlbumStore,
  reactionEchoStore,
  reactionSummaryStore,
  pollStore,
  userCache,
  aliasCache,
  friendsCache,
  groupsCache,
} from './store.js';

// ──────────────────────────────────────────────────────────────────────────────
//  sentMsgStore
// ──────────────────────────────────────────────────────────────────────────────
describe('sentMsgStore', () => {
  beforeEach(() => {
    // Reload module to reset internal state
    vi.resetModules();
  });

  it('save + get round-trip', () => {
    sentMsgStore.save(1, { msgIds: ['a'], zaloId: 'z1', threadType: 0 });
    const got = sentMsgStore.get(1);
    expect(got).toEqual({ msgIds: ['a'], zaloId: 'z1', threadType: 0 });
  });

  it('getByZaloMsgId returns the tgMsgId', () => {
    sentMsgStore.save(42, { msgIds: ['mid1', 'mid2'], zaloId: 'z1', threadType: 1 });
    expect(sentMsgStore.getByZaloMsgId('mid1')).toBe(42);
    expect(sentMsgStore.getByZaloMsgId('mid2')).toBe(42);
    expect(sentMsgStore.getByZaloMsgId('nonexistent')).toBeUndefined();
  });

  it('save overwrites existing tgMsgId', () => {
    sentMsgStore.save(1, { msgIds: ['a'], zaloId: 'z1', threadType: 0 });
    sentMsgStore.save(1, { msgIds: ['b'], zaloId: 'z2', threadType: 1 });
    expect(sentMsgStore.get(1)?.msgIds).toEqual(['b']);
    // Old zalo msgId is still in _sentByZaloId (not deleted on overwrite)
    expect(sentMsgStore.getByZaloMsgId('a')).toBe(1);
  });

  it('get returns undefined for unknown tgMsgId', () => {
    expect(sentMsgStore.get(999)).toBeUndefined();
  });

  it('getByZaloMsgId returns undefined for unknown zaloMsgId', () => {
    expect(sentMsgStore.getByZaloMsgId('nope')).toBeUndefined();
  });

  it('multiple tgMsgIds can point to the same zaloMsgId (album use case)', () => {
    sentMsgStore.save(1, { msgIds: ['shared'], zaloId: 'z1', threadType: 1 });
    sentMsgStore.save(2, { msgIds: ['shared'], zaloId: 'z1', threadType: 1 });
    // Both tgMsgIds are retrievable
    expect(sentMsgStore.get(1)?.msgIds).toEqual(['shared']);
    expect(sentMsgStore.get(2)?.msgIds).toEqual(['shared']);
    // Reverse lookup returns the LAST tgMsgId that was saved with this zaloMsgId
    expect(sentMsgStore.getByZaloMsgId('shared')).toBe(2);
  });

  it('markSending / unmarkSending / isSendingTo', () => {
    expect(sentMsgStore.isSendingTo('z1')).toBe(false);
    sentMsgStore.markSending('z1');
    expect(sentMsgStore.isSendingTo('z1')).toBe(true);
    sentMsgStore.unmarkSending('z1');
    expect(sentMsgStore.isSendingTo('z1')).toBe(false);
  });

  it('isSendingTo returns false after timeout', async () => {
    vi.useFakeTimers();
    sentMsgStore.markSending('z1');
    vi.advanceTimersByTime(16_000);
    expect(sentMsgStore.isSendingTo('z1')).toBe(false);
    vi.useRealTimers();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  mediaGroupStore
// ──────────────────────────────────────────────────────────────────────────────
describe('mediaGroupStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('buffers items and flushes after 500 ms', () => {
    const flushed: Array<{ items: any[]; meta: any }> = [];
    const onFlush = (items: any[], meta: any) => { flushed.push({ items, meta }); };

    mediaGroupStore.add('g1', { fileId: 'f1', fname: 'a.jpg' },
      { topicId: 10, zaloId: 'z1', threadType: 1, replyToMsgId: undefined },
      onFlush,
    );

    expect(flushed.length).toBe(0);
    vi.advanceTimersByTime(600);
    expect(flushed.length).toBe(1);
    expect(flushed[0].items).toHaveLength(1);
    expect(flushed[0].items[0].fileId).toBe('f1');
  });

  it('aggregates multiple items into one flush', () => {
    const flushed: Array<{ items: any[]; meta: any }> = [];
    const onFlush = (items: any[], meta: any) => { flushed.push({ items, meta }); };

    mediaGroupStore.add('g1', { fileId: 'f1', fname: 'a.jpg' },
      { topicId: 10, zaloId: 'z1', threadType: 1 },
      onFlush,
    );
    mediaGroupStore.add('g1', { fileId: 'f2', fname: 'b.jpg' },
      { topicId: 10, zaloId: 'z1', threadType: 1 },
      onFlush,
    );

    vi.advanceTimersByTime(600);
    expect(flushed.length).toBe(1);
    expect(flushed[0].items).toHaveLength(2);
  });

  it('separate group IDs flush independently', () => {
    const flushed: string[] = [];
    const onFlush = (items: any[], meta: any) => { flushed.push(meta.zaloId); };

    mediaGroupStore.add('g1', { fileId: 'f1', fname: 'a.jpg' },
      { topicId: 10, zaloId: 'z1', threadType: 1 }, onFlush,
    );
    mediaGroupStore.add('g2', { fileId: 'f2', fname: 'b.jpg' },
      { topicId: 20, zaloId: 'z2', threadType: 1 }, onFlush,
    );

    vi.advanceTimersByTime(600);
    expect(flushed).toEqual(['z1', 'z2']);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  zaloAlbumStore
// ──────────────────────────────────────────────────────────────────────────────
describe('zaloAlbumStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes single photo after 200 ms', () => {
    const flushed: any[] = [];
    const onFlush = (buf: any) => { flushed.push(buf); };

    zaloAlbumStore.add('k1', 'https://example.com/1.jpg', ['msg1'],
      { senderName: 'Alice', topicId: 10, tgBase: { message_thread_id: 10 }, zaloQuote: undefined },
      onFlush,
    );

    vi.advanceTimersByTime(300);
    expect(flushed.length).toBe(1);
    expect(flushed[0].urls).toEqual(['https://example.com/1.jpg']);
    expect(flushed[0].zaloMsgIds).toEqual(['msg1']);
  });

  it('aggregates multiple photos into one album', () => {
    const flushed: any[] = [];
    const onFlush = (buf: any) => { flushed.push(buf); };

    zaloAlbumStore.add('k1', 'https://example.com/1.jpg', ['msg1'],
      { senderName: 'Alice', topicId: 10, tgBase: { message_thread_id: 10 }, zaloQuote: undefined },
      onFlush,
    );
    zaloAlbumStore.add('k1', 'https://example.com/2.jpg', ['msg2'],
      { senderName: 'Alice', topicId: 10, tgBase: { message_thread_id: 10 }, zaloQuote: undefined },
      onFlush,
    );

    vi.advanceTimersByTime(300);
    expect(flushed.length).toBe(1);
    expect(flushed[0].urls).toHaveLength(2);
    expect(flushed[0].zaloMsgIds).toEqual(['msg1', 'msg2']);
  });

  it('different keys flush independently', () => {
    const flushed: any[] = [];
    const onFlush = (buf: any) => { flushed.push(buf); };

    zaloAlbumStore.add('k1', 'url1', ['m1'],
      { senderName: 'A', topicId: 10, tgBase: { message_thread_id: 10 }, zaloQuote: undefined },
      onFlush,
    );
    zaloAlbumStore.add('k2', 'url2', ['m2'],
      { senderName: 'B', topicId: 20, tgBase: { message_thread_id: 20 }, zaloQuote: undefined },
      onFlush,
    );

    vi.advanceTimersByTime(300);
    expect(flushed).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  reactionEchoStore
// ──────────────────────────────────────────────────────────────────────────────
describe('reactionEchoStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mark then consume returns true once', () => {
    reactionEchoStore.mark('z1', 'm1', '/-heart');
    expect(reactionEchoStore.consume('z1', 'm1', '/-heart')).toBe(true);
    // Second consume returns false (already consumed)
    expect(reactionEchoStore.consume('z1', 'm1', '/-heart')).toBe(false);
  });

  it('consume without mark returns false', () => {
    expect(reactionEchoStore.consume('z1', 'm1', '/-heart')).toBe(false);
  });

  it('cancel decrements count', () => {
    reactionEchoStore.mark('z1', 'm1', '/-heart');
    reactionEchoStore.mark('z1', 'm1', '/-heart'); // count = 2
    reactionEchoStore.cancel('z1', 'm1', '/-heart'); // count → 1
    expect(reactionEchoStore.consume('z1', 'm1', '/-heart')).toBe(true);
  });

  it('marks with same key increment', () => {
    reactionEchoStore.mark('z1', 'm1', '/-heart');
    reactionEchoStore.mark('z1', 'm1', '/-heart');
    expect(reactionEchoStore.consume('z1', 'm1', '/-heart')).toBe(true);
    expect(reactionEchoStore.consume('z1', 'm1', '/-heart')).toBe(true);
    expect(reactionEchoStore.consume('z1', 'm1', '/-heart')).toBe(false);
  });

  it('different keys do not interfere', () => {
    reactionEchoStore.mark('z1', 'm1', '/-heart');
    expect(reactionEchoStore.consume('z2', 'm1', '/-heart')).toBe(false);
    expect(reactionEchoStore.consume('z1', 'm2', '/-heart')).toBe(false);
    expect(reactionEchoStore.consume('z1', 'm1', '/-strong')).toBe(false);
    expect(reactionEchoStore.consume('z1', 'm1', '/-heart')).toBe(true);
  });

  it('expired entries are pruned (8s TTL)', () => {
    reactionEchoStore.mark('z1', 'm1', '/-heart');
    vi.advanceTimersByTime(9_000);
    // Entry should have been pruned; consume returns false
    expect(reactionEchoStore.consume('z1', 'm1', '/-heart')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  reactionSummaryStore
// ──────────────────────────────────────────────────────────────────────────────
describe('reactionSummaryStore', () => {
  it('upsert creates new entry', () => {
    const entry = reactionSummaryStore.upsert(1, '❤️', 'Alice');
    expect(entry.reactions).toEqual({ '❤️': ['Alice'] });
    expect(entry.summaryTgMsgId).toBeNull();
    expect(entry.lastSentText).toBe('');
  });

  it('upsert appends to existing entry', () => {
    reactionSummaryStore.upsert(1, '❤️', 'Alice');
    const entry = reactionSummaryStore.upsert(1, '👍', 'Bob');
    expect(entry.reactions['❤️']).toEqual(['Alice']);
    expect(entry.reactions['👍']).toEqual(['Bob']);
  });

  it('same actor+emoji not duplicated', () => {
    reactionSummaryStore.upsert(1, '❤️', 'Alice');
    const entry = reactionSummaryStore.upsert(1, '❤️', 'Alice');
    expect(entry.reactions['❤️']).toEqual(['Alice']);
  });

  it('setSummaryMsgId updates the entry', () => {
    reactionSummaryStore.upsert(1, '❤️', 'Alice');
    reactionSummaryStore.setSummaryMsgId(1, 42);
    const entry = reactionSummaryStore.upsert(1, '👍', 'Bob');
    expect(entry.summaryTgMsgId).toBe(42);
  });

  it('buildText formats correctly', () => {
    const entry = reactionSummaryStore.upsert(1, '❤️', 'Alice');
    reactionSummaryStore.upsert(1, '👍', 'Bob');
    const text = reactionSummaryStore.buildText(entry);
    expect(text).toContain('❤️ Alice');
    expect(text).toContain('👍 Bob');
  });

  it('buildText skips empty emoji groups', () => {
    const entry = reactionSummaryStore.upsert(999, '❤️', 'Alice');
    delete entry.reactions['❤️'];
    expect(reactionSummaryStore.buildText(entry)).toBe('');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  pollStore
// ──────────────────────────────────────────────────────────────────────────────
describe('pollStore', () => {
  const sampleEntry = {
    pollId: 101,
    zaloGroupId: 'zg1',
    tgPollMsgId: 201,
    tgOrigPollMsgId: 202,
    tgPollUUID: 'uuid-abc',
    tgScoreMsgId: 301,
    tgThreadId: 10,
    options: [
      { option_id: 0, content: 'A' },
      { option_id: 1, content: 'B' },
    ],
  };

  it('save + getByPollId round-trip', () => {
    pollStore.save(sampleEntry);
    expect(pollStore.getByPollId(101)?.pollId).toBe(101);
  });

  it('getByTgMsgId lookup', () => {
    pollStore.save(sampleEntry);
    expect(pollStore.getByTgMsgId(201)?.pollId).toBe(101);
  });

  it('getByTgPollUUID lookup', () => {
    pollStore.save(sampleEntry);
    expect(pollStore.getByTgPollUUID('uuid-abc')?.pollId).toBe(101);
  });

  it('updateScoreMsg updates tgScoreMsgId', () => {
    pollStore.save(sampleEntry);
    pollStore.updateScoreMsg(101, 999);
    expect(pollStore.getByPollId(101)?.tgScoreMsgId).toBe(999);
  });

  it('getters return undefined for unknown entries', () => {
    expect(pollStore.getByPollId(999)).toBeUndefined();
    expect(pollStore.getByTgMsgId(999)).toBeUndefined();
    expect(pollStore.getByTgPollUUID('nope')).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  userCache (in-memory methods only — persisted methods skipped)
// ──────────────────────────────────────────────────────────────────────────────
describe('userCache', () => {
  it('save + getName round-trip', () => {
    userCache.save('uid1', 'Alice');
    expect(userCache.getName('uid1')).toBe('Alice');
  });

  it('resolveByName finds exact name', () => {
    userCache.save('uid1', 'Alice');
    expect(userCache.resolveByName('Alice')).toBe('uid1');
  });

  it('resolveByName is case-insensitive', () => {
    userCache.save('uid1', 'Nguyễn Văn A');
    expect(userCache.resolveByName('nguyễn văn a')).toBe('uid1');
  });

  it('resolveByName handles diacritics (NFD)', () => {
    userCache.save('uid1', 'Đặng Thị B');
    expect(userCache.resolveByName('dang thi b')).toBe('uid1');
  });

  it('saveForGroup + resolveByNameInGroup', () => {
    userCache.saveForGroup('uid1', 'Alice', 'group1');
    expect(userCache.resolveByNameInGroup('Alice', 'group1')).toBe('uid1');
  });

  it('resolveByNameInGroup falls back to global cache', () => {
    userCache.save('uid2', 'Bob');
    // Different group, no group-specific entry
    expect(userCache.resolveByNameInGroup('Bob', 'group99')).toBe('uid2');
  });

  it('resolveByName returns undefined for unknown name', () => {
    expect(userCache.resolveByName('Nobody')).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  aliasCache
// ──────────────────────────────────────────────────────────────────────────────
describe('aliasCache', () => {
  it('setAll populates cache', () => {
    aliasCache.setAll([{ userId: 'u1', alias: 'Bạn thân' }]);
    expect(aliasCache.get('u1')).toBe('Bạn thân');
    expect(aliasCache.size()).toBe(1);
  });

  it('merge adds new entries', () => {
    aliasCache.setAll([]);
    aliasCache.merge([{ userId: 'u1', alias: 'Bestie' }]);
    expect(aliasCache.get('u1')).toBe('Bestie');
  });

  it('resolveByAlias finds UID', () => {
    aliasCache.setAll([{ userId: 'u1', alias: 'Nickname' }]);
    expect(aliasCache.resolveByAlias('Nickname')).toBe('u1');
  });

  it('label returns alias with real name when different', () => {
    aliasCache.setAll([{ userId: 'u1', alias: 'Nick' }]);
    expect(aliasCache.label('u1', 'Nguyen Van A')).toBe('Nick (Nguyen Van A)');
  });

  it('label returns realName when no alias', () => {
    aliasCache.setAll([]);
    expect(aliasCache.label('u1', 'Nguyen Van A')).toBe('Nguyen Van A');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  friendsCache
// ──────────────────────────────────────────────────────────────────────────────
describe('friendsCache', () => {
  const friends = [
    { userId: 'u1', displayName: 'Alice' },
    { userId: 'u2', displayName: 'Bob' },
  ];

  it('search returns up to limit results', () => {
    friendsCache.set(friends);
    const results = friendsCache.search('Ali', 5);
    expect(results).toHaveLength(1);
    expect(results[0].displayName).toBe('Alice');
  });

  it('search is case-insensitive', () => {
    friendsCache.set(friends);
    expect(friendsCache.search('alice', 5)).toHaveLength(1);
  });

  it('search empty query returns all up to limit', () => {
    friendsCache.set(friends);
    expect(friendsCache.search('', 1)).toHaveLength(1);
  });

  it('get returns friend by userId', () => {
    friendsCache.set(friends);
    expect(friendsCache.get('u1')?.displayName).toBe('Alice');
    expect(friendsCache.get('nobody')).toBeUndefined();
  });

  it('isFresh returns false when empty', () => {
    friendsCache.set([]);
    expect(friendsCache.isFresh()).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  groupsCache
// ──────────────────────────────────────────────────────────────────────────────
describe('groupsCache', () => {
  const groups = [
    { groupId: 'g1', name: 'Gia đình', totalMember: 10 },
    { groupId: 'g2', name: 'Bạn bè',   totalMember: 5 },
  ];

  it('search matches by name', () => {
    groupsCache.set(groups);
    expect(groupsCache.search('Gia', 5)).toHaveLength(1);
    expect(groupsCache.search('Gia', 5)[0].groupId).toBe('g1');
  });

  it('search is case-insensitive', () => {
    groupsCache.set(groups);
    expect(groupsCache.search('gia', 5)).toHaveLength(1);
  });

  it('isFresh returns false when empty', () => {
    groupsCache.set([]);
    expect(groupsCache.isFresh()).toBe(false);
  });
});
