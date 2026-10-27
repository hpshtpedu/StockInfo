"""Shrink the mini-game art in mini_game/ (originals, not committed) into docs/game/ for the site.

Animated gods: 240 px tall, 10 fps (every other frame, each shown twice as long). Fight cloud: 200 px.
Static art: 240 px tall. Background: as is. Transparent margins are trimmed (all frames). Also writes *_still.webp (first frame) for paused state.
Also the love account's game art (docs/love/: walking/kissing couple, wall, heart, Immaterium background), kept
in its own folder so that account never loads the Warhammer files and vice versa.
Run: python scripts/build_game_assets.py [names...]
"""
import json
import pathlib
import sys
from PIL import Image, ImageFilter

SRC = pathlib.Path(__file__).resolve().parent.parent / 'mini_game'
OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'game'
OUT.mkdir(parents=True, exist_ok=True)
SIZES = {'Emperor': 240, 'GUO': 240, 'fight-cloud': 200, 'Emperor_win': 240, 'Emperor_loss': 240,
         'GUO_win': 240, 'GUO_loss': 240, 'Emperor_troops': 160, 'GUO_troops': 160, 'Immaterium': None,
         'win': 120, 'loss': 120, 'vs': 120, 'damage': 64, 'Emperor_attack': 96, 'GUO_attack': 96,
         'GUO_place': 200, 'Emperor_place': 200, 'GUO_attack2': 160, 'Emperor_attack2': 160,
         'casino_closed': None, 'sleep': None, 'Emperor_attack1_2': 128, 'GUO_attack1_2': 128,
         'Emperor_attack2_2': 200, 'GUO_attack2_2': 160, 'day_off': 160, 'heart': None,
         'Emperor_attack_sp': None, 'GUO_attack_sp': None, 'GUO_mini_troops': 96, 'Emperor_mini_troops': 96,
         'GUO_troops2': 160, 'GUO_troops3': 160, 'Emperor_troops2': 160, 'Emperor_troops3': 160,
         'GUO_mini_troops2': 96, 'Emperor_mini_troops2': 96, 'GUO_troops4': 160, 'Emperor_troops4': 160,
         'GUO_mini_troops3': 96, 'Emperor_mini_troops3': 96, 'Emperor_troops5': 160, 'Emperor_troops6': 160, 'GUO_troops5': 160,
         'GUO_troops6': 160, 'GUO_troops_fly': 160, 'Emperor_troops_fly': 160, 'GUO_troops7': 160, 'Emperor_troops7': 160,
         'GUO_troops_fly2': 160, 'Emperor_troops_fly2': 160, 'Emperor_mini_troops4': 96, 'Emperor_troops8': 160, 'Emperor_troops9': 160, 'Emperor_attack_sp2': None, 'GUO_attack_sp2': None,
         'Emperor_Summon_attack': None, 'GUO_Summon_attack': None, 'Summon_SilentKing': 240, 'Summon_Rotigus': 240, 'webway': None, 'Ghazghkull': 160,
         'VengefulSpirit': None, 'abaddon': 160, 'portal': None, 'LordofChange': 160, 'HiveShip': None, 'tyranids': 160}
# 神祇的光暈直接畫進圖裡（以前是網頁上 CSS drop-shadow，動圖每換一格瀏覽器就要重算一次，吃 CPU）。
# 四邊各留 GLOW_PAD px（圖高 240 的 10%）給光暈；網頁那邊把神祇放大 1.2 倍、往下移 10% 抵銷，人物大小位置不變
GLOW = {'Emperor': (255, 215, 0), 'Emperor_win': (255, 215, 0), 'Emperor_loss': (255, 215, 0),
        'GUO': (0, 255, 0), 'GUO_win': (0, 255, 0), 'GUO_loss': (0, 255, 0),
        'Summon_SilentKing': (90, 170, 255), 'Summon_Rotigus': (0, 255, 0)}  # 召喚的盟友：寂靜王藍光、雨父綠光，大小跟神祇一樣
