// AIと対戦(SPEC 5.2)の進行。AIの判断は engine/ai の関数をそのまま使う。
// AIの約束と行動は private に置き、人間が選び終えてから同時に公開する
import { aiAccepts, aiAction, aiUsesJikka, aiWantsRequest, promisesFrom, settleRequests } from '../engine/ai/play.ts';
import { strategy, type Strategy } from '../engine/ai/strategies.ts';
import { createGame, jikkaHolder, legalActions, legalPromises, canDeclareOvertime, step } from '../engine/game.ts';
import { Rng } from '../engine/rng.ts';
import {
  ROLES,
  opp,
  type ActionChoice,
  type ConsultRequest,
  type GameState,
  type PerRole,
  type PromiseCard,
  type Role,
} from '../engine/types.ts';

export type AiTypeId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface AiType {
  readonly id: AiTypeId;
  readonly label: string;
  /** engine/ai/strategies.ts の戦略名 */
  readonly strategy: string;
  /** 結果画面で明かす説明 */
  readonly description: string;
}

export const AI_TYPES: readonly AiType[] = [
  { id: 'A', label: '思いやりさん', strategy: '思いやり', description: '疲れたら頼む、頼まれたら受ける、約束を守る' },
  { id: 'B', label: '頑張りすぎさん', strategy: '頑張りすぎ', description: '頼まれたら全部受けるが、自分からは頼まない' },
  { id: 'C', label: 'きっちり半分さん', strategy: '約束交代', description: '毎回「今日は私、次はあなた」と約束する' },
  { id: 'D', label: '黙ってお返しさん', strategy: 'しっぺ返し', description: '相談しない。前回あなたがしたことを返す' },
  { id: 'E', label: 'ふざけ屋さん', strategy: 'ふざけパパ', description: '約束はするが、4回に1回破る' },
  { id: 'F', label: '甘え上手さん', strategy: '甘え上手', description: '毎回お願いしてくる。頼まれても断る' },
];

export const aiType = (id: AiTypeId): AiType => AI_TYPES.find((t) => t.id === id)!;

/** 相談のやり取り。speaker が null なら進行役の説明 */
export interface ConsultLine {
  readonly speaker: Role | null;
  readonly text: string;
}

export type ConsultStage =
  /** 人間が「お願いする」か決める */
  | { readonly kind: 'open' }
  /** AIから頼まれている。alsoRequest は「私も休みたい」と言えるか */
  | { readonly kind: 'aiAsks'; readonly alsoRequest: boolean }
  /** 相談がまとまった */
  | { readonly kind: 'done'; readonly request: ConsultRequest | null };

export const ASK = '疲れたからお願いしていい?';
export const ACCEPT = 'いいよー、私がやる';
export const DECLINE = 'ごめん、今回は一緒にやろう';

export interface AiMatchOptions {
  readonly humanRole: Role;
  readonly humanName: string;
  /** null は「おまかせ」(タイプは対戦後に明かす) */
  readonly typeId: AiTypeId | null;
  readonly seed: number;
}

export class AiMatch {
  game: GameState;
  readonly human: Role;
  readonly ai: Role;
  readonly type: AiType;
  /** 「おまかせ」で選んだ(結果画面まで伏せる) */
  readonly surprise: boolean;
  readonly names: PerRole<string>;
  stage: ConsultStage | null = null;
  lines: ConsultLine[] = [];
  #rng: Rng;
  #strategy: Strategy;
  #aiWants = false;
  #aiPromise: PromiseCard | null = null;

  constructor(opts: AiMatchOptions) {
    // エンジンの乱数とAIの乱数は分ける
    const seeds = new Rng(opts.seed);
    this.#rng = new Rng(seeds.uint32());
    this.human = opts.humanRole;
    this.ai = opp(opts.humanRole);
    this.surprise = opts.typeId === null;
    this.type = opts.typeId ? aiType(opts.typeId) : this.#rng.pick(AI_TYPES);
    this.#strategy = strategy(this.type.strategy);
    const aiName = this.surprise ? 'AI' : this.type.label;
    this.names = this.human === 'husband' ? { husband: opts.humanName, wife: aiName } : { husband: aiName, wife: opts.humanName };
    this.game = createGame({ seed: seeds.uint32(), names: this.names });
  }

  /** 人間が実家ヘルプを持っていて、まだ使っていない */
  humanHasJikka(): boolean {
    return this.game.phase === 'event' && jikkaHolder(this.game) === this.human;
  }

  /** イベント公開を確定する。AIが実家ヘルプを持っていれば、AIのルールで使う */
  confirmEvent(humanUsesJikka: boolean): void {
    const g = this.game;
    if (g.phase !== 'event') throw new Error('confirmEvent');
    const useJikka = jikkaHolder(g) === this.human ? humanUsesJikka : aiUsesJikka(g, this.ai);
    this.game = step(g, { type: 'confirmEvent', useJikka });
    this.#startConsult();
  }

