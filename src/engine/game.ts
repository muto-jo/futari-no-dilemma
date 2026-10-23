import { buildDeck } from './deck.ts';
import { PARAMS, RANKS } from './params.ts';
import { Rng } from './rng.ts';
import {
  ROLES,
  opp,
  type ActionCard,
  type ActionChoice,
  type DeckCard,
  type Ending,
  type Explosion,
  type GameInput,
  type GameState,
  type Outcome,
  type PerRole,
  type PlayerState,
  type PromiseCard,
  type Rank,
  type Role,
  type RoleCard,
  type RoundLog,
  type ScoreBreakdown,
  type Turn,
} from './types.ts';

export class GameError extends Error {}

export const perRole = <T>(f: (r: Role) => T): PerRole<T> => ({ husband: f('husband'), wife: f('wife') });

export type GameBase = Omit<
  Extract<GameState, { phase: 'event' }>,
  'phase' | 'event'
>;

function baseOf(s: GameState): GameBase {
  return {
    seed: s.seed,
    rngState: s.rngState,
    deck: s.deck,
    deckPos: s.deckPos,
    round: s.round,
    lateGame: s.lateGame,
    family: s.family,
    players: s.players,
    history: s.history,
  };
}

export interface GameOptions {
  readonly seed: number;
  readonly names?: PerRole<string>;
  /** 役割カードを指定する(省略時はランダムに配る)。シミュレーションで Python と同じ割り当てにするため */
  readonly roleCards?: PerRole<RoleCard>;
  /** テスト用: 山札を差し替える */
  readonly deck?: readonly DeckCard[];
}

export function createGame(opts: GameOptions): GameState {
  const rng = new Rng(opts.seed);
  const deck = opts.deck ?? buildDeck(rng);
  const roleCards: PerRole<RoleCard> =
    opts.roleCards ??
    (rng.random() < 0.5
      ? { husband: 'overtime', wife: 'jikka' }
      : { husband: 'jikka', wife: 'overtime' });
  const names = opts.names ?? { husband: '夫', wife: '妻' };
  const players = perRole<PlayerState>((r) => ({
    name: names[r],
    free: 0,
    memory: 0,
    trust: 0,
    tired: 0,
    grudge: 0,
    roleCard: roleCards[r],
    roleCardUsed: false,
  }));
  return draw({
    seed: opts.seed,
    rngState: rng.state,
    deck,
    deckPos: 0,
    round: 0,
    lateGame: false,
    family: PARAMS.initialFamily,
    players,
    history: [],
  });
}

/** 山札をめくる。思春期なら終盤に入ってもう1枚、巣立ちなら終了 */
function draw(base: GameBase): GameState {
  let pos = base.deckPos;
  let lateGame = base.lateGame;
  for (;;) {
    const card = base.deck[pos];
    if (card === undefined) throw new GameError('山札が尽きました');
    pos++;
    if (card.kind === 'shishunki') {
      lateGame = true;
      continue;
    }
    const next = { ...base, deckPos: pos, lateGame };
    if (card.kind === 'sudachi') {
      return { ...next, phase: 'ended', last: null, ending: finishBySudachi(next) };
    }
    return { ...next, round: base.round + 1, phase: 'event', event: card };
  }
}

// ---- 役割カードと合法手 ----------------------------------------------

function holderOf(s: GameState, card: RoleCard): Role | null {
  return ROLES.find((r) => s.players[r].roleCard === card && !s.players[r].roleCardUsed) ?? null;
}

/** まだ実家ヘルプを使っていない持ち主 */
export const jikkaHolder = (s: GameState): Role | null => holderOf(s, 'jikka');
/** まだ残業を使っていない持ち主 */
export const overtimeHolder = (s: GameState): Role | null => holderOf(s, 'overtime');

export function canDeclareOvertime(s: GameState, r: Role): boolean {
  return s.phase === 'action' && overtimeHolder(s) === r && !s.turn.down[r];
}

export function legalPromises(s: GameState, r: Role): readonly PromiseCard[] {
  if (s.phase !== 'promise') return [];
  return s.turn.down[r] ? ['you'] : ['together', 'me', 'you'];
}

export function legalActions(s: GameState, r: Role): readonly ActionCard[] {
  if (s.phase !== 'action') return [];
  return s.turn.down[r] ? ['delegate'] : ['do', 'delegate'];
}

// ---- 進行 ---------------------------------------------------------------

