// オンライン対戦のメッセージ。相手から届くものはすべて信用せず、形を確かめてから使う
import type { ActionChoice, GameState, PerRole, PromiseCard, Role } from '../engine/types.ts';

export const PROTOCOL_VERSION = 1;
export const CHAT_MAX = 40;

/** 約束カード・行動カードの選択を、コミットに使う1語で表す */
export type PromiseToken = 'together' | 'me' | 'you';
export type ActionToken = 'do' | 'delegate' | 'overtime';
export type ChoiceToken = PromiseToken | ActionToken;

export const PROMISE_TOKENS: readonly PromiseToken[] = ['together', 'me', 'you'];
export const ACTION_TOKENS: readonly ActionToken[] = ['do', 'delegate', 'overtime'];

export const promiseOf = (t: PromiseToken): PromiseCard => t;
export const actionOf = (t: ActionToken): ActionChoice =>
  t === 'overtime' ? { card: 'delegate', overtime: true } : { card: t };
export const actionToken = (a: ActionChoice): ActionToken => (a.overtime ? 'overtime' : a.card);

export type Preset = 'ask' | 'ok' | 'no';
export const PRESET_TEXT: Readonly<Record<Preset, string>> = {
  ask: 'お願いしていい?',
  ok: 'やるよー',
  no: 'ごめん、無理',
};

export type Msg =
  /** つながったら互いに送る。session はページを開いている間だけ同じ */
  | { readonly t: 'hello'; readonly v: number; readonly session: string; readonly name: string }
  /** ホスト → ゲスト: 役と名前、相談フェイズを使うか */
  | { readonly t: 'setup'; readonly hostRole: Role; readonly names: PerRole<string>; readonly consult: boolean }
  /** ホスト → ゲスト: ゲームの状態(山札と seed は伏せる) */
  | { readonly t: 'state'; readonly game: GameState }
  | { readonly t: 'commit'; readonly key: string; readonly hash: string }
  | { readonly t: 'reveal'; readonly key: string; readonly choice: ChoiceToken; readonly nonce: string }
  /** 相談終了・次のラウンドへ */
  | { readonly t: 'ready'; readonly key: string }
  /** 実家ヘルプを使うか(持ち主がゲストのとき) */
  | { readonly t: 'jikka'; readonly key: string; readonly use: boolean }
  | { readonly t: 'chat'; readonly text: string; readonly preset: Preset | null }
  /** 自分から退出した */
  | { readonly t: 'bye' };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown, max = 200): x is string => typeof x === 'string' && x.length <= max;
const isRole = (x: unknown): x is Role => x === 'husband' || x === 'wife';
const isHex = (x: unknown, len: number): x is string => typeof x === 'string' && new RegExp(`^[0-9a-f]{${len}}$`).test(x);
const isKey = (x: unknown): x is string => typeof x === 'string' && /^\d{1,3}:[a-z]{1,10}$/.test(x);

/** 届いたデータを Msg として確かめる。おかしなものは null */
export function parseMsg(data: unknown): Msg | null {
  if (!isObj(data) || typeof data.t !== 'string') return null;
  switch (data.t) {
    case 'hello':
      return data.v === PROTOCOL_VERSION && isHex(data.session, 32) && isStr(data.name, 24) && data.name.trim() !== ''
        ? { t: 'hello', v: data.v, session: data.session, name: data.name.trim().slice(0, 12) }
        : null;
    case 'setup': {
      const names = data.names;
      if (!isRole(data.hostRole) || !isObj(names) || !isStr(names.husband, 24) || !isStr(names.wife, 24)) return null;
      // consult がない(古い版のホスト)は相談ありとして扱う
      const consult = data.consult !== false;
      return { t: 'setup', hostRole: data.hostRole, names: { husband: names.husband, wife: names.wife }, consult };
    }
    case 'state':
      // 状態はホストのエンジンが作ったもの。画面が使う最低限の形だけ確かめる
      return isObj(data.game) && typeof data.game.phase === 'string' && isObj(data.game.players) && Array.isArray(data.game.history)
        ? { t: 'state', game: data.game as unknown as GameState }
        : null;
    case 'commit':
      return isKey(data.key) && isHex(data.hash, 64) ? { t: 'commit', key: data.key, hash: data.hash } : null;
    case 'reveal': {
      const c = data.choice;
      const ok = (PROMISE_TOKENS as readonly unknown[]).includes(c) || (ACTION_TOKENS as readonly unknown[]).includes(c);
      return isKey(data.key) && ok && isHex(data.nonce, 32)
        ? { t: 'reveal', key: data.key, choice: c as ChoiceToken, nonce: data.nonce }
        : null;
    }
    case 'ready':
      return isKey(data.key) ? { t: 'ready', key: data.key } : null;
    case 'jikka':
      return isKey(data.key) && typeof data.use === 'boolean' ? { t: 'jikka', key: data.key, use: data.use } : null;
    case 'chat': {
      const preset = data.preset === 'ask' || data.preset === 'ok' || data.preset === 'no' ? data.preset : null;
      if (preset) return { t: 'chat', text: PRESET_TEXT[preset], preset };
      return isStr(data.text, CHAT_MAX) && data.text.trim() !== '' ? { t: 'chat', text: data.text.trim(), preset: null } : null;
    }
    case 'bye':
      return { t: 'bye' };
    default:
      return null;
  }
}
