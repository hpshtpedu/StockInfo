"""產生私人頁的密碼驗證資料 -> docs/private-verifier.json（只需要做一次，換密碼時再跑）。

在自己的電腦執行：
  python scripts/make_private_verifier.py                  主帳號（自選股張數、戰鎚小遊戲）
  python scripts/make_private_verifier.py --profile love   其他帳號（例如 love：自己的小遊戲，不顯示自選股）
輸入密碼時畫面不會顯示；密碼本身不會寫進任何檔案，檔案裡只有 PBKDF2-SHA256 的 salt 與雜湊。
設定其中一個帳號時，其他帳號的資料原樣保留。
（雜湊公開在網站上：任何人都能拿去離線猜密碼，所以請用夠長、只用在這裡的密碼。）
"""
import argparse
import base64
import getpass
import hashlib
import json
import os
import pathlib
import sys

OUT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'private-verifier.json'
ITERATIONS = 300_000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--profile', help='其他帳號的名稱（例如 love）；不給就是主帳號')
    args = ap.parse_args()
    who = f'「{args.profile}」帳號' if args.profile else '主帳號'
    pw = getpass.getpass(f'{who}密碼（至少 6 個字）：')
    if len(pw) < 6:
        print('密碼太短，至少 6 個字')
        return 1
    if getpass.getpass('再輸入一次：') != pw:
        print('兩次不一樣')
        return 1
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), salt, ITERATIONS, dklen=32)
    entry = {'salt': base64.b64encode(salt).decode(), 'hash': base64.b64encode(digest).decode()}
    data = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    if args.profile:
        if not data.get('hash'):
            print('請先設定主帳號（不加 --profile 跑一次）')
            return 1
        accounts = [a for a in data.get('accounts', []) if a.get('profile') != args.profile]
        data['accounts'] = accounts + [{'profile': args.profile, 'iterations': ITERATIONS, **entry}]
    else:
        data = {'v': 1, 'kdf': 'PBKDF2-SHA256', 'iterations': ITERATIONS, **entry,
                **({'accounts': data['accounts']} if data.get('accounts') else {})}
    OUT.write_text(json.dumps(data) + '\n', encoding='utf-8')
    print(f'已寫入 {OUT}（不含密碼）。git add 這個檔案後推上去即可。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
