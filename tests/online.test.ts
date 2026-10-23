import { describe, expect, it, vi } from 'vitest';
import { commit, verify } from '../src/net/commit.ts';
import { MemoryNet } from '../src/net/link.ts';
import { parseMsg, type ChoiceToken, type Msg } from '../src/net/protocol.ts';
import { CLOSE, OnlineSession } from '../src/net/session.ts';
import type { GameState } from '../src/engine/types.ts';

/** メッセージが行き来し終わるまで待つ */
const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

function pair(opts: { reconnectMs?: number; seed?: number } = {}) {
  const net = new MemoryNet();
  const host = new OnlineSession({ isHost: true, name: 'たろう', link: net.a, hostRole: 'wife', seed: opts.seed ?? 7, reconnectMs: opts.reconnectMs });
  const guest = new OnlineSession({ isHost: false, name: 'はなこ', link: net.b, reconnectMs: opts.reconnectMs });
  return { net, host, guest };
}

async function connected(opts: { reconnectMs?: number; seed?: number } = {}) {
  const p = pair(opts);
  p.net.connect();
  await flush();
  return p;
}

/** 1ラウンド進める。choose は [ホスト, ゲスト] の選択を返す */
async function playRound(host: OnlineSession, guest: OnlineSession, promises: [ChoiceToken, ChoiceToken], actions: [ChoiceToken, ChoiceToken]) {
  for (const s of [host, guest]) {
    const g = s.game!;
    if (g.phase === 'event') s.decideJikka(false);
  }
  await flush();
  host.ready();
  guest.ready();
  await flush();
  await host.pick(promises[0]);
  await guest.pick(promises[1]);
  await flush();
  await host.pick(actions[0]);
  await guest.pick(actions[1]);
  await flush();
}

describe('コミット&リビール', () => {
  it('同じ局面・選択・nonce でだけ検証が通る', async () => {
    const c = await commit('3:promise', 'me');
    expect(c.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await verify('3:promise', 'me', c.nonce, c.hash)).toBe(true);
    expect(await verify('3:promise', 'you', c.nonce, c.hash)).toBe(false);
    expect(await verify('4:promise', 'me', c.nonce, c.hash)).toBe(false);
  });

  it('おかしなメッセージは受け取らない', () => {
    expect(parseMsg({ t: 'reveal', key: '1:promise', choice: 'cheat', nonce: '0'.repeat(32) })).toBeNull();
    expect(parseMsg({ t: 'chat', text: 'x'.repeat(41), preset: null })).toBeNull();
    expect(parseMsg({ t: 'chat', text: 'なんでも', preset: 'ok' })).toEqual({ t: 'chat', text: 'やるよー', preset: 'ok' });
    // consult のない setup(古い版のホスト)は相談ありとして受け取る
    expect(parseMsg({ t: 'setup', hostRole: 'wife', names: { husband: 'a', wife: 'b' } })).toMatchObject({ consult: true });
    expect(parseMsg('hello')).toBeNull();
  });
});

