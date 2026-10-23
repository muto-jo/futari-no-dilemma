import { describe, expect, it } from 'vitest';
import { initialNameFor, NAME_CANDIDATES, randomName, randomNameFor, ROLE_NAME_CANDIDATES } from '../src/ui/text.ts';

const draw = (f: () => string, n = 300) => new Set(Array.from({ length: n }, f));

describe('名前の初期値', () => {
  it('1台で2人・AI戦: 夫役は男性名、妻役は女性名の候補から選ぶ', () => {
    expect(draw(() => randomNameFor('husband'))).toEqual(new Set(['あきら', 'かいと', 'さとる', 'たつや', 'なると']));
    expect(draw(() => randomNameFor('wife'))).toEqual(new Set(['あい', 'かな', 'さき', 'たえ', 'なみ']));
  });

  it('オンライン: 役に関係なく10個全体から選ぶ', () => {
    expect(draw(randomName, 600)).toEqual(new Set(NAME_CANDIDATES));
    expect(NAME_CANDIDATES).toHaveLength(10);
  });

  it('保存済みの名前があればそれを使う。既定の「夫」「妻」なら候補から選ぶ', () => {
    expect(initialNameFor('wife', 'はなこ')).toBe('はなこ');
    expect(ROLE_NAME_CANDIDATES.husband).toContain(initialNameFor('husband', '夫'));
    // 役名が逆でも既定とみなす
    expect(ROLE_NAME_CANDIDATES.wife).toContain(initialNameFor('wife', '夫'));
  });
});
