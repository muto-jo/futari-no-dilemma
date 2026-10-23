import { createGame, step } from '../src/engine/game.ts';
import type {
  ActionChoice,
  ConsultRequest,
  DeckCard,
  EventCard,
  GameState,
  PerRole,
  PlayerState,
  PromiseCard,
  Role,
  RoleCard,
} from '../src/engine/types.ts';

export const ev = (weight: 1 | 2 | 3, id = `T${weight}`): EventCard => ({
  kind: 'event',
  id,
  name: `テスト${weight}`,
  weight,
  flavor: '',
});

export interface Setup {
  weight?: 1 | 2 | 3;
  family?: number;
  lateGame?: boolean;
  players?: Partial<Record<Role, Partial<PlayerState>>>;
  roleCards?: PerRole<RoleCard>;
  /** 1枚目のあとに続く山札(既定は 重さ1 → 巣立ち) */
  rest?: DeckCard[];
}

/** 1枚目の家事を公開した状態(event フェイズ)を作る */
export function setup(o: Setup = {}): Extract<GameState, { phase: 'event' }> {
  const s = createGame({
    seed: 1,
    deck: [ev(o.weight ?? 2), ...(o.rest ?? [ev(1), { kind: 'sudachi' }])],
    roleCards: o.roleCards ?? { husband: 'overtime', wife: 'jikka' },
  });
  if (s.phase !== 'event') throw new Error('setup');
  return {
    ...s,
    family: o.family ?? s.family,
    lateGame: o.lateGame ?? s.lateGame,
    players: {
      husband: { ...s.players.husband, ...o.players?.husband },
      wife: { ...s.players.wife, ...o.players?.wife },
    },
  };
}

export type Act = 'do' | 'delegate' | 'overtime';
const choice = (a: Act): ActionChoice =>
  a === 'overtime' ? { card: 'delegate', overtime: true } : { card: a };

export interface Round {
  jikka?: boolean;
  request?: ConsultRequest | null;
  promises?: [PromiseCard | null, PromiseCard | null];
  actions: [Act, Act];
}

/** event フェイズから1ラウンド処理する。promises/actions は [夫, 妻] */
export function playRound(s: GameState, r: Round): GameState {
  let x = step(s, { type: 'confirmEvent', useJikka: r.jikka ?? false });
  x = step(x, { type: 'endConsult', request: r.request ?? null });
  const [ph, pw] = r.promises ?? ['together', 'together'];
  x = step(x, { type: 'submitPromises', promises: { husband: ph, wife: pw } });
  return step(x, {
    type: 'submitActions',
    actions: { husband: choice(r.actions[0]), wife: choice(r.actions[1]) },
  });
}

export function lastLog(s: GameState) {
  const l = s.history[s.history.length - 1];
  if (!l) throw new Error('no log');
  return l;
}

/** テストで状態が書き換えられていないか確かめるため */
export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
