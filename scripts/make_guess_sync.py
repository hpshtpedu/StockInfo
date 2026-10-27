"""產生台股競猜的同步雜湊 -> worker/wrangler.toml 的 GUESS_SYNC_HASH（只需要做一次，換主帳號密碼時再跑）。

在自己的電腦執行：
  python scripts/make_guess_sync.py
輸入主帳號密碼（畫面不會顯示），先跟 docs/private-verifier.json 比對，打錯不會寫入。
同步金鑰＝PBKDF2-SHA256(密碼, 固定 salt)，跟 docs/private-vault.js 登入時推出來的一樣；
檔案裡只寫金鑰的 SHA-256，不寫密碼也不寫金鑰。推上去後 GitHub Actions 會自動部署 Worker。
"""
import base64
import getpass
import hashlib
import hmac
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
VERIFIER = ROOT / 'docs' / 'private-verifier.json'
TOML = ROOT / 'worker' / 'wrangler.toml'
SYNC_SALT = b'stockinfo-guess-sync-v1'
ITERATIONS = 300_000


def main():
    v = json.loads(VERIFIER.read_text(encoding='utf-8'))
    pw = getpass.getpass('主帳號密碼：').encode('utf-8')
    got = hashlib.pbkdf2_hmac('sha256', pw, base64.b64decode(v['salt']), v.get('iterations', ITERATIONS), dklen=32)
    if not hmac.compare_digest(got, base64.b64decode(v['hash'])):
        print('密碼不對（跟 private-verifier.json 的主帳號不符），沒有寫入')
        return 1
    token = base64.b64encode(hashlib.pbkdf2_hmac('sha256', pw, SYNC_SALT, ITERATIONS, dklen=32)).decode()
    digest = base64.b64encode(hashlib.sha256(token.encode()).digest()).decode()
    text = TOML.read_text(encoding='utf-8')
    new, n = re.subn(r'^GUESS_SYNC_HASH = ".*"$', f'GUESS_SYNC_HASH = "{digest}"', text, flags=re.M)
    if n != 1:
        print(f'{TOML} 裡找不到 GUESS_SYNC_HASH 那一行')
        return 1
    TOML.write_text(new, encoding='utf-8')
    print(f'已寫入 {TOML}（只有雜湊）。git add 這個檔案後推上去即可。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
