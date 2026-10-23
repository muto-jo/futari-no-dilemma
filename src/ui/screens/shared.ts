// 1台で2人とAI戦の画面で共通の部品
import { PARAMS } from '../../engine/params.ts';
import { ROLES, type GameState, type PerRole, type Role } from '../../engine/types.ts';
import type { Nav, Screen } from '../app.ts';
import { describeEnding } from '../describe.ts';
import { button, h } from '../dom.ts';
import { eventCard, nameTag, panel, playerClass, roundResult } from '../parts.ts';
import { PROMISE_NAME, PROMISE_SPEECH, progressCard } from '../text.ts';

export function gameHeader(nav: Nav, g: GameState, self: Screen): HTMLElement {
  const quit = () => {
    if (g.phase === 'ended' || window.confirm('ゲームを中断してタイトルに戻りますか?')) nav.go({ name: 'title' });
  };
  return h(
    'header',
    { class: 'bar-head' },
    button('タイトルへ', quit, 'btn small ghost'),
    h('h1', null, g.phase === 'ended' ? 'ゲーム終了' : `第${g.round}ラウンド`),
    button('ルール', () => nav.go({ name: 'rules', back: self }), 'btn small ghost'),
  );
}

/** 実家ヘルプの「使う」ボタンの文言 */
export function jikkaLabel(weight: number): string {
  const after = Math.max(1, weight - 1);
  return after === weight ? `使う(重さ${weight}のまま)` : `使う(重さ${weight}→${after})`;
}

/** 思春期に入った最初のラウンドなら、そのお知らせ */
export function shishunkiNotice(g: GameState): HTMLElement | null {
  const enteredLate = g.lateGame && !g.history[g.history.length - 1]?.lateGame;
  if (!enteredLate) return null;
  const c = progressCard('P_SHISHUNKI');
  return h('section', { class: 'notice late' }, h('h3', null, `${c.name}カード`), h('p', null, c.text));
}

export function promiseReveal(g: Extract<GameState, { phase: 'action' }>, names: PerRole<string>): HTMLElement {
  return panel(
    '約束カードの公開',
    h(
      'ul',
      { class: 'reveal' },
      ROLES.map((r) => {
        const p = g.promises[r];
        return h(
          'li',
          { class: playerClass(r) },
          h('b', null, names[r]),
          `: 「${PROMISE_NAME(p)}」`,
          p ? h('span', { class: 'speech' }, ` ${PROMISE_SPEECH(p)}`) : null,
        );
      }),
    ),
  );
}

export interface Choice {
  readonly key: string;
  readonly label: string;
  readonly sub?: string;
}

/**
 * カードを1枚選んで「これに決める」。選んでいる途中の状態はこの部品の中に持つ。
 * 描き直しても選択を保ちたいときは initial と onSelect で外に預ける
 */
export function choicePanel(
  who: Role,
  names: PerRole<string>,
  title: string,
  choices: readonly Choice[],
  decide: (key: string) => void,
  keep: { initial?: string | null; onSelect?: (key: string) => void } = {},
): HTMLElement {
  let selected: string | null = choices.some((c) => c.key === keep.initial) ? keep.initial! : null;
  const ok = button('これに決める', () => selected !== null && decide(selected), 'btn primary big', {
    disabled: selected === null,
  });
  const buttons = choices.map((c) =>
    h(
      'button',
      {
        type: 'button',
        class: 'choice',
        'aria-pressed': String(c.key === selected),
        'data-key': c.key,
        onclick: () => {
          selected = c.key;
          keep.onSelect?.(c.key);
          for (const b of buttons) b.setAttribute('aria-pressed', String(b === buttonOf(c.key)));
          ok.disabled = false;
        },
      },
      h('span', { class: 'choice-label' }, c.label),
      c.sub ? h('span', { class: 'choice-sub' }, c.sub) : null,
    ),
  );
  const buttonOf = (key: string) => buttons[choices.findIndex((c) => c.key === key)];
  return panel(
    h('span', null, nameTag(who, names), ` ${title}`),
    h('div', { class: 'choices' }, buttons),
    h('div', { class: 'actions' }, ok),
  );
}

export function resolvedView(
  g: Extract<GameState, { phase: 'resolved' }>,
  names: PerRole<string>,
  next: () => void,
  /** オンラインで、相手を待っているときの表示 */
  waiting: string | null = null,
): HTMLElement {
  return h(
    'div',
    { class: 'phase' },
    eventCard(g.last.event, g.last.weight),
    roundResult(g.last, names),
    h(
      'div',
      { class: 'actions' },
      waiting ? h('p', { class: 'waiting' }, waiting) : button('次のラウンドへ', next, 'btn primary big'),
    ),
  );
}

export function endedView(g: Extract<GameState, { phase: 'ended' }>, names: PerRole<string>, toResult: () => void): HTMLElement {
  const t = describeEnding(g.ending, g.family, names);
  const sudachi = progressCard('P_SUDACHI');
  return h(
    'div',
    { class: 'phase' },
    g.last ? eventCard(g.last.event, g.last.weight) : null,
    g.last
      ? roundResult(g.last, names)
      : h('section', { class: 'notice late' }, h('h3', null, `${sudachi.name}カード`), h('p', null, sudachi.text)),
    h('section', { class: 'notice ending' }, h('h3', null, t.title), h('p', null, t.message)),
    h('div', { class: 'actions' }, button('結果を見る', toResult, 'btn primary big')),
  );
}

export function downNotices(g: Extract<GameState, { phase: 'consult' | 'promise' | 'action' }>, names: PerRole<string>): HTMLElement[] {
  return ROLES.filter((r) => g.turn.down[r]).map((r) =>
    h(
      'section',
      { class: 'notice down' },
      h(
        'p',
        null,
        nameTag(r, names),
        ` は疲労${PARAMS.downTired}以上でダウン中。このラウンドは家事ができません(約束は「あなたに頼む」、行動は「任せる」)。`,
      ),
    ),
  );
}
