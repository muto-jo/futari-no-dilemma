// AIと対戦(SPEC 5.2)のゲーム画面
import type { AiMatch, ConsultLine } from '../aiMatch.ts';
import type { Nav } from '../app.ts';
import { button, h } from '../dom.ts';
import { eventCard, logView, nameTag, panel, playerClass, statusPanel, youAre } from '../parts.ts';
import { PROMISE_NAME, PROMISE_SPEECH, roleCardInfo } from '../text.ts';
import { actionChoice } from './game.ts';
import {
  choicePanel,
  downNotices,
  endedView,
  gameHeader,
  jikkaLabel,
  promiseReveal,
  resolvedView,
  shishunkiNotice,
} from './shared.ts';

export function renderAiGame(nav: Nav, m: AiMatch): HTMLElement {
  const g = m.game;
  return h(
    'main',
    { class: 'screen' },
    gameHeader(nav, g, { name: 'aiGame', match: m }),
    youAre(m.human, m.names),
    statusPanel(g, m.names, m.human),
    phaseView(nav, m),
    logView(g.history, m.names),
  );
}

function dialogue(m: AiMatch, lines: readonly ConsultLine[]): HTMLElement | null {
  if (lines.length === 0) return null;
  return h(
    'ul',
    { class: 'dialogue' },
    lines.map((l) =>
      l.speaker === null
        ? h('li', { class: 'say system' }, l.text)
        : h(
            'li',
            { class: `say ${playerClass(l.speaker)}${l.speaker === m.human ? ' me' : ''}` },
            nameTag(l.speaker, m.names),
            h('span', { class: 'bubble' }, l.text),
          ),
    ),
  );
}

function phaseView(nav: Nav, m: AiMatch): HTMLElement {
  const g = m.game;
  const names = m.names;
  const act = (f: () => void) => () => {
    f();
    nav.render(true);
  };
  switch (g.phase) {
    case 'event':
      return h(
        'div',
        { class: 'phase' },
        shishunkiNotice(g),
        eventCard(g.event),
        m.humanHasJikka()
          ? panel(
              '実家ヘルプ',
              h('p', null, `あなたは実家ヘルプを使えます。${roleCardInfo('jikka').text}`),
              h(
                'div',
                { class: 'actions' },
                button(jikkaLabel(g.event.weight), act(() => m.confirmEvent(true)), 'btn'),
                button('使わずに相談へ', act(() => m.confirmEvent(false)), 'btn primary'),
              ),
            )
          : h('div', { class: 'actions' }, button('相談へ', act(() => m.confirmEvent(false)), 'btn primary big')),
      );
    case 'consult': {
      const st = m.stage;
      let buttons: HTMLElement[] = [];
      if (st?.kind === 'open') {
        buttons = [
          button('お願いする(休みたい)', act(() => m.humanRequests()), 'btn primary'),
          button('お願いしないで進む', act(() => m.skipRequest()), 'btn'),
        ];
      } else if (st?.kind === 'aiAsks') {
        buttons = [
          button('いいよー(私がやる)', act(() => m.answer(true)), 'btn primary'),
          button('ごめん', act(() => m.answer(false)), 'btn'),
          st.alsoRequest ? button('私も休みたい', act(() => m.humanRequests()), 'btn') : null,
        ].filter((b): b is HTMLButtonElement => b !== null);
      } else {
        buttons = [button('約束カードを選ぶ', act(() => m.endConsult()), 'btn primary big')];
      }
      return h(
        'div',
        { class: 'phase' },
        eventCard(g.turn.event, g.turn.weight),
        downNotices(g, names),
        panel(
          '相談',
          st?.kind === 'open' ? h('p', null, '疲れていたら、相手に「お願いしていい?」と頼めます。相手の疲労トークンも見てみましょう。') : null,
          dialogue(m, m.lines),
          h('div', { class: 'actions' }, buttons),
        ),
      );
    }
    case 'promise': {
      const choices = m.humanPromises().map((p) => ({ key: p, label: PROMISE_NAME(p), sub: `「${PROMISE_SPEECH(p)}」` }));
      return h(
        'div',
        { class: 'phase' },
        eventCard(g.turn.event, g.turn.weight),
        downNotices(g, names),
        m.lines.length ? panel('相談', dialogue(m, m.lines)) : null,
        choicePanel(m.human, names, 'の約束カード', choices, (key) =>
          act(() => m.choosePromise(m.humanPromises().find((p) => p === key)!))(),
        ),
        h('p', { class: 'note' }, `${names[m.ai]}の約束カードは、あなたが選んだあとに同時に公開します。`),
      );
    }
    case 'action': {
      const list = m.humanActions();
      const choices = list.map(actionChoice);
      return h(
        'div',
        { class: 'phase' },
        eventCard(g.turn.event, g.turn.weight),
        promiseReveal(g, names),
        choicePanel(m.human, names, 'の行動カード', choices, (key) =>
          act(() => m.chooseAction(list[choices.findIndex((c) => c.key === key)]!))(),
        ),
        h('p', { class: 'note' }, `約束と違うカードを出すこともできます。${names[m.ai]}の行動カードは同時に公開します。`),
      );
    }
    case 'resolved':
      return resolvedView(g, names, act(() => m.next()));
    case 'ended':
      return endedView(g, names, () => nav.go({ name: 'result', game: g, names, ai: m }));
  }
}
