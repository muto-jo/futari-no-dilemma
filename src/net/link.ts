// 通信路。OnlineSession はこの形だけを知り、Trystero には直接触れない
import type { Msg } from './protocol.ts';

export interface Link {
  send(msg: Msg): void;
  onMessage: ((data: unknown, peerId: string) => void) | null;
  onPeerJoin: ((peerId: string) => void) | null;
  onPeerLeave: ((peerId: string) => void) | null;
  leave(): void;
}

/** 仲介(signaling)の方式。既定は Nostr、つながらないときの予備に BitTorrent */
export type Strategy = 'nostr' | 'torrent';

const APP_ID = 'futari-no-dilemma-v1';

/** Trystero で部屋に入る。方式のライブラリは使うときだけ読み込む */
export async function joinTrystero(strategy: Strategy, roomCode: string): Promise<Link> {
  const { joinRoom } = strategy === 'nostr' ? await import('trystero') : await import('@trystero-p2p/torrent');
  // 合言葉を password にも使い、仲介に流れる接続情報を暗号化する
  const room = joinRoom({ appId: APP_ID, password: `fnd-${roomCode}` }, `room-${roomCode}`);
  const action = room.makeAction('msg');
  const link: Link = {
    send(msg) {
      void action.send(msg as unknown as Parameters<typeof action.send>[0]);
    },
    onMessage: null,
    onPeerJoin: null,
    onPeerLeave: null,
    leave() {
      void room.leave();
    },
  };
  action.onMessage = (data, ctx) => link.onMessage?.(data, ctx.peerId);
  room.onPeerJoin = (peerId) => link.onPeerJoin?.(peerId);
  room.onPeerLeave = (peerId) => link.onPeerLeave?.(peerId);
  return link;
}

/** テスト用: メモリ上でつながる2本の通信路。届くのは非同期 */
export class MemoryNet {
  readonly a: Link;
  readonly b: Link;
  connected = false;
  /** テストで中身をのぞく・書き換えるためのフック */
  tap: ((from: 'a' | 'b', msg: Msg) => Msg | null) | null = null;
  #ids = { a: 'peer-a', b: 'peer-b' };

  constructor() {
    const make = (self: 'a' | 'b'): Link => ({
      send: (msg) => {
        if (!this.connected) return;
        const m = this.tap ? this.tap(self, msg) : msg;
        if (m === null) return;
        const other = self === 'a' ? this.b : this.a;
        // 実際の通信と同じく、JSON で往復させる
        const data: unknown = JSON.parse(JSON.stringify(m));
        queueMicrotask(() => this.connected && other.onMessage?.(data, this.#ids[self]));
      },
      onMessage: null,
      onPeerJoin: null,
      onPeerLeave: null,
      leave: () => this.disconnect(),
    });
    this.a = make('a');
    this.b = make('b');
  }

  connect(): void {
    this.connected = true;
    queueMicrotask(() => {
      this.a.onPeerJoin?.(this.#ids.b);
      this.b.onPeerJoin?.(this.#ids.a);
    });
  }

  disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    queueMicrotask(() => {
      this.a.onPeerLeave?.(this.#ids.b);
      this.b.onPeerLeave?.(this.#ids.a);
    });
  }

  /** つなぎ直す(再接続では peerId が変わる) */
  reconnect(): void {
    this.#ids = { a: `${this.#ids.a}'`, b: `${this.#ids.b}'` };
    this.connect();
  }
}