GLOW_PAD, GLOW_SIGMA, GLOW_GAIN = 24, 10, 1.7  # 手機上神祇約 73px 高：σ 10、加強 1.7 倍，跟原本 CSS 的 drop-shadow(0 0 6px) 差不多


# 亂入：登場的門（網道、復仇之魂號、傳送門、蟲巢艦）和角色，外圈一層光暈（四邊留 16px）。
# 網道和碎骨者是深綠，跟大不淨者的亮綠 (0, 255, 0) 分得出來
WARP = {'webway': (10, 130, 50), 'Ghazghkull': (10, 130, 50),
        'VengefulSpirit': (255, 40, 40), 'abaddon': (255, 40, 40),
        'portal': (90, 180, 255), 'LordofChange': (90, 180, 255),
        'HiveShip': (190, 80, 255), 'tyranids': (190, 80, 255)}
# 亂入角色的頭（原檔像素座標：頭的水平中線、台詞冒出來的高度）：網頁用來把頭對齊門的中線、台詞從頭上冒出
RAIDER_HEAD = {'Ghazghkull': (195, 70), 'abaddon': (190, 60), 'LordofChange': (168, 105), 'tyranids': (178, 30)}


# 休假吃飯圖：薄薄一層金光（原本 CSS 的 drop-shadow 1px＋3px），四邊各留 8px（圖高 160 的 5%）
DAYOFF_PAD = 8


