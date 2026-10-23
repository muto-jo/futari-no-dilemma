"""『ふたりのジレンマ』C案 ——「疲れたからお願い」「いいよー」が起きるゲーム

B案(dilemma_b.py)からの変更
1. 疲労はトークン制。持っている疲労トークンは、ゲーム終了時に1枚 -1点
   - やる: 1人なら +w枚、2人なら各自 +ceil(w/2)枚
   - 毎ラウンドの終わりに、全員1枚回復(睡眠)
   - 合意して休んだ(「あなたに頼む」が受け入れられた)ラウンドは、さらに2枚回復。ただし自由時間はもらえない
   - 疲労トークンが7枚以上になると「ダウン」: そのラウンドはやれない
     ダウン中の人に任されても不満は付かない(病人には怒らない)。ただし家庭 -1(心配)
2. 相談フェイズ(会話をモデル化)
   ①休みたい人が「お願いしていい?」と頼む(疲労トークンは公開情報)
   ②頼まれた側は受けるか断るか決める
   ③受けたら 頼んだ側=「あなたに頼む」、受けた側=「私がやる」。それ以外は「一緒にやる」
     ※ダウン中の人は必ず「あなたに頼む」
3. 合意どおりに動けたら、2人とも「信頼」が加点される
   - 「一緒にやる」同士で2人ともやった: 各自 +1点(TRUST_TOGETHER)
   - 「私がやる」「あなたに頼む」のとおりに分担した(お願い成立): 各自 +2点(TRUST_SPLIT)
4. それ以外(思い出、約束破りで不満+2、家族成功ボーナス、離婚、共倒れ)はB案と同じ
   満足度 = 自由時間 + 思い出 + 信頼 - 残った疲労トークン
"""
import random
import math
from collections import defaultdict

ROLES = ["夫", "妻"]
OPP = {"夫": "妻", "妻": "夫"}
BONUS = 15
DIVORCE_PENALTY = -10
DIVORCE_FROM = 21
DOWN = 7          # この枚数以上でダウン
REQ = 4           # 思いやり系が「お願い」を出す目安
TRUST_TOGETHER = 1  # 「一緒にやる」同士で2人ともやったときの加点
TRUST_SPLIT = 2     # 「お願い」が成立し、そのとおりに分担したときの加点


def my_turn(s):
    return (s["round"] % 2 == 1) == (s["role"] == "夫")


# ---- 約束カードを使わない戦略(行動だけ決める) -----------------------
def allc(s, rng): return True
def alld(s, rng): return False
def rand(s, rng): return rng.random() < 0.5
def tft(s, rng): return s["opp"][-1] if s["opp"] else True
def gtft(s, rng):
    if not s["opp"] or s["opp"][-1]:
        return True
    return rng.random() < 1 / 3
def tf2t(s, rng): return not (len(s["opp"]) >= 2 and not s["opp"][-1] and not s["opp"][-2])
def grim(s, rng): return all(s["opp"])
def pavlov(s, rng):
    if not s["my"]:
        return True
    return s["my"][-1] if s["opp"][-1] else not s["my"][-1]
def prober(s, rng):
    n = len(s["my"])
    if n < 3:
        return [False, True, True][n]
    if s["opp"][1] and s["opp"][2]:
        return False
    return s["opp"][-1]
def brink(s, rng): return s["family"] <= s["w"] + 2
def weight(s, rng): return s["w"] == 1
def grudge_mgr(s, rng): return s["opp_grudge"] >= 3
def endgame(s, rng):
    if s["round"] >= DIVORCE_FROM:
        return False
    return tft(s, rng)
def alternate(s, rng): return my_turn(s)


# ---- 約束カードを使う戦略: (お願いする?, 受ける?, 行動) -----------------
NO = lambda s, rng: False
YES = lambda s, rng: True

def req_tired(s, rng): return s["my_tired"] >= REQ
def acc_fair(s, rng):
    # 相手が本当に疲れていて、自分が限界でなければ受ける
    return s["opp_tired"] >= 3 and s["my_tired"] + s["w"] < DOWN
def keep(s, rng): return s["my_prom"] in ("共", "私")
def keep_tft(s, rng):
    if s["opp_wronged_me"]:
        return False
    return keep(s, rng)
def joker(s, rng):
    if s["my_prom"] == "頼":
        return False
    return rng.random() >= 0.25
def liar(s, rng): return False
def req_turn(s, rng): return not my_turn(s)
def acc_turn(s, rng): return my_turn(s)
def acc_unless_wronged(s, rng): return acc_fair(s, rng) and not s["opp_wronged_me"]

