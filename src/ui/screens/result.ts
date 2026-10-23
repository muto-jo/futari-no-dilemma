import { ROLES, type GameState, type PerRole, type ScoreBreakdown } from '../../engine/types.ts';
import { AI_TYPES, type AiMatch } from '../aiMatch.ts';
import type { Nav } from '../app.ts';
import { describeEnding } from '../describe.ts';
import { button, h } from '../dom.ts';
import { familyChart, logView, nameTag, panel, playerClass } from '../parts.ts';
import { factsOf, TIRED_SIGN } from '../reflect.ts';

/** 振り返りの問いと、考える手がかりになる事実(数字を並べるだけにして、良し悪しは言わない) */
function reflection(g: Extract<GameState, { phase: 'ended' }>, names: PerRole<string>, ai: AiMatch | null): HTMLElement {
  const f = factsOf(g.history);
  const per = (fn: (r: (typeof ROLES)[number]) => string) => ROLES.map((r) => `${names[r]} ${fn(r)}`).join(' / ');
  const facts = (items: string[]) => h('ul', { class: 'facts' }, items.map((x) => h('li', null, x)));
  const rested = ROLES.filter((r) => f.players[r].rested > 0).map((r) => `${names[r]}が休めたのが${f.players[r].rested}回`);
  const firstTired = (r: (typeof ROLES)[number]) => {
    const n = f.players[r].firstTired;
    return n === null ? `${TIRED_SIGN}以上にはならなかった` : `第${n}ラウンド`;
  };
  const kept = (r: (typeof ROLES)[number]) => {
    const p = f.players[r];
    return p.promised === 0 ? '約束カードなし' : `${p.promised}回中${p.kept}回`;
  };

  return panel(
    '振り返り',
    h(
      'ol',
      { class: 'questions' },
      h(
        'li',
        null,
        h('p', { class: 'question' }, 'あなたが「お願い」を言い出せなかった場面はありましたか?'),
        facts([
          `お願い成立: ${f.agreed}回${rested.length ? `(${rested.join('、')})` : ''}`,
          `ダウン: ${per((r) => `${f.players[r].downs}回`)}`,
        ]),
      ),
      h(
        'li',
        null,
        h('p', { class: 'question' }, '相手の疲労トークンに気づいたのはいつでしたか?'),
        facts([
          `疲労が初めて${TIRED_SIGN}以上になったのは: ${per(firstTired)}`,
          `疲労の最大: ${per((r) => String(f.players[r].maxTired))}`,
        ]),
      ),
      h(
        'li',
        null,
        h('p', { class: 'question' }, '実際の家では、どのタイプに近いですか?'),
        facts([
          `「一緒にやる」「私がやる」のとおりに動けた: ${per(kept)}`,
          `「やる」を出した: ${per((r) => `${f.players[r].did}回`)}(全${f.rounds}ラウンド)`,
          `家事で増えた疲労の合計: ${per((r) => String(f.players[r].load))}`,
        ]),
        h(
          'details',
          { class: 'types' },
          h('summary', null, ai ? 'ほかのタイプも見る' : 'タイプの例(AIと対戦の6タイプ)'),
          h(
            'ul',
            null,
            AI_TYPES.map((t) => h('li', null, h('b', null, `${t.id} ${t.label}`), ` ${t.description}`)),
          ),
        ),
      ),
    ),
  );
}

/** マイナスは全角の「−」で表す(ほかの表示とそろえる) */
const num = (n: number) => (n < 0 ? `−${-n}` : String(n));

const ROWS: [string, (s: ScoreBreakdown) => string][] = [
  ['自由時間', (s) => num(s.free)],
  ['思い出', (s) => num(s.memory)],
  ['信頼', (s) => num(s.trust)],
  ['残った疲労', (s) => (s.tired ? `−${s.tired}` : '0')],
  ['満足度', (s) => num(s.satisfaction)],
  ['家族成功ボーナス', (s) => (s.bonus ? `+${s.bonus}` : '—')],
];

export function renderResult(
  nav: Nav,
  g: Extract<GameState, { phase: 'ended' }>,
  names: PerRole<string>,
  ai: AiMatch | null,
  online = false,
): HTMLElement {
  const e = g.ending;
  const t = describeEnding(e, g.family, names);
  const finishedNormally = e.kind === 'success' || e.kind === 'completed';

  const table = h(
    'table',
    { class: 'score-table' },
    h('thead', null, h('tr', null, h('th', null, ''), ROLES.map((r) => h('th', { class: playerClass(r) }, names[r])))),
    h(
      'tbody',
      null,
      finishedNormally ? ROWS.map(([label, f]) => h('tr', null, h('th', null, label), ROLES.map((r) => h('td', null, f(e.scores[r]))))) : null,
      h('tr', { class: 'total' }, h('th', null, '得点'), ROLES.map((r) => h('td', null, num(e.scores[r].total)))),
    ),
  );

  return h(
    'main',
    { class: 'screen' },
    h('header', { class: 'bar-head' }, h('h1', null, '結果')),
    h(
      'section',
      { class: `result-head ${e.kind}` },
      h('h2', null, t.title),
      h('p', null, t.message),
      e.rank
        ? h('div', { class: 'rank' }, h('span', null, '家族ランク'), h('b', null, e.rank), h('span', null, `2人の合計 ${num(e.familyTotal)}点`))
        : null,
      e.mvp.length === 1 ? h('p', { class: 'mvp' }, '今回のMVP: ', nameTag(e.mvp[0]!, names)) : null,
      e.mvp.length === 2 ? h('p', { class: 'mvp' }, '今回のMVP: 2人とも(同点)') : null,
    ),
    ai
      ? panel(
          '相手のAI',
          ai.surprise ? h('p', { class: 'note' }, 'おまかせで選ばれていたのは……') : null,
          h('p', { class: 'ai-reveal' }, h('b', null, `${ai.type.id} ${ai.type.label}`)),
          h('p', null, ai.type.description),
        )
      : null,
    panel(
      '得点の内訳',
      table,
      finishedNormally ? h('p', { class: 'note' }, '満足度 = 自由時間 + 思い出 + 信頼 − 残った疲労') : null,
    ),
    g.history.length ? panel('家庭ゲージの推移', familyChart(g.history)) : null,
    reflection(g, names, ai),
    logView(g.history, names),
    h(
      'div',
      { class: 'actions' },
      button(
        'もう一度',
        () =>
          nav.go(
            online
              ? { name: 'online', session: null, code: null, strategy: 'nostr', since: Date.now() }
              : ai
                ? { name: 'aiSetup', dealt: null }
                : { name: 'setup', dealt: null },
          ),
        'btn primary big',
      ),
      button('タイトルへ', () => nav.go({ name: 'title' }), 'btn big'),
    ),
  );
}