def glow(frame, color, pad=GLOW_PAD, layers=((GLOW_SIGMA, GLOW_GAIN),)):
    w, h = frame.size
    out = Image.new('RGBA', (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    a = Image.new('L', out.size, 0)
    a.paste(frame.getchannel('A'), (pad, pad))
    for sigma, gain in layers:
        halo = Image.new('RGBA', out.size, color + (0,))
        halo.putalpha(a.filter(ImageFilter.GaussianBlur(sigma)).point(lambda v, g=gain: min(255, int(v * g))))
        out.alpha_composite(halo)
    out.alpha_composite(frame, (pad, pad))
    return out


# 必殺技、召喚攻擊動圖：每一格都留、每格固定時間（網頁照這個節奏對傷害時間點）。
# 第二套必殺技和召喚攻擊只播一次、停在最後一格（網頁淡出）
SP_FRAME_MS = {'Emperor_attack_sp': 70, 'GUO_attack_sp': 70, 'Emperor_attack_sp2': 70, 'GUO_attack_sp2': 70,
               'Emperor_Summon_attack': 100, 'GUO_Summon_attack': 100}
PLAY_ONCE = {'Emperor_attack_sp2', 'GUO_attack_sp2', 'Emperor_Summon_attack', 'GUO_Summon_attack'}
# 亂入角色動圖：原檔每格 120ms（Pillow 讀不到這些檔的每格時間），每一格都留；網頁照片長（meta.json 的 ms）排傷害
RAIDER_FRAME_MS = 120


def trim_box(im):
    """Union of the non-transparent area over all frames, so figures stand flush on the bar."""
    box = None
    for i in range(getattr(im, 'n_frames', 1)):
        im.seek(i)
        b = im.convert('RGBA').getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
        if b:
            box = b if not box else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    im.seek(0)
    return box


def fit(im, h):
    return im if not h or im.height <= h else im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


LOVE = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'love'
LOVE.mkdir(parents=True, exist_ok=True)
LOVE_SIZES = {'m_walk': 128, 'm_kiss': 128, 'f_walk': 128, 'f_kiss': 128, 'wall': 96, 'heart': None, 'Immaterium': None}


def build(name, h, OUT):
    im = Image.open(SRC / f'{name}.webp')
    n = getattr(im, 'n_frames', 1)
    box = trim_box(im) if im.mode in ('RGBA', 'P', 'LA') or 'transparency' in im.info else None
    crop = (lambda x: x.crop(box)) if box else (lambda x: x)
    # 神祇：裁、縮好之後才加光暈（光暈的大小才跟顯示大小對得上）
    finish = ((lambda f: glow(f, GLOW[name])) if name in GLOW
              else (lambda f: glow(f, (255, 215, 0), DAYOFF_PAD, ((1, 2.0), (3, 1.4)))) if name == 'day_off'
              else (lambda f: glow(f, WARP[name], 16, ((6, 1.8),))) if name in WARP
              else (lambda f: f))
    if n > 1:
        frames, durs = [], []
        sp = name in SP_FRAME_MS
        raider = name in RAIDER_HEAD
        for i in range(0, n, 1 if sp or raider else 2):  # 20 fps -> 10 fps（必殺技、亂入角色不減格）
            im.seek(i)
            frames.append(finish(fit(crop(im.convert('RGBA')), h)))
            durs.append(SP_FRAME_MS[name] if sp else RAIDER_FRAME_MS if raider else (im.info.get('duration') or 50) * 2)
        frames[0].save(OUT / f'{name}.webp', save_all=True, append_images=frames[1:], duration=durs, loop=1 if name in PLAY_ONCE else 0,
                       quality=70, method=6, lossless=False)
        if name not in PLAY_ONCE:
            frames[0].save(OUT / f'{name}_still.webp', quality=75, method=6)
        if raider:  # 播完停在最後一格淡出
            frames[-1].save(OUT / f'{name}_end.webp', quality=75, method=6)
    else:
        finish(fit(crop(im.convert('RGBA' if im.mode in ('RGBA', 'P') else 'RGB')), h)).save(OUT / f'{name}.webp', quality=78, method=6)
    print(name, (OUT / f'{name}.webp').stat().st_size // 1024, 'KB')


# 加了參數就只建那幾張（例如 python scripts/build_game_assets.py GUO_troops5 Emperor_troops5），meta.json 照樣重寫
ONLY = set(sys.argv[1:])
for name, h in SIZES.items():
    if not ONLY or name in ONLY:
        build(name, h, OUT)
for name, h in LOVE_SIZES.items():
    if not ONLY or name in ONLY:
        build(name, h, LOVE)
# love 的人物寬高比（網頁用來把兩人面對面靠在一起）
(LOVE / 'meta.json').write_text(json.dumps({n: dict(zip(('w', 'h'), Image.open(LOVE / f'{n}.webp').size))
                                            for n in ('m_walk', 'm_kiss', 'f_walk', 'f_kiss', 'wall')}), encoding='utf-8')
print('love total', sum(p.stat().st_size for p in LOVE.glob('*.webp')) // 1024, 'KB')
# 人物中線：第一格不透明像素的水平重心（武器讓圖片偏一邊，不能用圖片中心），網頁用來左右對稱擺放
meta = {}
for name in ('Emperor', 'GUO'):
    im = Image.open(OUT / f'{name}.webp').convert('RGBA')
    a = im.getchannel('A')
    w, h = im.size
    tot = sx = 0
    for x in range(w):
        col = sum(1 for y in range(h) if a.getpixel((x, y)) > 8)
        tot += col; sx += col * x
    meta[name] = {'w': w, 'h': h, 'cx': round(sx / tot / w, 4)}
for name in ('Emperor_win', 'GUO_loss', 'win', 'vs', 'webway', 'VengefulSpirit', 'portal', 'HiveShip', 'Summon_SilentKing', 'Summon_Rotigus'):
    w, h = Image.open(OUT / f'{name}.webp').size
    meta[name] = {'w': w, 'h': h}
# 亂入角色：寬高、頭在圖上的位置（hx、hy，0～1，含光暈留白）、片長（ms）
for name, (x, y) in RAIDER_HEAD.items():
    src = Image.open(SRC / f'{name}.webp')
    box = trim_box(src)
    k = min(1, SIZES[name] / (box[3] - box[1]))
    w, h = Image.open(OUT / f'{name}.webp').size
    meta[name] = {'w': w, 'h': h, 'hx': round(((x - box[0]) * k + 16) / w, 3), 'hy': round(((y - box[1]) * k + 16) / h, 3),
                  'ms': src.n_frames * RAIDER_FRAME_MS}
(OUT / 'meta.json').write_text(json.dumps(meta), encoding='utf-8')
print(meta)
print('total', sum(p.stat().st_size for p in OUT.glob('*.webp')) // 1024, 'KB')