  #consultState() {
    const g = this.game;
    if (g.phase !== 'consult') throw new Error(`not consult: ${g.phase}`);
    return g;
  }

  #say(speaker: Role | null, text: string) {
    this.lines.push({ speaker, text });
  }

  #startConsult(): void {
    const s = this.#consultState();
    const { human, ai, names } = this;
    this.lines = [];
    if (s.turn.jikkaUsedBy === ai) this.#say(null, `${names[ai]}が実家ヘルプを使い、重さが${s.turn.weight}になりました。`);
    if (s.turn.down[ai]) this.#say(null, `${names[ai]}はダウン中です。`);
    this.#aiWants = aiWantsRequest(s, ai, this.#strategy, this.#rng);
    if (s.turn.down[human]) {
      this.#say(null, `${names[human]}はダウン中なので、休ませてもらいます。`);
      this.#say(human, ASK);
      this.#settle(true);
      return;
    }
    if (this.#aiWants) {
      this.#say(ai, ASK);
      this.stage = { kind: 'aiAsks', alsoRequest: true };
    } else {
      this.stage = { kind: 'open' };
    }
  }

  /** 「お願いする(休みたい)」/ AIに頼まれているときの「私も休みたい」 */
  humanRequests(): void {
    const st = this.stage;
    if (st?.kind === 'open') this.#say(this.human, ASK);
    else if (st?.kind === 'aiAsks' && st.alsoRequest) this.#say(this.human, 'ごめん、私も休みたい…');
    else throw new Error('humanRequests');
    this.#settle(true);
  }

  /** お願いしないで進む */
  skipRequest(): void {
    if (this.stage?.kind !== 'open') throw new Error('skipRequest');
    this.stage = { kind: 'done', request: null };
  }

  /** AIのお願いに答える */
  answer(accept: boolean): void {
    if (this.stage?.kind !== 'aiAsks') throw new Error('answer');
    this.#say(this.human, accept ? 'いいよー' : 'ごめん');
    this.#finish({ from: this.ai, accepted: accept });
  }

  /** 2人とも休みたいときの扱いは dilemma_c.py の play() に合わせる(settleRequests) */
  #settle(humanWants: boolean): void {
    const s = this.#consultState();
    const { human, ai, names } = this;
    const wants = perRoleOf(human, humanWants, this.#aiWants);
    const settled = settleRequests(s, wants, this.#rng);
    const requester = ROLES.find((r) => settled[r] && !settled[opp(r)]);
    if (requester === undefined) {
      this.#say(null, '2人とも休みが必要な状態なので、お願いは成り立ちません。');
      this.#finish(null);
      return;
    }
    if (wants.husband && wants.wife) {
      const same = s.players.husband.tired === s.players.wife.tired;
      this.#say(
        null,
        same
          ? `2人とも同じくらい疲れています。今回は${names[requester]}がお願いすることに。`
          : `疲れているのは${names[requester]}のほうなので、${names[requester]}がお願いします。`,
      );
    }
    if (requester === human) {
      const accepted = aiAccepts(s, ai, this.#strategy, this.#rng);
      if (s.turn.down[ai]) this.#say(ai, 'ごめん、今は無理…');
      else if (this.#strategy.accept === null) this.#say(ai, '……');
      else this.#say(ai, accepted ? ACCEPT : DECLINE);
      this.#finish({ from: human, accepted });
      return;
    }
    // AIがお願いする
    if (s.turn.down[human]) {
      this.#say(ai, ASK);
      this.#say(null, `${names[human]}はダウン中なので、引き受けられません。`);
      this.#finish({ from: ai, accepted: false });
      return;
    }
    this.stage = { kind: 'aiAsks', alsoRequest: false };
  }

  #finish(request: ConsultRequest | null): void {
    const { names } = this;
    if (request?.accepted) {
      this.#say(
        null,
        `お願い成立。${names[request.from]}は「あなたに頼む」、${names[opp(request.from)]}は「私がやる」を出すのが合意の形です。`,
      );
    } else if (request) {
      this.#say(null, 'お願いは不成立。');
    }
    this.stage = { kind: 'done', request };
  }

  /** 相談を終えて約束カードへ。AIの約束カードはここで決める(公開はまだ) */
  endConsult(): void {
    const s = this.#consultState();
    if (this.stage?.kind !== 'done') throw new Error('consult not done');
    const request = this.stage.request;
    this.#aiPromise = promisesFrom(s, request, perRoleOf(this.human, null, this.#strategy))[this.ai];
    this.game = step(s, { type: 'endConsult', request });
    this.stage = null;
  }

  humanPromises(): readonly PromiseCard[] {
    return legalPromises(this.game, this.human);
  }

  /** 人間が約束カードを決めたら、AIの約束カードと同時に公開する */
  choosePromise(p: PromiseCard): void {
    if (!this.humanPromises().includes(p)) throw new Error('choosePromise');
    this.game = step(this.game, {
      type: 'submitPromises',
      promises: perRoleOf(this.human, p, this.#aiPromise),
    });
  }

  humanActions(): readonly ActionChoice[] {
    const list: ActionChoice[] = legalActions(this.game, this.human).map((card) => ({ card }));
    if (canDeclareOvertime(this.game, this.human)) list.push({ card: 'delegate', overtime: true });
    return list;
  }

  /** 人間が行動カードを決めたら、AIの行動を決めて同時に公開する */
  chooseAction(a: ActionChoice): void {
    const g = this.game;
    if (g.phase !== 'action') throw new Error('chooseAction');
    if (!this.humanActions().some((x) => x.card === a.card && !!x.overtime === !!a.overtime)) {
      throw new Error('chooseAction');
    }
    const aiChoice = aiAction(g, this.ai, this.#strategy, this.#rng);
    this.game = step(g, { type: 'submitActions', actions: perRoleOf(this.human, a, aiChoice) });
  }

  next(): void {
    this.game = step(this.game, { type: 'next' });
    this.lines = [];
  }
}

function perRoleOf<T>(human: Role, humanValue: T, aiValue: T): PerRole<T> {
  return human === 'husband' ? { husband: humanValue, wife: aiValue } : { husband: aiValue, wife: humanValue };
}