describe('オンライン対戦の進行', () => {
  it('つながるとホストがゲームを作り、ゲストは残りの役になる', async () => {
    const { host, guest } = await connected();
    expect(host.status).toBe('playing');
    expect(guest.status).toBe('playing');
    expect(host.myRole).toBe('wife');
    expect(guest.myRole).toBe('husband');
    expect(guest.names).toEqual({ husband: 'はなこ', wife: 'たろう' });
    expect(guest.game?.round).toBe(1);
  });

  it('名前がかぶったら、ゲストの名前に「2」を付ける', async () => {
    const net = new MemoryNet();
    const host = new OnlineSession({ isHost: true, name: 'かな', link: net.a, hostRole: 'husband' });
    const guest = new OnlineSession({ isHost: false, name: 'かな', link: net.b });
    net.connect();
    await flush();
    expect(host.names).toEqual({ husband: 'かな', wife: 'かな2' });
    expect(guest.names).toEqual({ husband: 'かな', wife: 'かな2' });
  });

  it('ゲストに届く状態には山札の並びと seed がない', async () => {
    const { host, guest } = await connected();
    expect(host.game!.deck.length).toBe(32);
    expect(guest.game!.deck).toEqual([]);
    expect(guest.game!.seed).toBe(0);
  });

  it('相手が選ぶまで、相手の選択は届かない', async () => {
    const seen: Msg[] = [];
    const { net, host, guest } = await connected();
    net.tap = (from, m) => {
      if (from === 'a') seen.push(m);
      return m;
    };
    if (host.game!.phase === 'event') host.decideJikka(false);
    guest.decideJikka(false);
    await flush();
    host.ready();
    guest.ready();
    await flush();
    expect(host.game!.phase).toBe('promise');
    await host.pick('together');
    await flush();
    // ホストが送ったのはハッシュだけ
    expect(seen.filter((m) => m.t === 'reveal')).toEqual([]);
    expect(seen.some((m) => m.t === 'commit')).toBe(true);
    expect(guest.peerPicked).toBe(true);
    await guest.pick('me');
    await flush();
    expect(seen.filter((m) => m.t === 'reveal')).toHaveLength(1);
    expect(host.game!.phase).toBe('action');
    expect(guest.game!.phase === 'action' && guest.game!.promises).toEqual({ husband: 'me', wife: 'together' });
  });

  it('最後まで遊べる。2人の画面の状態は一致する', async () => {
    const { host, guest } = await connected({ seed: 11 });
    let guard = 0;
    while (host.game!.phase !== 'ended') {
      if (guard++ > 60) throw new Error('stuck');
      // 交互にお願いを成立させる(ゲスト=夫、ホスト=妻)
      const odd = host.game!.round % 2 === 1;
      const g = host.game!;
      const hDown = g.players.wife.tired >= 7;
      const gDown = g.players.husband.tired >= 7;
      await playRound(
        host,
        guest,
        [hDown || odd ? 'you' : 'me', gDown || !odd ? 'you' : 'me'],
        [hDown || odd ? 'delegate' : 'do', gDown || !odd ? 'delegate' : 'do'],
      );
      host.ready();
      guest.ready();
      await flush();
    }
    expect(guest.game!.phase).toBe('ended');
    const strip = (x: GameState) => ({ ...x, deck: [], deckPos: 0, seed: 0, rngState: 0 });
    expect(guest.game).toEqual(strip(host.game!));
    expect(host.game!.phase === 'ended' && host.game!.ending.kind).toBe('success');
  });

  it('相談なしの部屋では、相談フェイズを通らずに約束カードへ進む', async () => {
    const net = new MemoryNet();
    const host = new OnlineSession({ isHost: true, name: 'たろう', link: net.a, hostRole: 'wife', seed: 7, consult: false });
    const guest = new OnlineSession({ isHost: false, name: 'はなこ', link: net.b });
    const phases: string[] = [];
    guest.onChange = () => guest.game && phases.push(guest.game.phase);
    net.connect();
    await flush();
    expect(guest.consult).toBe(false);
    if (host.game!.phase === 'event') host.decideJikka(false);
    guest.decideJikka(false);
    await flush();
    expect(host.game!.phase).toBe('promise');
    expect(guest.game!.phase).toBe('promise');
    expect(phases).not.toContain('consult');
    // 約束 → 行動 → 次のラウンドでも、相談なしのまま
    await host.pick('together');
    await guest.pick('together');
    await flush();
    await host.pick('do');
    await guest.pick('do');
    await flush();
    host.ready();
    guest.ready();
    await flush();
    if (host.game!.phase === 'event') host.decideJikka(false);
    guest.decideJikka(false);
    await flush();
    expect(host.game!.round).toBe(2);
    expect(guest.game!.phase).toBe('promise');
    expect(phases).not.toContain('consult');
  });

  it('チャット(定型文と自由入力)', async () => {
    const { host, guest } = await connected();
    guest.say('', 'ask');
    await flush();
    host.say('  ちょっと待ってね  ');
    await flush();
    expect(host.chat.map((c) => `${c.from}:${c.text}`)).toEqual(['husband:お願いしていい?', 'wife:ちょっと待ってね']);
    expect(guest.chat).toEqual(host.chat);
  });
});

