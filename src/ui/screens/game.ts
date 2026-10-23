import { jikkaHolder } from '../../engine/game.ts';
import { PARAMS } from '../../engine/params.ts';
import { ROLES, opp, type ActionChoice, type GameState, type PromiseCard, type Role } from '../../engine/types.ts';
import type { Nav } from '../app.ts';
import { describeEnding } from '../describe.ts';
import { button, h } from '../dom.ts';
import type { Hotseat } from '../hotseat.ts';
import { eventCard, logView, nameTag, panel, playerClass, roundResult, statusPanel } from '../parts.ts';
import { ACTION_NAME, PROMISE_NAME, PROMISE_SPEECH, progressCard, roleAndName, roleCardInfo } from '../text.ts';

/** 選んでいる途中のカード(「これに決める」まで確定しない)。DOMにもエンジンにも出さない */
let selected: { who: Role; key: string } | null = null;

export function renderGame(nav: Nav, hs: Hotseat): HTMLElement {
  const g = hs.game;
  const act = (f: () => void) => () => {
    f();
    selected = null;
    nav.render(true);
  };
  const quit = () => {
    if (g.phase === 'ended' || window.confirm('ゲームを中断してタイトルに戻りますか?')) nav.go({ name: 'title' });
  };
  const header = h(
    'header',
    { class: 'bar-head' },
    button('タイトルへ', quit, 'btn small ghost'),
    h('h1', null, g.phase === 'ended' ? 'ゲーム終了' : `第${g.round}ラウンド`),
    button('ルール', () => nav.go({ name: 'rules', back: { name: 'game', play: hs } }), 'btn small ghost'),
  );

  // 受け渡しの画面は、ほかの情報を出さない
  const st = hs.stage;
  if (st.kind === 'handoff' || st.kind === 'passed' || st.kind === 'allChosen') {
    return h('main', { class: 'screen handoff' }, header, handoffView(hs, act));
  }

  return h(
    'main',
    { class: 'screen' },
    header,
    statusPanel(g, hs.names),
    phaseView(nav, hs, act),
    st.kind === 'idle' ? logView(g.history, hs.names) : null,
  );
}

type Act = (f: () => void) => () => void;

function handoffView(hs: Hotseat, act: Act): HTMLElement {
  const st = hs.stage;
  const what = hs.game.phase === 'promise' ? '約束カード' : '行動カード';
  if (st.kind === 'handoff') {
    return h(
      'section',
      { class: `handoff-box ${playerClass(st.who)}` },
      h('p', { class: 'handoff-what' }, what),
      h('h2', null, `${roleAndName(st.who, hs.names)}の番です`),
      h('p', null, `${roleAndName(opp(st.who), hs.names)}は画面を見ないでください。`),
      button('準備OK', act(() => hs.ready()), 'btn primary big'),
    );
  }
  if (st.kind === 'passed') {
    return h(
      'section',
      { class: `handoff-box ${playerClass(st.next)}` },
      h('p', { class: 'handoff-what' }, what),
      h('h2', null, '選びました'),
      h('p', null, `スマホを${roleAndName(st.next, hs.names)}に渡してください。`),
      button('渡しました', act(() => hs.passOn()), 'btn primary big'),
    );
  }
  return h(
    'section',
    { class: 'handoff-box' },
    h('p', { class: 'handoff-what' }, what),
    h('h2', null, '2人とも選びました'),
    h('p', null, '2人で画面を見てください。'),
    button('同時に公開', act(() => hs.reveal()), 'btn primary big'),
  );
}