export function step(s: GameState, input: GameInput): GameState {
  switch (input.type) {
    case 'confirmEvent': {
      if (s.phase !== 'event') throw wrongPhase(s, input);
      const holder = jikkaHolder(s);
      if (input.useJikka && holder === null) throw new GameError('実家ヘルプを使える人がいません');
      const weight = input.useJikka ? Math.max(1, s.event.weight - 1) : s.event.weight;
      const turn: Turn = {
        event: s.event,
        weight,
        jikkaUsedBy: input.useJikka ? holder : null,
        down: perRole((r) => s.players[r].tired >= PARAMS.downTired),
      };
      const players = input.useJikka && holder ? markUsed(s.players, holder) : s.players;
      return { ...baseOf(s), players, phase: 'consult', turn };
    }
    case 'endConsult': {
      if (s.phase !== 'consult') throw wrongPhase(s, input);
      return { ...baseOf(s), phase: 'promise', turn: s.turn, request: input.request ?? null };
    }
    case 'submitPromises': {
      if (s.phase !== 'promise') throw wrongPhase(s, input);
      for (const r of ROLES) {
        const p = input.promises[r];
        if (p !== null && !legalPromises(s, r).includes(p)) {
          throw new GameError(`${r}: ダウン中は「あなたに頼む」しか出せません`);
        }
        if (p === null && s.turn.down[r]) {
          throw new GameError(`${r}: ダウン中は「あなたに頼む」で固定です`);
        }
      }
      return { ...baseOf(s), phase: 'action', turn: s.turn, request: s.request, promises: input.promises };
    }
    case 'submitActions': {
      if (s.phase !== 'action') throw wrongPhase(s, input);
      for (const r of ROLES) {
        const a = input.actions[r];
        if (!legalActions(s, r).includes(a.card)) {
          throw new GameError(`${r}: ダウン中は「任せる」で固定です`);
        }
        if (a.overtime && (a.card !== 'delegate' || !canDeclareOvertime(s, r))) {
          throw new GameError(`${r}: 残業は宣言できません`);
        }
      }
      return resolve(s, input.actions);
    }
    case 'next': {
      if (s.phase !== 'resolved') throw wrongPhase(s, input);
      return draw(baseOf(s));
    }
  }
}

function wrongPhase(s: GameState, input: GameInput): GameError {
  return new GameError(`フェイズ ${s.phase} で ${input.type} はできません`);
}

function markUsed(players: PerRole<PlayerState>, r: Role): PerRole<PlayerState> {
  return { ...players, [r]: { ...players[r], roleCardUsed: true } };
}

// ---- 処理(SPEC 2.5)---------------------------------------------------

type ActionState = Extract<GameState, { phase: 'action' }>;

