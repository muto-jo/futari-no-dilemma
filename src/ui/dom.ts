// 素のDOMを組み立てる小さなヘルパー
export type Child = Node | string | number | null | undefined | false;

type Props = {
  class?: string;
  onclick?: (e: MouseEvent) => void;
  [attr: string]: unknown;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2), v as EventListener);
    } else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function button(label: Child, onclick: () => void, cls = 'btn', extra: Props = {}): HTMLButtonElement {
  return h('button', { type: 'button', class: cls, onclick, ...extra }, label);
}
