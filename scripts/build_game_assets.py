"""Shrink the mini-game art in mini_game/ (originals, not committed) into docs/game/ for the site.

Animated gods: 240 px tall, 10 fps (every other frame, each shown twice as long). Fight cloud: 200 px.
Static art: 240 px tall. Background: as is. Transparent margins are trimmed (all frames). Also writes *_still.webp (first frame) for paused state.
Also the love account's game art (docs/love/: walking/kissing couple, wall, heart, Immaterium background), kept
in its own folder so that account never loads the Warhammer files and vice versa.
Run: python scripts/build_game_assets.py
"""
import json
import pathlib
from PIL import Image

SRC = pathlib.Path(__file__).resolve().parent.parent / 'mini_game'
OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'game'
OUT.mkdir(parents=True, exist_ok=True)
SIZES = {'Emperor': 240, 'GUO': 240, 'fight-cloud': 200, 'Emperor_win': 240, 'Emperor_loss': 240,
         'GUO_win': 240, 'GUO_loss': 240, 'Emperor_troops': 160, 'GUO_troops': 160, 'Immaterium': None,
         'win': 120, 'loss': 120, 'vs': 120, 'damage': 64, 'Emperor_attack': 96, 'GUO_attack': 96,
         'GUO_place': 200, 'Emperor_place': 200, 'GUO_attack2': 160, 'Emperor_attack2': 160,
         'casino_closed': None, 'sleep': None, 'Emperor_attack1_2': 128, 'GUO_attack1_2': 128,
         'Emperor_attack2_2': 200, 'GUO_attack2_2': 160, 'day_off': 160, 'heart': None,
         'Emperor_attack_sp': None, 'GUO_attack_sp': None, 'GUO_mini_troops': 96, 'Emperor_mini_troops': 96}
# 必殺技動圖：每一格都留、每格 70ms（網頁照這個節奏對傷害時間點）
SP_FRAME_MS = 70


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
    if n > 1:
        frames, durs = [], []
        sp = name.endswith('_sp')
        for i in range(0, n, 1 if sp else 2):  # 20 fps -> 10 fps（必殺技不減格）
            im.seek(i)
            frames.append(fit(crop(im.convert('RGBA')), h))
            durs.append(SP_FRAME_MS if sp else (im.info.get('duration') or 50) * 2)
        frames[0].save(OUT / f'{name}.webp', save_all=True, append_images=frames[1:], duration=durs, loop=0,
                       quality=70, method=6, lossless=False)
        frames[0].save(OUT / f'{name}_still.webp', quality=75, method=6)
    else:
        fit(crop(im.convert('RGBA' if im.mode in ('RGBA', 'P') else 'RGB')), h).save(OUT / f'{name}.webp', quality=78, method=6)
    print(name, (OUT / f'{name}.webp').stat().st_size // 1024, 'KB')


for name, h in SIZES.items():
    build(name, h, OUT)
for name, h in LOVE_SIZES.items():
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
for name in ('Emperor_win', 'GUO_loss', 'win', 'vs'):
    w, h = Image.open(OUT / f'{name}.webp').size
    meta[name] = {'w': w, 'h': h}
(OUT / 'meta.json').write_text(json.dumps(meta), encoding='utf-8')
print(meta)
print('total', sum(p.stat().st_size for p in OUT.glob('*.webp')) // 1024, 'KB')
