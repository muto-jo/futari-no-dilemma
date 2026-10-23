// 1台で2人(SPEC 5.1)のゲーム画面
import { jikkaHolder } from '../../engine/game.ts';
import { opp } from '../../engine/types.ts';
import type { Nav } from '../app.ts';
import { button, h } from '../dom.ts';
import type { Hotseat } from '../hotseat.ts';
import { eventCard, logView, nameTag, panel, playerClass, statusPanel } from '../parts.ts';
import { ACTION_NAME, PROMISE_NAME, PROMISE_SPEECH, roleAndName, roleCardInfo } from '../text.ts';
import {
  choicePanel,
  downNotices,
  endedView,
  gameHeader,
  jikkaLabel,
  promiseReveal,
  resolvedView,
  shishunkiNotice,
  type Choice,
} from './shared.ts';

export function renderGame(nav: Nav, hs: Hotseat): HTMLElement {
  const g = hs.game;
  const act = (f: () => void) => () => {
    f();
    nav.render(true);
  };
  const header = gameHeader(nav, g, { name: 'game', play: hs });

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
      return h(
        'div',
        { class: 'phase' },
        shishunkiNotice(g),
        eventCard(g.event),
        holder
          ? panel(
              '実家ヘルプ',
              h('p', null, nameTag(holder, names), ` は実家ヘルプを使えます。${roleCardInfo('jikka').text}`),
              h(
                'div',
                { class: 'actions' },
                button(jikkaLabel(g.event.weight), act(() => hs.confirmEvent(true)), 'btn'),
                button(hs.consult ? '使わずに相談へ' : '使わずに進む', act(() => hs.confirmEvent(false)), 'btn primary'),
              ),
            )
          : h(
              'div',
              { class: 'actions' },
              button(hs.consult ? '相談へ' : '約束カードへ', act(() => hs.confirmEvent(false)), 'btn primary big'),
            ),
      );
    }
    case 'consult':
      return h(
        'div',
        { class: 'phase' },
        eventCard(g.turn.event, g.turn.weight),
        downNotices(g, names),
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
    case 'promise':
      if (hs.stage.kind === 'choose') {
        const choices: Choice[] = hs.choosingPromises().map((p) => ({
          key: p,
          label: PROMISE_NAME(p),
          sub: `「${PROMISE_SPEECH(p)}」`,
        }));
        return h(
          'div',
          { class: 'phase' },
          eventCard(g.turn.event, g.turn.weight),
          choicePanel(hs.stage.who, names, 'の約束カード', choices, (key) =>
            act(() => hs.pickPromise(hs.choosingPromises().find((p) => p === key)!))(),
          ),
        );
      }
      return h(
        'div',
        { class: 'phase' },
        eventCard(g.turn.event, g.turn.weight),
        // 相談なしでは相談の画面を通らないので、ダウンのお知らせをここで出す
        hs.consult ? null : downNotices(g, names),
        panel(
          '約束カード',
          hs.consult ? null : h('p', { class: 'note' }, '相談なしのルールです。'),
          h('p', null, '1人ずつ、ほかの人に見えないように選びます。'),
          h('div', { class: 'actions' }, button('約束カードを選ぶ', act(() => hs.startSecret()), 'btn primary big')),
        ),
      );
    case 'action':
      if (hs.stage.kind === 'choose') {
        const list = hs.choosingActions();
        const choices = list.map(actionChoice);
        return h(
          'div',
          { class: 'phase' },
          eventCard(g.turn.event, g.turn.weight),
          promiseReveal(g, names),
          choicePanel(hs.stage.who, names, 'の行動カード', choices, (key) =>
            act(() => hs.pickAction(list[choices.findIndex((c) => c.key === key)]!))(),
          ),
        );
      }
      return h(
        'div',
        { class: 'phase' },
        eventCard(g.turn.event, g.turn.weight),
        promiseReveal(g, names),
        panel(
          '行動カード',
          h('p', null, '約束と違うカードを出すこともできます。1人ずつ、見えないように選びます。'),
          h('div', { class: 'actions' }, button('行動カードを選ぶ', act(() => hs.startSecret()), 'btn primary big')),
        ),
      );
    case 'resolved':
      return resolvedView(g, names, act(() => hs.next()));
    case 'ended':
      return endedView(g, names, () => nav.go({ name: 'result', game: g, names, ai: null }));
  }
}

export function actionChoice(a: { card: 'do' | 'delegate'; overtime?: boolean }): Choice {
  return a.overtime
    ? { key: 'overtime', label: `${ACTION_NAME.delegate}(残業を使う)`, sub: roleCardInfo('overtime').text }
    : { key: a.card, label: ACTION_NAME[a.card] };
}
