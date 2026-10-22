"""Turn mini_game/storyline.txt (original, not committed) into docs/game/story.json for the mini-game ticker.

Each { tag: "...", text: "..." } becomes 「【tag】text」, a neutral news line added to the 銀河快訊 pool.
Gemini's [cite: N] notes are stripped.
Run: python scripts/build_story.py
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / 'mini_game' / 'storyline.txt').read_text(encoding='utf-8')
src = re.sub(r'\[cite:[^\]]*\]', '', src)
lines = []
for tag, text in re.findall(r'tag:\s*"([^"]+)"\s*,\s*text:\s*"([^"]+)"', src):
    tag, text = tag.strip(), text.strip()
    if not text.endswith(('。', '！', '？')):
        text += '。'
    line = f'【{tag}】{text}'
    if line not in lines:
        lines.append(line)
(ROOT / 'docs' / 'game' / 'story.json').write_text(json.dumps(lines, ensure_ascii=False, indent=0), encoding='utf-8')
print(len(lines), 'lines')