function resolve(s: ActionState, choices: PerRole<ActionChoice>): GameState {
  const { turn, promises } = s;
  const w = turn.weight;
  const act = perRole((r) => choices[r].card === 'do');
  const overtimeUsedBy = ROLES.find((r) => choices[r].overtime) ?? null;

  const tired = { husband: s.players.husband.tired, wife: s.players.wife.tired };
  const tiredGain = { husband: 0, wife: 0 };
  const memoryGain = { husband: 0, wife: 0 };
  const freeGain = { husband: 0, wife: 0 };
  const trustGain = { husband: 0, wife: 0 };
  const add = { husband: 0, wife: 0 };
  const rest = { husband: 0, wife: 0 };
  let familyDelta = 0;
  let outcome: Outcome;

  if (act.husband && act.wife) {
    familyDelta = w;
    for (const r of ROLES) {
      tiredGain[r] = Math.ceil(w / 2);
      memoryGain[r] = w;
    }
    const together = promises.husband === 'together' && promises.wife === 'together';
    if (together) for (const r of ROLES) trustGain[r] = PARAMS.trustTogether;
    outcome = { kind: 'bothDo', together };
  } else if (!act.husband && !act.wife) {
    familyDelta = -(w + 1);
    outcome = { kind: 'bothDelegate' };
  } else {
    const doer: Role = act.husband ? 'husband' : 'wife';
    const slacker = opp(doer);
    tiredGain[doer] = w;
    if (promises[doer] === 'me' && promises[slacker] === 'you') {
      rest[slacker] = PARAMS.restRecovery;
      for (const r of ROLES) trustGain[r] = PARAMS.trustSplit;
      outcome = { kind: 'agreed', doer, slacker };
    } else if (turn.down[slacker]) {
      familyDelta = -1;
      outcome = { kind: 'slackerDown', doer, slacker };
    } else if (overtimeUsedBy === slacker) {
      outcome = { kind: 'overtime', doer, slacker };
    } else {
      freeGain[slacker] = w;
      add[doer] += 1;
      outcome = { kind: 'plain', doer, slacker };
    }
  }

  // 睡眠と約束破り
  const promiseBroken: Role[] = [];
  for (const r of ROLES) {
    tired[r] = Math.max(0, tired[r] + tiredGain[r] - rest[r] - PARAMS.sleepRecovery);
    const p = promises[r];
    if ((p === 'together' || p === 'me') && !act[r]) {
      add[opp(r)] = Math.max(add[opp(r)], PARAMS.promiseBreakGrudge);
      promiseBroken.push(r);
    }
  }

  const players = {
    husband: { ...s.players.husband },
    wife: { ...s.players.wife },
  };
  for (const r of ROLES) {
    const p = players[r];
    p.tired = tired[r];
    p.memory += memoryGain[r];
    p.free += freeGain[r];
    p.trust += trustGain[r];
    p.grudge += add[r];
    if (overtimeUsedBy === r) p.roleCardUsed = true;
  }
  const family = s.family + familyDelta;

  // 不満チェック(夫→妻の順)
  const explosions: Explosion[] = [];
  let divorceCauser: Role | null = null;
  for (const r of ROLES) {
    if (players[r].grudge < PARAMS.grudgeLimit) continue;
    const causer = opp(r);
    if (s.lateGame) {
      divorceCauser = causer;
      break;
    }
    const before = players[causer].free;
    players[causer].free = Math.floor(before / 2);
    players[r].grudge = 0;
    explosions.push({ victim: r, causer, freeLost: before - players[causer].free });
  }

  const log: RoundLog = {
    round: s.round,
    lateGame: s.lateGame,
    event: turn.event,
    weight: w,
    jikkaUsedBy: turn.jikkaUsedBy,
    down: turn.down,
    request: s.request,
    promises,
    actions: perRole((r) => choices[r].card),
    overtimeUsedBy,
    outcome,
    familyDelta,
    familyAfter: family,
    tiredGain,
    rest,
    tiredAfter: tired,
    memoryGain,
    freeGain,
    trustGain,
    grudgeAdded: add,
    promiseBroken,
    explosions,
  };
  const base: GameBase = { ...baseOf(s), players, family, history: [...s.history, log] };

  if (divorceCauser !== null) {
    return { ...base, phase: 'ended', last: log, ending: finishByDivorce(base, divorceCauser) };
  }
  if (family <= 0) {
    return { ...base, phase: 'ended', last: log, ending: finishByCollapse(base) };
  }
  return { ...base, phase: 'resolved', last: log };
}

// ---- 終了と得点(SPEC 2.6)---------------------------------------------

function breakdown(p: PlayerState, bonus: number, total?: number): ScoreBreakdown {
  const satisfaction = p.free + p.memory + p.trust - p.tired;
  return {
    free: p.free,
    memory: p.memory,
    trust: p.trust,
    tired: p.tired,
    satisfaction,
    bonus,
    total: total ?? satisfaction + bonus,
  };
}

export function rankOf(total: number): Rank {
  const found = RANKS.find((x) => total >= x.min);
  return (found ?? RANKS[RANKS.length - 1]!).rank;
}

function finishBySudachi(base: GameBase): Ending {
  const success = base.family >= PARAMS.successFamily;
  const bonus = success ? PARAMS.successBonus : 0;
  const scores = perRole((r) => breakdown(base.players[r], bonus));
  const familyTotal = scores.husband.total + scores.wife.total;
  const best = Math.max(scores.husband.total, scores.wife.total);
  return {
    kind: success ? 'success' : 'completed',
    causer: null,
    scores,
    familyTotal,
    rank: rankOf(familyTotal),
    mvp: success ? ROLES.filter((r) => scores[r].total === best) : [],
  };
}

function finishByCollapse(base: GameBase): Ending {
  return {
    kind: 'collapse',
    causer: null,
    scores: perRole((r) => breakdown(base.players[r], 0, 0)),
    familyTotal: 0,
    rank: null,
    mvp: [],
  };
}

function finishByDivorce(base: GameBase, causer: Role): Ending {
  const scores = perRole((r) => breakdown(base.players[r], 0, r === causer ? PARAMS.divorcePenalty : 0));
  return {
    kind: 'divorce',
    causer,
    scores,
    familyTotal: scores.husband.total + scores.wife.total,
    rank: null,
    mvp: [],
  };
}
