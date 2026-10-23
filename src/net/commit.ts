// コミット&リビール(SPEC 5.3)。先に SHA-256(局面 | 選択 | nonce) だけを送り、
// 2人のコミットが揃ってから選択と nonce を送って検証する

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function randomHex(bytes: number): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return hex(new Uint8Array(digest));
}

/** key は局面(ラウンドとフェイズ)。別の局面のコミットを使い回せないようにする */
const commitText = (key: string, choice: string, nonce: string) => `${key}|${choice}|${nonce}`;

export interface Commitment {
  readonly key: string;
  readonly choice: string;
  readonly nonce: string;
  readonly hash: string;
}

export async function commit(key: string, choice: string): Promise<Commitment> {
  const nonce = randomHex(16);
  return { key, choice, nonce, hash: await sha256Hex(commitText(key, choice, nonce)) };
}

export async function verify(key: string, choice: string, nonce: string, hash: string): Promise<boolean> {
  return (await sha256Hex(commitText(key, choice, nonce))) === hash;
}
