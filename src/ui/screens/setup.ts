import { ROLES, type Role } from '../../engine/types.ts';
import type { Nav } from '../app.ts';
import { button, h } from '../dom.ts';
import { Hotseat } from '../hotseat.ts';
import { nameTag, playerClass, resetLogView } from '../parts.ts';
import { DEFAULT_NAMES, ROLE_LABEL, roleCardInfo } from '../text.ts';

function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

export function renderSetup(nav: Nav, dealt: Hotseat | null): HTMLElement {
  const inputs = {} as Record<Role, HTMLInputElement>;
  const field = (r: Role) => {
    const input = h('input', {
      id: `name-${r}`,
      type: 'text',
      value: nav.names[r],
      maxlength: 12,
      autocomplete: 'off',
      disabled: dealt !== null,
    });
    inputs[r] = input;
    return h(
      'div',
      { class: `field ${playerClass(r)}` },
      h('label', { for: `name-${r}` }, `${ROLE_LABEL[r]}役の名前`),
      input,
    );
  };

  const deal = () => {
    const names = {
      husband: inputs.husband.value.trim() || DEFAULT_NAMES.husband,
      wife: inputs.wife.value.trim() || DEFAULT_NAMES.wife,
    };
    nav.setNames(names);
    nav.go({ name: 'setup', dealt: Hotseat.start(names, randomSeed()) });
  };

  const body: HTMLElement[] = [h('section', { class: 'panel' }, h('h3', null, 'プレイヤー'), ROLES.map(field))];

  if (dealt === null) {
    body.push(h('div', { class: 'actions' }, button('役割カードを配る', deal, 'btn primary big')));
  } else {
    body.push(
      h(
        'section',
        { class: 'panel' },
        h('h3', null, '役割カード'),
        h('p', { class: 'note' }, '1人1枚。ゲーム中に1回だけ使えます。'),
        ROLES.map((r) => {
          const c = roleCardInfo(dealt.game.players[r].roleCard);
          return h(
            'div',
            { class: `role-deal ${playerClass(r)}` },
            h('div', null, nameTag(r, dealt.names), ' に ', h('b', null, `「${c.name}」`)),
            h('p', null, c.text),
            h('p', { class: 'note' }, c.timing),
          );
        }),
      ),
      h(
        'div',
        { class: 'actions' },
        button(
          'ゲームを始める',
          () => {
            resetLogView();
            nav.go({ name: 'game', play: dealt });
          },
          'btn primary big',
        ),
        button('名前を変える', () => nav.go({ name: 'setup', dealt: null }), 'btn'),
      ),
    );
  }

  return h(
    'main',
    { class: 'screen' },
    h('header', { class: 'bar-head' }, button('戻る', () => nav.go({ name: 'title' }), 'btn small ghost'), h('h1', null, '1台で2人')),
    body,
  );
}
