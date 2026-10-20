"""Shrink the mini-game art in mini_game/ (originals, not committed) into docs/game/ for the site.

Animated gods: 240 px tall, 10 fps (every other frame, each shown twice as long). Fight cloud: 200 px.
Static art: 240 px tall. Background: as is. Transparent margins are trimmed (all frames). Also writes *_still.webp (first frame) for paused state.
Run: python scripts/build_game_assets.py
"""
import pathlib
from PIL import Image

SRC = pathlib.Path(__file__).resolve().parent.parent / 'mini_game'
OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'game'
OUT.mkdir(parents=True, exist_ok=True)
SIZES = {'Emperor': 240, 'GUO': 240, 'fight-cloud': 200, 'Emperor_win': 240, 'Emperor_loss': 240,
         'GUO_win': 240, 'GUO_loss': 240, 'Emperor_troops': 160, 'GUO_troops': 160, 'Immaterium': None}


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


for name, h in SIZES.items():
    im = Image.open(SRC / f'{name}.webp')
    n = getattr(im, 'n_frames', 1)
    box = trim_box(im) if im.mode in ('RGBA', 'P', 'LA') or 'transparency' in im.info else None
    crop = (lambda x: x.crop(box)) if box else (lambda x: x)
    if n > 1:
        frames, durs = [], []
        for i in range(0, n, 2):  # 20 fps -> 10 fps
            im.seek(i)
            frames.append(fit(crop(im.convert('RGBA')), h))
            durs.append(im.info.get('duration', 50) * 2)
        frames[0].save(OUT / f'{name}.webp', save_all=True, append_images=frames[1:], duration=durs, loop=0,
                       quality=70, method=6, lossless=False)
        frames[0].save(OUT / f'{name}_still.webp', quality=75, method=6)
    else:
        fit(crop(im.convert('RGBA' if im.mode in ('RGBA', 'P') else 'RGB')), h).save(OUT / f'{name}.webp', quality=78, method=6)
    print(name, (OUT / f'{name}.webp').stat().st_size // 1024, 'KB')
print('total', sum(p.stat().st_size for p in OUT.glob('*.webp')) // 1024, 'KB')