function phaseView(nav: Nav, hs: Hotseat, act: Act): HTMLElement {
  const g = hs.game;
  const names = hs.names;
  switch (g.phase) {
    case 'event': {
      const holder = jikkaHolder(g);
      const enteredLate = g.lateGame && !g.history[g.history.length - 1]?.lateGame;
      const shishunki = progressCard('P_SHISHUNKI');
      return h(
        'div',
        { class: 'phase' },
        enteredLate
          ? h('section', { class: 'notice late' }, h('h3', null, `${shishunki.name}カード`), h('p', null, shishunki.text))
          : null,
        eventCard(g.event),
        holder
          ? panel(
              '実家ヘルプ',
              h('p', null, nameTag(holder, names), ` は実家ヘルプを使えます。${roleCardInfo('jikka').text}`),
              h(
                'div',
                { class: 'actions' },
                button(
                  `使う(重さ${g.event.weight}→${Math.max(1, g.event.weight - 1)})`,
                  act(() => hs.confirmEvent(true)),
                  'btn',
                ),
                button('使わずに相談へ', act(() => hs.confirmEvent(false)), 'btn primary'),
              ),
            )
          : h('div', { class: 'actions' }, button('相談へ', act(() => hs.confirmEvent(false)), 'btn primary big')),
      );
    }
    case 'consult': {
      const downs = ROLES.filter((r) => g.turn.down[r]);
      return h(
        'div',
        { class: 'phase' },
        eventCard(g.turn.event, g.turn.weight),
        downs.map((r) =>
          h(
            'section',
            { class: 'notice down' },
            h('p', null, nameTag(r, names), ` は疲労${PARAMS.downTired}以上でダウン中。このラウンドは家事ができません(約束は「あなたに頼む」、行動は「任せる」)。`),
          ),
        ),
        panel(
          '相談してください',
          h('p', null, '2人で自由に話しましょう。疲れていたら「お願いしていい?」と頼めます。'),
          h(
            'ul',
            { class: 'hints' },
            h('li', null, '疲労トークンは2人とも見えています。相手が本当に疲れているか見て、受けるか決めましょう。'),
            h('li', null, '受けたら、頼んだ人は「あなたに頼む」、受けた人は「私がやる」を出すのが合意の形です。'),
            h('li', null, '約束カードに拘束力はありません。'),
          ),
          h('div', { class: 'actions' }, button('相談終了', act(() => hs.endConsult()), 'btn primary big')),
        ),
      );
    }
    case 'promise':
      if (hs.stage.kind === 'choose') return chooseView(hs, act);
      return h(
        'div',
        { class: 'phase' },
        eventCard(g.turn.event, g.turn.weight),
        panel(
          '約束カード',
          h('p', null, '1人ずつ、ほかの人に見えないように選びます。'),
          h('div', { class: 'actions' }, button('約束カードを選ぶ', act(() => hs.startSecret()), 'btn primary big')),
        ),
      );
    case 'action':
      if (hs.stage.kind === 'choose') return chooseView(hs, act);
      return h(
        'div',
        { class: 'phase' },
        eventCard(g.turn.event, g.turn.weight),
        promiseReveal(g),
        panel(
          '行動カード',
          h('p', null, '約束と違うカードを出すこともできます。1人ずつ、見えないように選びます。'),
          h('div', { class: 'actions' }, button('行動カードを選ぶ', act(() => hs.startSecret()), 'btn primary big')),
        ),
      );
    case 'resolved':
      return h(
        'div',
        { class: 'phase' },
        eventCard(g.last.event, g.last.weight),
        roundResult(g.last, names),
        h('div', { class: 'actions' }, button('次のラウンドへ', act(() => hs.next()), 'btn primary big')),
      );
    case 'ended': {
      const t = describeEnding(g.ending, g.family, names);
      const sudachi = progressCard('P_SUDACHI');
      return h(
        'div',
        { class: 'phase' },
        g.last ? eventCard(g.last.event, g.last.weight) : null,
        g.last ? roundResult(g.last, names) : h('section', { class: 'notice late' }, h('h3', null, `${sudachi.name}カード`), h('p', null, sudachi.text)),
        h('section', { class: 'notice ending' }, h('h3', null, t.title), h('p', null, t.message)),
        h('div', { class: 'actions' }, button('結果を見る', () => nav.go({ name: 'result', play: hs }), 'btn primary big')),
      );
    }
  }
}

function promiseReveal(g: Extract<GameState, { phase: 'action' }>): HTMLElement {
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
          h('b', null, g.players[r].name),
          `: 「${PROMISE_NAME(p)}」`,
          p ? h('span', { class: 'speech' }, ` ${PROMISE_SPEECH(p)}`) : null,
        );
      }),
    ),
  );
}

interface Choice {
  key: string;
  label: string;
  sub?: string;
  pick: () => void;
}

function chooseView(hs: Hotseat, act: Act): HTMLElement {
  const g = hs.game;
  const st = hs.stage;
  if (st.kind !== 'choose' || (g.phase !== 'promise' && g.phase !== 'action')) throw new Error('chooseView');
  const who = st.who;
  const isPromise = g.phase === 'promise';

  const choices: Choice[] = isPromise
    ? hs.choosingPromises().map((p: PromiseCard) => ({
        key: p,
        label: PROMISE_NAME(p),
        sub: `「${PROMISE_SPEECH(p)}」`,
        pick: () => hs.pickPromise(p),
      }))
    : hs.choosingActions().map((a: ActionChoice) => ({
        key: a.overtime ? 'overtime' : a.card,
        label: a.overtime ? `${ACTION_NAME.delegate}(残業を使う)` : ACTION_NAME[a.card],
        sub: a.overtime ? roleCardInfo('overtime').text : undefined,
        pick: () => hs.pickAction(a),
      }));

  const current = selected?.who === who ? choices.find((c) => c.key === selected?.key) : undefined;
  const select = (key: string) => () => {
    selected = { who, key };
    // 選択の見た目だけ変える(スクロール位置を保つ)
    for (const el of document.querySelectorAll<HTMLButtonElement>('.choice')) {
      el.setAttribute('aria-pressed', String(el.dataset.key === key));
    }
    const ok = document.querySelector<HTMLButtonElement>('#decide');
    if (ok) ok.disabled = false;
  };

  return h(
    'div',
    { class: 'phase' },
    eventCard(g.turn.event, g.turn.weight),
    g.phase === 'action' ? promiseReveal(g) : null,
    panel(
      h('span', null, nameTag(who, hs.names), isPromise ? ' の約束カード' : ' の行動カード'),
      h(
        'div',
        { class: 'choices' },
        choices.map((c) =>
          h(
            'button',
            {
              type: 'button',
              class: 'choice',
              'data-key': c.key,
              'aria-pressed': String(current?.key === c.key),
              onclick: select(c.key),
            },
            h('span', { class: 'choice-label' }, c.label),
            c.sub ? h('span', { class: 'choice-sub' }, c.sub) : null,
          ),
        ),
      ),
      h(
        'div',
        { class: 'actions' },
        button(
          'これに決める',
          () => {
            const c = choices.find((x) => x.key === selected?.key && selected?.who === who);
            if (c) act(c.pick)();
          },
          'btn primary big',
          { id: 'decide', disabled: current === undefined },
        ),
      ),
    ),
  );
}
