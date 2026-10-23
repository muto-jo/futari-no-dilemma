// オンライン対戦(SPEC 5.3)のセッション。ホストがゲームの状態を持ち、エンジンで処理して結果を送る。
// 約束カードと行動カードはコミット&リビールで交換し、どちらも相手の選択を先に知ることはできない
import { canDeclareOvertime, createGame, GameError, jikkaHolder, legalActions, legalPromises, step } from '../engine/game.ts';
import { opp, type GameInput, type GameState, type PerRole, type Role } from '../engine/types.ts';
import { commit, randomHex, verify, type Commitment } from './commit.ts';
import type { Link } from './link.ts';
import {
  ACTION_TOKENS,
  actionOf,
  actionToken,
  parseMsg,
  PRESET_TEXT,
  PROMISE_TOKENS,
  PROTOCOL_VERSION,
  promiseOf,
  CHAT_MAX,
  type ActionToken,
  type ChoiceToken,
  type Msg,
  type Preset,
  type PromiseToken,
} from './protocol.ts';

export type SessionStatus =
  /** 相手を待っている */
  | 'connecting'
  | 'playing'
  /** 接続が切れて、戻ってくるのを待っている */
  | 'reconnecting'
  | 'closed';

export interface ChatLine {
  readonly from: Role;
  readonly text: string;
  readonly round: number;
}

export interface OnlineOptions {
  readonly isHost: boolean;
  readonly name: string;
  readonly link: Link;
  /** ホストの役(ゲストは残りの役になる) */
  readonly hostRole?: Role;
  /** 相談フェイズを使うか(ホストが決める。既定はあり) */
  readonly consult?: boolean;
  readonly seed?: number;
  /** 切断から終了までの猶予 */
  readonly reconnectMs?: number;
}

export const phaseKey = (g: GameState): string => `${g.round}:${g.phase}`;

/** ゲストに送る状態。山札の並びと seed は伏せる(残り枚数や巣立ちの位置が分からないように) */
export const redact = (g: GameState): GameState => ({ ...g, deck: [], deckPos: 0, seed: 0, rngState: 0 });

export const CLOSE = {
  timeout: '接続が切れたため、ゲームを終了しました。結果は保存されません。',
  bye: '相手が退出しました。',
  rejoined: '相手が別の画面から入り直したため、このゲームは終了しました。',
  badReveal: '相手の選択を確かめられなかったため、ゲームを終了しました。',
  badMove: '相手の選択がルールに合わなかったため、ゲームを終了しました。',
  badHost: 'ホストの処理が2人の選択と一致しなかったため、ゲームを終了しました。',
} as const;

export class OnlineSession {
  readonly isHost: boolean;
  readonly myName: string;
  readonly session = randomHex(16);
  status: SessionStatus = 'connecting';
  closeReason: string | null = null;
  myRole: Role | null = null;
  names: PerRole<string> | null = null;
  /** 相談フェイズを使うか。ゲストはホストから受け取る */
  consult: boolean;
  /** ホストは完全な状態、ゲストは伏せた状態 */
  game: GameState | null = null;
  chat: ChatLine[] = [];
  onChange: () => void = () => {};

  #link: Link;
  #hostRole: Role;
  #seed: number | undefined;
  #reconnectMs: number;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #peerId: string | null = null;
  #peerSession: string | null = null;
  #peerName = '';
  #mine: Commitment | null = null;
  #picking = false;
  #revealedKey: string | null = null;
  #peerCommit: { key: string; hash: string } | null = null;
  #peerChoice: { key: string; choice: ChoiceToken } | null = null;
  #ready = { mine: new Set<string>(), peer: new Set<string>() };
  #peerJikka: { key: string; use: boolean } | null = null;