describe('不正と切断', () => {
  it('コミットと違う選択を明かしたら終了する', async () => {
    const { net, host, guest } = await connected();
    host.decideJikka(false);
    guest.decideJikka(false);
    await flush();
    host.ready();
    guest.ready();
    await flush();
    // ゲストの reveal を書き換える
    net.tap = (from, m) => (from === 'b' && m.t === 'reveal' ? { ...m, choice: 'you' } : m);
    await guest.pick('me');
    await host.pick('together');
    await flush();
    expect(host.status).toBe('closed');
    expect(host.closeReason).toBe(CLOSE.badReveal);
  });

  it('ホストの処理が選択と違えば、ゲストが気づいて終了する', async () => {
    const { net, host, guest } = await connected();
    host.decideJikka(false);
    guest.decideJikka(false);
    await flush();
    host.ready();
    guest.ready();
    await flush();
    net.tap = (from, m) =>
      from === 'a' && m.t === 'state' && m.game.phase === 'action'
        ? { ...m, game: { ...m.game, promises: { husband: 'together', wife: 'together' } } }
        : m;
    await host.pick('me');
    await guest.pick('you');
    await flush();
    expect(guest.status).toBe('closed');
    expect(guest.closeReason).toBe(CLOSE.badHost);
  });

  it('切断しても、同じ画面のまま戻れば続きから遊べる', async () => {
    const { net, host, guest } = await connected();
    host.decideJikka(false);
    guest.decideJikka(false);
    await flush();
    host.ready();
    guest.ready();
    await flush();
    await host.pick('me');
    await flush();
    net.disconnect();
    await flush();
    expect(host.status).toBe('reconnecting');
    // 切れている間に選ぶ
    await guest.pick('you');
    net.reconnect();
    await flush();
    expect(host.status).toBe('playing');
    expect(host.game!.phase).toBe('action');
    expect(guest.game!.phase).toBe('action');
  });

  it('戻ってこなければ、時間切れで終了する', async () => {
    vi.useFakeTimers();
    try {
      const net = new MemoryNet();
      const host = new OnlineSession({ isHost: true, name: 'a', link: net.a, reconnectMs: 1000 });
      const guest = new OnlineSession({ isHost: false, name: 'b', link: net.b, reconnectMs: 1000 });
      net.connect();
      await vi.runAllTimersAsync();
      expect(host.status).toBe('playing');
      net.disconnect();
      await vi.advanceTimersByTimeAsync(1500);
      expect(host.status).toBe('closed');
      expect(host.closeReason).toBe(CLOSE.timeout);
      expect(guest.status).toBe('closed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('途中で別の画面から入り直したら終了する(相手の選択を見てからの選び直しを防ぐ)', async () => {
    const { net, host } = await connected();
    net.disconnect();
    await flush();
    // ゲストがページを開き直した(新しいセッション)
    const fresh = new OnlineSession({ isHost: false, name: 'はなこ', link: net.b });
    void fresh;
    net.reconnect();
    await flush();
    expect(host.status).toBe('closed');
    expect(host.closeReason).toBe(CLOSE.rejoined);
  });

  it('相手が退出したら終了する', async () => {
    const { host, guest } = await connected();
    guest.leave();
    await flush();
    expect(guest.status).toBe('closed');
    expect(host.status).toBe('closed');
    expect(host.closeReason).toBe(CLOSE.bye);
  });
});
