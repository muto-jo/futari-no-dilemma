// 1台で2人(SPEC 5.1)の進行。約束カードと行動カードを1人ずつ伏せて選ぶ手順を持つ。
// 選んだ内容は private に置き、画面に渡す stage には含めない(前の人の選択が見えないように)
import { canDeclareOvertime, createGame, legalActions, legalPromises, step } from '../engine/game.ts';
import { ROLES, type ActionChoice, type GameState, type PerRole, type PromiseCard, type Role } from '../engine/types.ts';

export type SecretStage =
  /** 伏せて選ぶ手順の外(フェイズの通常表示) */
  | { readonly kind: 'idle' }
  /** 「◯◯の番です。△△は画面を見ないでください」 */
  | { readonly kind: 'handoff'; readonly who: Role }
  /** 選んでいるところ */
  | { readonly kind: 'choose'; readonly who: Role }
  /** 「選びました。スマホを渡してください」 */
  | { readonly kind: 'passed'; readonly who: Role; readonly next: Role }
  /** 「2人とも選びました」 */
  | { readonly kind: 'allChosen' };

export class Hotseat {
  game: GameState;
  stage: SecretStage = { kind: 'idle' };
  readonly names: PerRole<string>;
  #promises: Partial<Record<Role, PromiseCard>> = {};
  #actions: Partial<Record<Role, ActionChoice>> = {};
  #order: Role[] = [];

  constructor(game: GameState, names: PerRole<string>) {
    this.game = game;
    this.names = names;
  }

  static start(names: PerRole<string>, seed: number): Hotseat {
    return new Hotseat(createGame({ seed, names }), names);
  }

  confirmEvent(useJikka: boolean): void {
    this.game = step(this.game, { type: 'confirmEvent', useJikka });
  }

  endConsult(): void {
    this.game = step(this.game, { type: 'endConsult' });
  }

  /** 約束カード・行動カードを選ぶ手順を始める。ダウン中の人は固定なので飛ばす */
  startSecret(): void {
    const g = this.game;
    if (g.phase !== 'promise' && g.phase !== 'action') throw new Error(`startSecret in ${g.phase}`);
    this.#promises = {};
    this.#actions = {};
    this.#order = [];
    for (const r of ROLES) {
      if (g.turn.down[r]) {
        if (g.phase === 'promise') this.#promises[r] = 'you';
        else this.#actions[r] = { card: 'delegate' };
      } else {
        this.#order.push(r);
      }
    }
    const first = this.#order[0];
    this.stage = first ? { kind: 'handoff', who: first } : { kind: 'allChosen' };
  }

  /** 選ぶ人が画面を受け取った */
  ready(): void {
    if (this.stage.kind !== 'handoff') throw new Error('ready');
    this.stage = { kind: 'choose', who: this.stage.who };
  }

  /** いま選んでいる人の選べるカード */
  choosingPromises(): readonly PromiseCard[] {
    return this.stage.kind === 'choose' ? legalPromises(this.game, this.stage.who) : [];
  }

  choosingActions(): readonly ActionChoice[] {
    if (this.stage.kind !== 'choose') return [];
    const who = this.stage.who;
    const list: ActionChoice[] = legalActions(this.game, who).map((card) => ({ card }));
    if (canDeclareOvertime(this.game, who)) list.push({ card: 'delegate', overtime: true });
    return list;
  }

  pickPromise(p: PromiseCard): void {
    if (this.stage.kind !== 'choose' || !this.choosingPromises().includes(p)) throw new Error('pickPromise');
    this.#promises[this.stage.who] = p;
    this.#advance(this.stage.who);
  }

  pickAction(a: ActionChoice): void {
    if (this.stage.kind !== 'choose') throw new Error('pickAction');
    const ok = this.choosingActions().some((x) => x.card === a.card && !!x.overtime === !!a.overtime);
    if (!ok) throw new Error('pickAction');
    this.#actions[this.stage.who] = a;
    this.#advance(this.stage.who);
  }

  #advance(who: Role): void {
    const next = this.#order[this.#order.indexOf(who) + 1];
    this.stage = next ? { kind: 'passed', who, next } : { kind: 'allChosen' };
  }

  /** 次の人に渡した */
  passOn(): void {
    if (this.stage.kind !== 'passed') throw new Error('passOn');
    this.stage = { kind: 'handoff', who: this.stage.next };
  }

  /** 同時に公開 */
  reveal(): void {
    if (this.stage.kind !== 'allChosen') throw new Error('reveal');
    const g = this.game;
    if (g.phase === 'promise') {
      const { husband, wife } = this.#promises;
      if (!husband || !wife) throw new Error('promises missing');
      this.game = step(g, { type: 'submitPromises', promises: { husband, wife } });
    } else {
      const { husband, wife } = this.#actions;
      if (!husband || !wife) throw new Error('actions missing');
      this.game = step(g, { type: 'submitActions', actions: { husband, wife } });
    }
    this.#promises = {};
    this.#actions = {};
    this.stage = { kind: 'idle' };
  }

  next(): void {
    this.game = step(this.game, { type: 'next' });
  }
}
