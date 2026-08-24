"""Regenerate C:\\Users\\user\\Downloads\\cookies_env_value.txt from a fresh cookies.txt export.

Usage: python scripts/make_cookie_env.py [path-to-cookies.txt]
"""
import os
import sys

src = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\user\Downloads\cookies.txt"
out = os.path.join(os.path.dirname(os.path.abspath(src)), "cookies_env_value.txt")

essential = (
    "LOGIN_INFO", "SID", "HSID", "SSID", "APISID", "SAPISID",
    "__Secure-1PAPISID", "__Secure-1PSID", "__Secure-1PSIDTS", "__Secure-1PSIDCC",
    "__Secure-3PAPISID", "__Secure-3PSID", "__Secure-3PSIDTS", "__Secure-3PSIDCC",
    "VISITOR_INFO1_LIVE", "YSC", "PREF", "SOCS", "CONSENT",
)

raw = open(src, encoding="utf-8").read().replace("\r\n", "\n")
keep = ["# Netscape HTTP Cookie File", "# https://curl.haxx.se/rfc/cookie_spec.html"]
seen = set()
for line in raw.split("\n"):
    parts = line.split("\t")
    if len(parts) == 7 and ".youtube.com" in parts[0] and parts[5] in essential and parts[5] not in seen:
        keep.append(line)
        seen.add(parts[5])

value = "\\n".join(keep)
open(out, "w", encoding="utf-8", newline="").write(value)
print(f"written: {out}")
print(f"size: {len(value)} chars ({round(len(value)/1024, 2)} KB), cookies: {len(seen)}")
if len(value) > 60000:
    print("WARNING: exceeds Vercel 64KB limit")
