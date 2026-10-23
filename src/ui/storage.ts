// 設定(プレイヤー名など)だけを localStorage に保存する。使えない環境では何もしない
import type { PerRole } from '../engine/types.ts';
import { DEFAULT_NAMES } from './text.ts';

const KEY = 'futari-no-dilemma:names';

export function loadNames(): PerRole<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_NAMES;
    const v = JSON.parse(raw) as Partial<Record<string, unknown>>;
    const pick = (x: unknown, d: string) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, 12) : d);
    return { husband: pick(v.husband, DEFAULT_NAMES.husband), wife: pick(v.wife, DEFAULT_NAMES.wife) };
  } catch {
    return DEFAULT_NAMES;
  }
}

export function saveNames(names: PerRole<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(names));
  } catch {
    // 保存できなくても遊べる
  }
}
