#!/usr/bin/env python3
"""Sufra release helper: python3 release.py 0.6.4
Sets the version in js/app.js and index.html, and writes version.json with every file the app needs."""
import sys, json, re, os
v = sys.argv[1]
root = os.path.dirname(os.path.abspath(__file__))
def edit(path, pattern, repl):
    p = os.path.join(root, path); s = open(p, encoding="utf-8").read()
    s2 = re.sub(pattern, repl, s); assert s2 != s or repl in s, path
    open(p, "w", encoding="utf-8").write(s2)
edit("js/app.js", r'const APP_VERSION = "[^"]+"', f'const APP_VERSION = "{v}"')
edit("index.html", r'\?v=[0-9.]+', f'?v={v}')
dishes = json.load(open(os.path.join(root, "data/dishes/index.json")))["files"]
files = ["./", "index.html", "manifest.webmanifest", f"css/sufra.css?v={v}", f"js/app.js?v={v}",
         "i18n/en.json", "i18n/ar.json", "i18n/fr.json",
         "data/options.json", "data/families.json", "data/sources.json", "data/dishes/index.json",
         "data/foods/foods-core.json", "data/foods/foods-more.json"] + \
        [f"data/dishes/{f}.json" for f in dishes] + \
        ["icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png"]
for f in files:
    q = f.split("?")[0]
    assert q == "./" or os.path.exists(os.path.join(root, q)), "missing " + q
json.dump({"version": v, "files": files}, open(os.path.join(root, "version.json"), "w"), indent=1)
print("release", v, "with", len(files), "files")