# 戦略: (request, accept, act, 約束カードを使うか)
STRATS = {
    "常に協力": (None, None, allc), "常に裏切り": (None, None, alld), "ランダム": (None, None, rand),
    "しっぺ返し": (None, None, tft), "寛容TFT": (None, None, gtft), "2回でTFT": (None, None, tf2t),
    "グラッジャー": (None, None, grim), "パブロフ": (None, None, pavlov), "探り屋": (None, None, prober),
    "崖っぷち": (None, None, brink), "重さ選び": (None, None, weight), "不満管理": (None, None, grudge_mgr),
    "終盤裏切り": (None, None, endgame), "交代制(約束なし)": (None, None, alternate),
    "思いやり": (req_tired, acc_fair, keep),            # 疲れたら頼む・頼まれたら受ける・約束を守る
    "思いやりTFT": (req_tired, acc_unless_wronged, keep_tft),  # 思いやり+約束を破られたらやり返す
    "頑張りすぎ": (NO, YES, keep),                      # 頼まれたら全部受けるが、自分からは頼まない
    "約束交代": (req_turn, acc_turn, keep),             # 50:50を毎回約束
    "甘え上手": (YES, NO, keep),                        # 毎回「お願い」する。頼まれても断る
    "ふざけパパ": (req_tired, acc_fair, joker),         # 思いやりと同じ会話をするが、25%で約束を破る
    "口だけ": (req_tired, acc_fair, liar),              # 会話はするが一切やらない
}
PROMISE_USERS = {k for k, v in STRATS.items() if v[0] is not None}


def play(name_h, name_w, rng):
    deck = [w for w in (1, 2, 3) for _ in range(10)]
    rng.shuffle(deck)
    deck = deck[:rng.randint(20, 30)]

    strat = {"夫": STRATS[name_h], "妻": STRATS[name_w]}
    family = 10
    free = {r: 0 for r in ROLES}
    memory = {r: 0 for r in ROLES}
    trust = {r: 0 for r in ROLES}
    tired = {r: 0 for r in ROLES}
    grudge = {r: 0 for r in ROLES}
    hist = {r: [] for r in ROLES}
    wronged = {r: False for r in ROLES}
    help_left, overtime_left = True, True
    st = defaultdict(int)  # 統計

    def S(r, rnd, w, **kw):
        d = dict(role=r, my=hist[r], opp=hist[OPP[r]], family=family, w=w, round=rnd,
                 my_grudge=grudge[r], opp_grudge=grudge[OPP[r]], my_tired=tired[r],
                 opp_tired=tired[OPP[r]], opp_wronged_me=wronged[r])
        d.update(kw)
        return d

    for rnd, w in enumerate(deck, 1):
        if help_left and w == 3:
            help_left = False
            w = 2
        down = {r: tired[r] >= DOWN for r in ROLES}

        # ---- 相談フェイズ ----
        prom = {r: None for r in ROLES}
        uses = {r: strat[r][0] is not None for r in ROLES}
        req = {r: down[r] or (uses[r] and strat[r][0](S(r, rnd, w), rng)) for r in ROLES}
        if req["夫"] and req["妻"]:
            # 2人とも休みたい: 疲れているほうを優先して、もう片方に頼む
            if tired["夫"] == tired["妻"] and not (down["夫"] and down["妻"]):
                first = rng.choice(ROLES)  # 同じくらい疲れていたら、どちらかが先に言い出す
                req = {first: True, OPP[first]: down[OPP[first]]}
            elif tired["夫"] == tired["妻"]:
                req = {r: down[r] for r in ROLES}
            else:
                more = "夫" if tired["夫"] > tired["妻"] else "妻"
                req = {more: True, OPP[more]: down[OPP[more]]}
        for r in ROLES:
            if req[r] and not req[OPP[r]]:
                o = OPP[r]
                if down[o]:
                    acc = False
                elif uses[o]:
                    acc = strat[o][1](S(o, rnd, w), rng)
                else:
                    acc = False  # 約束カードを使わない人は「お願い」に応えない
                if acc:
                    prom[r], prom[o] = "頼", "私"
                    st["お願い成立"] += 1
                else:
                    st["お願い不成立"] += 1
        for r in ROLES:
            if down[r]:
                prom[r] = "頼"
            elif prom[r] is None and uses[r]:
                prom[r] = "共"

        # ---- 行動 ----
        act = {}
        for r in ROLES:
            if down[r]:
                act[r] = False
                st["ダウン"] += 1
            else:
                act[r] = bool(strat[r][2](S(r, rnd, w, my_prom=prom[r], opp_prom=prom[OPP[r]]), rng))
        overtime = False
        if overtime_left and not act["夫"] and not down["夫"]:
            overtime_left = False
            overtime = True

        add = {r: 0 for r in ROLES}
        rest = {r: 0 for r in ROLES}
        a, b = act["夫"], act["妻"]
        if a and b:
            family += w
            for r in ROLES:
                tired[r] += math.ceil(w / 2)
                memory[r] += w
            if prom["夫"] == "共" and prom["妻"] == "共":
                for r in ROLES:
                    trust[r] += TRUST_TOGETHER
                st["合意どおり"] += 1
        elif not a and not b:
            family -= w + 1
        else:
            doer, slacker = ("夫", "妻") if a else ("妻", "夫")
            tired[doer] += w
            agreed = prom[doer] == "私" and prom[slacker] == "頼"
            if agreed:
                rest[slacker] = 2
                for r in ROLES:
                    trust[r] += TRUST_SPLIT
                st["合意どおり"] += 1
            elif down[slacker]:
                family -= 1
            elif slacker == "夫" and overtime:
                pass
            else:
                free[slacker] += w
                add[doer] += 1
        for r in ROLES:
            tired[r] = max(0, tired[r] - rest[r] - 1)
            if prom[r] in ("共", "私") and not act[r]:
                add[OPP[r]] = max(add[OPP[r]], 2)
                st["約束破り"] += 1
        for r in ROLES:
            wronged[r] = add[r] > 0
            hist[r].append(act[r])
            grudge[r] += add[r]
        for r in ROLES:
            if grudge[r] >= 4:
                causer = OPP[r]
                if rnd >= DIVORCE_FROM:
                    return dict(result="離婚", causer=causer,
                                score={causer: DIVORCE_PENALTY, r: 0}, st=st)
                free[causer] //= 2
                grudge[r] = 0
        if family <= 0:
            return dict(result="共倒れ", score={r: 0 for r in ROLES}, st=st)

    sat = {r: free[r] + memory[r] + trust[r] - tired[r] for r in ROLES}
    if family >= 10:
        return dict(result="家族成功", score={r: sat[r] + BONUS for r in ROLES}, st=st)
    return dict(result="ぎりぎり完走", score=sat, st=st)


