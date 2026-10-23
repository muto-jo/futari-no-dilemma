// seed 付きの PRNG(mulberry32)。状態は 32bit 整数1つ

/** 1ステップ進める。value は [0, 1) */
export function step(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/**
 * 手続き的に使うためのラッパー。エンジンは初期化時だけ使い、終わったら state を状態に保存する。
 * AI とシミュレーションはこれをそのまま持ち回る。
 */
export class Rng {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** [0, 1) の一様乱数(Python の random.random() 相当) */
  random(): number {
    const r = step(this.state);
    this.state = r.state;
    return r.value;
  }

  /** min 以上 max 以下の整数 */
  int(min: number, max: number): number {
    return min + Math.floor(this.random() * (max - min + 1));
  }

  /** 32bit の整数(別の Rng の seed に使う) */
  uint32(): number {
    return Math.floor(this.random() * 4294967296) >>> 0;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.int(0, items.length - 1)];
    if (item === undefined) throw new Error('pick from empty array');
    return item;
  }

  /** Fisher-Yates。新しい配列を返す */
  shuffle<T>(items: readonly T[]): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [a[i], a[j]] = [a[j] as T, a[i] as T];
    }
    return a;
  }
}