  constructor(opts: OnlineOptions) {
    this.isHost = opts.isHost;
    this.myName = opts.name;
    this.#link = opts.link;
    this.#hostRole = opts.hostRole ?? 'husband';
    this.consult = opts.consult ?? true;
    this.#seed = opts.seed;
    this.#reconnectMs = opts.reconnectMs ?? 60_000;
    this.#link.onPeerJoin = (id) => this.#onPeerJoin(id);
    this.#link.onPeerLeave = (id) => this.#onPeerLeave(id);
    // 届いた順に1つずつ処理する(reveal の検証は非同期なので、後ろの state が先に処理されないように)
    this.#link.onMessage = (data, id) => {
      this.#inbox = this.#inbox.then(() => this.#onMessage(data, id)).catch((e: unknown) => {
        console.error(e);
      });
    };
  }

  #inbox: Promise<void> = Promise.resolve();

  get peerRole(): Role | null {
    return this.myRole ? opp(this.myRole) : null;
  }

  get key(): string | null {
    return this.game ? phaseKey(this.game) : null;
  }

  /** 今の局面で自分が選んだもの(まだなら null) */
  get myPick(): ChoiceToken | null {
    return this.#mine && this.#mine.key === this.key ? this.#mine.choice as ChoiceToken : null;
  }

  get peerPicked(): boolean {
    return this.#peerCommit?.key === this.key;
  }

  get iAmReady(): boolean {
    return this.key !== null && this.#ready.mine.has(this.key);
  }

  get peerReady(): boolean {
    return this.key !== null && this.#ready.peer.has(this.key);
  }

  // ---- 自分の操作 ----------------------------------------------------

  /** 約束カード・行動カードを選ぶ。まずハッシュだけを送る */
  async pick(token: ChoiceToken): Promise<void> {
    const g = this.game;
    const key = this.key;
    if (!g || !key || !this.myRole || this.status === 'closed') return;
    if (this.myPick !== null || this.#picking) return;
    if (!this.#legal(g, this.myRole, token)) throw new Error(`illegal pick: ${token}`);
    this.#picking = true;
    try {
      const c = await commit(key, token);
      if (this.key !== key) return;
      this.#mine = c;
      this.#send({ t: 'commit', key, hash: c.hash });
      this.#maybeReveal();
    } finally {
      this.#picking = false;
    }
    this.#changed();
  }

  /** 相談終了・次のラウンドへ */
  ready(): void {
    const key = this.key;
    if (!key || this.status === 'closed' || this.#ready.mine.has(key)) return;
    this.#ready.mine.add(key);
    this.#send({ t: 'ready', key });
    this.#afterInput();
  }

  /** 実家ヘルプを使うか(自分が持ち主のとき) */
  decideJikka(use: boolean): void {
    const g = this.game;
    if (!g || g.phase !== 'event' || jikkaHolder(g) !== this.myRole) return;
    if (this.isHost) this.#hostStep({ type: 'confirmEvent', useJikka: use });
    else this.#send({ t: 'jikka', key: phaseKey(g), use });
  }

  say(text: string, preset: Preset | null = null): void {
    if (!this.myRole || !this.game || this.status === 'closed') return;
    const body = preset ? PRESET_TEXT[preset] : text.trim().slice(0, CHAT_MAX);
    if (!body) return;
    this.chat.push({ from: this.myRole, text: body, round: this.game.round });
    this.#send({ t: 'chat', text: body, preset });
    this.#changed();
  }

  /** 自分から退出する */
  leave(): void {
    if (this.status === 'closed') return;
    this.#send({ t: 'bye' });
    // bye が届くよう、少し待ってから接続を閉じる
    this.#close(null, 300);
  }

  // ---- 接続 ------------------------------------------------------------

  #send(msg: Msg): void {
    this.#link.send(msg);
  }

  #changed(): void {
    this.onChange();
  }

  #close(reason: string | null, leaveAfterMs = 0): void {
    if (this.status === 'closed') return;
    this.status = 'closed';
    this.closeReason = reason;
    if (this.#timer) clearTimeout(this.#timer);
    if (leaveAfterMs > 0) setTimeout(() => this.#link.leave(), leaveAfterMs);
    else this.#link.leave();
    this.#changed();
  }

  #onPeerJoin(_peerId: string): void {
    if (this.status === 'closed') return;
    this.#send({ t: 'hello', v: PROTOCOL_VERSION, session: this.session, name: this.myName });
  }

  #onPeerLeave(peerId: string): void {
    if (peerId !== this.#peerId || this.status !== 'playing') return;
    if (this.game?.phase === 'ended') return;
    this.status = 'reconnecting';
    this.#timer = setTimeout(() => this.#close(CLOSE.timeout), this.#reconnectMs);
    this.#changed();
  }

  async #onMessage(data: unknown, peerId: string): Promise<void> {
    if (this.status === 'closed') return;
    const msg = parseMsg(data);
    if (!msg) return;
    if (msg.t === 'hello') return this.#onHello(msg, peerId);
    if (peerId !== this.#peerId) return; // 3人目や古い接続からは受け取らない
    switch (msg.t) {
      case 'setup':
        if (this.isHost) return;
        this.myRole = opp(msg.hostRole);
        this.names = msg.names;
        this.consult = msg.consult;
        this.status = 'playing';
        return this.#changed();
      case 'state':
        if (this.isHost) return;
        return this.#onState(msg.game);
      case 'commit':
        return this.#onCommit(msg.key, msg.hash);
      case 'reveal':
        return this.#onReveal(msg.key, msg.choice, msg.nonce);
      case 'ready':
        this.#ready.peer.add(msg.key);
        return this.#afterInput();
      case 'jikka':
        if (!this.isHost) return;
        this.#peerJikka = { key: msg.key, use: msg.use };
        return this.#afterInput();
      case 'chat':
        if (!this.peerRole || !this.game) return;
        this.chat.push({ from: this.peerRole, text: msg.text, round: this.game.round });
        return this.#changed();
      case 'bye':
        // 終わったあとの退出(結果画面へ移った)は知らせない
        return this.#close(this.game?.phase === 'ended' ? null : CLOSE.bye);
    }
  }

  #onHello(msg: Extract<Msg, { t: 'hello' }>, peerId: string): void {
    if (this.#peerSession === null) {
      // 最初の相手
      this.#peerSession = msg.session;
      this.#peerId = peerId;
      this.#peerName = msg.name;
      // 相手の onPeerJoin より先に届いた場合に備えて、こちらの hello も送り返す
      this.#send({ t: 'hello', v: PROTOCOL_VERSION, session: this.session, name: this.myName });
      if (this.isHost) this.#startGame();
      return this.#changed();
    }
    if (msg.session === this.#peerSession) {
      // 同じ相手が戻ってきた: 途中の選択を送り直して再開する
      this.#peerId = peerId;
      if (this.#timer) clearTimeout(this.#timer);
      this.#timer = null;
      if (this.status === 'reconnecting') this.status = 'playing';
      this.#resync();
      return this.#changed();
    }
    // 別の画面から入ってきた。途中なら、選び直しを防ぐため終了する
    if (this.game && this.game.phase !== 'ended') this.#close(CLOSE.rejoined);
  }

  #resync(): void {
    if (this.isHost) this.#sendSetupAndState();
    const key = this.key;
    if (!key) return;
    if (this.#mine?.key === key) {
      this.#send({ t: 'commit', key, hash: this.#mine.hash });
      if (this.#revealedKey === key) {
        this.#send({ t: 'reveal', key, choice: this.#mine.choice as ChoiceToken, nonce: this.#mine.nonce });
      }
    }
    if (this.#ready.mine.has(key)) this.#send({ t: 'ready', key });
  }

  // ---- コミット&リビール ------------------------------------------------

  #onCommit(key: string, hash: string): void {
    if (key !== this.key) return;
    if (this.#peerCommit?.key === key) {
      // 再接続での送り直しは同じハッシュのはず
      if (this.#peerCommit.hash !== hash) this.#close(CLOSE.badReveal);
      return;
    }
    this.#peerCommit = { key, hash };
    this.#maybeReveal();
    this.#changed();
  }

  /** 2人のコミットが揃ったら、自分の選択と nonce を明かす */
  #maybeReveal(): void {
    const key = this.key;
    if (!key || !this.#mine || this.#mine.key !== key || this.#peerCommit?.key !== key) return;
    if (this.#revealedKey === key) return;
    this.#revealedKey = key;
    this.#send({ t: 'reveal', key, choice: this.#mine.choice as ChoiceToken, nonce: this.#mine.nonce });
  }

  async #onReveal(key: string, choice: ChoiceToken, nonce: string): Promise<void> {
    const pc = this.#peerCommit;
    // 自分が明かす前の reveal は受け取らない(相手の選択を先に知ることはない)
    if (key !== this.key || pc?.key !== key || this.#revealedKey !== key) return;
    if (this.#peerChoice?.key === key) return;
    if (!(await verify(key, choice, nonce, pc.hash))) return this.#close(CLOSE.badReveal);
    const g = this.game;
    if (key !== this.key || !g || !this.peerRole) return;
    if (!this.#legal(g, this.peerRole, choice)) return this.#close(CLOSE.badMove);
    this.#peerChoice = { key, choice };
    this.#afterInput();
  }

  #legal(g: GameState, r: Role, token: ChoiceToken): boolean {
    if (g.phase === 'promise') {
      return (PROMISE_TOKENS as readonly string[]).includes(token) && legalPromises(g, r).includes(promiseOf(token as PromiseToken));
    }
    if (g.phase === 'action') {
      if (!(ACTION_TOKENS as readonly string[]).includes(token)) return false;
      const a = actionOf(token as ActionToken);
      return legalActions(g, r).includes(a.card) && (!a.overtime || canDeclareOvertime(g, r));
    }
    return false;
  }

  // ---- ホストの進行 --------------------------------------------------------

  #afterInput(): void {
    if (this.isHost) this.#advance();
    this.#changed();
  }

  #startGame(): void {
    if (this.game) return;
    const me = this.#hostRole;
    this.myRole = me;
    // 名前がかぶったら(初期値の候補が偶然同じなど)、相手の名前に「2」を付けて区別する
    const peerName = this.#peerName === this.myName ? `${this.#peerName}2` : this.#peerName;
    this.names = me === 'husband' ? { husband: this.myName, wife: peerName } : { husband: peerName, wife: this.myName };
    const seed = this.#seed ?? Number.parseInt(randomHex(4), 16);
    this.game = createGame({ seed, names: this.names });
    this.status = 'playing';
    this.#sendSetupAndState();
    this.#advance();
  }

  #sendSetupAndState(): void {
    if (!this.game || !this.names || !this.myRole) return;
    this.#send({ t: 'setup', hostRole: this.myRole, names: this.names, consult: this.consult });
    this.#send({ t: 'state', game: redact(this.game) });
  }

  #hostStep(input: GameInput): void {
    const before = this.game;
    if (!before) return;
    try {
      this.game = step(before, input);
    } catch (e) {
      if (e instanceof GameError) return this.#close(CLOSE.badMove);
      throw e;
    }
    this.#advance(before);
  }

  /** 揃ったものから進める。進んだら状態を送る */
  #advance(before: GameState | null = this.game): void {
    if (!this.isHost || this.status === 'closed') return;
    for (;;) {
      const g = this.game;
      const me = this.myRole;
      if (!g || !me) break;
      const key = phaseKey(g);
      const both = this.#ready.mine.has(key) && this.#ready.peer.has(key);
      let input: GameInput | null = null;
      switch (g.phase) {
        case 'event': {
          const holder = jikkaHolder(g);
          if (holder === null) input = { type: 'confirmEvent', useJikka: false };
          else if (holder !== me && this.#peerJikka?.key === key) input = { type: 'confirmEvent', useJikka: this.#peerJikka.use };
          break;
        }
        case 'consult':
          // 相談なしの部屋では、相談フェイズをそのまま終える
          if (both || !this.consult) input = { type: 'endConsult' };
          break;
        case 'promise':
        case 'action': {
          if (this.#mine?.key !== key || this.#peerChoice?.key !== key) break;
          const mine = this.#mine.choice as ChoiceToken;
          const theirs = this.#peerChoice.choice;
          const per = <T>(f: (t: ChoiceToken) => T): PerRole<T> =>
            me === 'husband' ? { husband: f(mine), wife: f(theirs) } : { husband: f(theirs), wife: f(mine) };
          input =
            g.phase === 'promise'
              ? { type: 'submitPromises', promises: per((t) => promiseOf(t as PromiseToken)) }
              : { type: 'submitActions', actions: per((t) => actionOf(t as ActionToken)) };
          break;
        }
        case 'resolved':
          if (both) input = { type: 'next' };
          break;
        case 'ended':
          break;
      }
      if (!input) break;
      try {
        this.game = step(g, input);
      } catch (e) {
        if (e instanceof GameError) return this.#close(CLOSE.badMove);
        throw e;
      }
    }
    if (this.game !== before && this.game) this.#send({ t: 'state', game: redact(this.game) });
    this.#changed();
  }

  // ---- ゲスト ------------------------------------------------------------

  #onState(next: GameState): void {
    const prev = this.game;
    if (prev && !this.#hostMatches(prev, next)) return this.#close(CLOSE.badHost);
    this.game = next;
    this.status = this.status === 'connecting' ? 'playing' : this.status;
    this.#changed();
  }

  /** ホストの処理結果が、2人が明かした選択と一致するか */
  #hostMatches(prev: GameState, next: GameState): boolean {
    const key = phaseKey(prev);
    if (phaseKey(next) === key) return true;
    if (this.#mine?.key !== key || this.#peerChoice?.key !== key || !this.myRole || !this.peerRole) return true;
    const mine = this.#mine.choice as ChoiceToken;
    const theirs = this.#peerChoice.choice;
    if (prev.phase === 'promise') {
      return next.phase === 'action' && next.promises[this.myRole] === mine && next.promises[this.peerRole] === theirs;
    }
    if (prev.phase === 'action') {
      const last = next.phase === 'resolved' || next.phase === 'ended' ? next.last : null;
      if (!last) return false;
      const tok = (r: Role): ActionToken => actionToken({ card: last.actions[r], overtime: last.overtimeUsedBy === r });
      return tok(this.myRole) === mine && tok(this.peerRole) === theirs;
    }
    return true;
  }
}