def main(n=100, seed=2026):
    rng = random.Random(seed)
    names = list(STRATS)
    agg = defaultdict(lambda: defaultdict(float))
    pair = {}
    for h in names:
        for w in names:
            pr = defaultdict(float)
            for _ in range(n):
                g = play(h, w, rng)
                for me, role in ((h, "夫"), (w, "妻")):
                    x = agg[me]
                    x["g"] += 1
                    x["score"] += g["score"][role]
                    x[g["result"]] += 1
                    if g["result"] == "離婚":
                        x["離婚させた" if g["causer"] == role else "離婚された"] += 1
                pr[g["result"]] += 1
                pr["夫点"] += g["score"]["夫"]
                pr["妻点"] += g["score"]["妻"]
                for kk, v in g["st"].items():
                    pr[kk] += v
            pair[(h, w)] = pr

    k = len(names)
    print(f"=== C案 {k}戦略 総当たり({k*k}組 × {n}戦 = {k*k*n}ゲーム) ===")
    print(f"{'戦略':<10}{'平均点':>6}{'家族成功':>7}{'共倒れ':>6}{'離婚させた':>7}{'離婚された':>7}")
    for nm in sorted(names, key=lambda nm: -agg[nm]["score"] / agg[nm]["g"]):
        x = agg[nm]; g = x["g"]
        mark = "*" if nm in PROMISE_USERS else " "
        print(f"{mark}{nm:<9}{x['score']/g:>7.1f}{x['家族成功']/g:>7.0%}{x['共倒れ']/g:>6.0%}"
              f"{x['離婚させた']/g:>7.0%}{x['離婚された']/g:>7.0%}")
    print("(*は相談・約束をする戦略)")

    print("\n--- 同じ戦略同士の夫婦 ---")
    for nm in names:
        p = pair[(nm, nm)]
        print(f"{nm}: 成功{p['家族成功']:.0f}% 共倒れ{p['共倒れ']:.0f}% 離婚{p['離婚']:.0f}% "
              f"点 夫{p['夫点']/n:.1f}/妻{p['妻点']/n:.1f} | 1戦あたり お願い成立{p['お願い成立']/n:.1f} "
              f"ダウン{p['ダウン']/n:.1f} 約束破り{p['約束破り']/n:.1f}")

    def vs(a, b):
        p1, p2 = pair[(a, b)], pair[(b, a)]
        me = (p1["夫点"] + p2["妻点"]) / (2 * n)
        op = (p1["妻点"] + p2["夫点"]) / (2 * n)
        res = {kk: (p1[kk] + p2[kk]) / 2 for kk in ("家族成功", "共倒れ", "離婚")}
        return me, op, res

    for focus in ("思いやり", "しっぺ返し", "甘え上手"):
        print(f"\n--- {focus} の相手別(夫役・妻役平均) ---")
        for o in names:
            me, op, res = vs(focus, o)
            print(f"vs {o}: 自分{me:6.1f} 相手{op:6.1f} | 成功{res['家族成功']:.0f}% 共倒れ{res['共倒れ']:.0f}% 離婚{res['離婚']:.0f}%")

    tot = defaultdict(float)
    for p in pair.values():
        tot["夫"] += p["夫点"]; tot["妻"] += p["妻点"]
    print(f"\n役割差: 夫の平均点 {tot['夫']/(k*k*n):.1f} / 妻の平均点 {tot['妻']/(k*k*n):.1f}")


if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 3:
        TRUST_TOGETHER, TRUST_SPLIT = int(sys.argv[1]), int(sys.argv[2])
    print(f"信頼の加点: 一緒にやる {TRUST_TOGETHER} / お願い成立 {TRUST_SPLIT}")
    main()
