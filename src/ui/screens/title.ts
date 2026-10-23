import type { Nav } from '../app.ts';
import { button, h } from '../dom.ts';

export function renderTitle(nav: Nav): HTMLElement {
  return h(
    'main',
    { class: 'screen title-screen' },
    h(
      'header',
      { class: 'title-head' },
      h('h1', null, 'ふたりのジレンマ'),
      h('p', { class: 'lead' }, '「疲れたからお願い」「いいよー」。', h('br'), '2人で家事・育児を乗り切る協力カードゲーム'),
    ),
    h(
      'nav',
      { class: 'menu' },
      button('1台で2人', () => nav.go({ name: 'setup', dealt: null }), 'btn primary big'),
      button('AIと対戦', () => nav.go({ name: 'aiSetup', dealt: null }), 'btn big'),
      button(
        'オンライン対戦',
        () => nav.go({ name: 'online', session: null, code: null, strategy: 'nostr', since: Date.now() }),
        'btn big',
      ),
      button('ルール', () => nav.go({ name: 'rules', back: { name: 'title' } }), 'btn big'),
    ),
    h(
      'footer',
      { class: 'title-foot' },
      h('p', null, 'パパ育コミュなど非営利の場での利用は自由です。製品化・商用利用をご希望の方はご連絡ください。'),
      h(
        'p',
        null,
        h('a', { href: 'https://github.com/muto-jo/futari-no-dilemma', target: '_blank', rel: 'noopener noreferrer' }, 'ソースコードとライセンス(GitHub)'),
      ),
    ),
  );
}
