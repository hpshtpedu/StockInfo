"""產生私人自選股頁的密碼驗證資料 -> docs/private-verifier.json（只需要做一次，換密碼時再跑）。

在自己的電腦執行：python scripts/make_private_verifier.py
輸入密碼時畫面不會顯示；密碼本身不會寫進任何檔案，檔案裡只有 PBKDF2-SHA256 的 salt 與雜湊。
（雜湊公開在網站上：任何人都能拿去離線猜密碼，所以請用夠長、只用在這裡的密碼。）
"""
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
    pw = getpass.getpass('私人頁密碼（至少 10 個字）：')
    if len(pw) < 10:
        print('密碼太短，至少 10 個字')
        return 1
    if getpass.getpass('再輸入一次：') != pw:
        print('兩次不一樣')
        return 1
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), salt, ITERATIONS, dklen=32)
    OUT.write_text(json.dumps({
        'v': 1, 'kdf': 'PBKDF2-SHA256', 'iterations': ITERATIONS,
        'salt': base64.b64encode(salt).decode(), 'hash': base64.b64encode(digest).decode(),
    }) + '\n', encoding='utf-8')
    print(f'已寫入 {OUT}（不含密碼）。git add 這個檔案後推上去即可。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
