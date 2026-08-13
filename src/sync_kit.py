"""
Refresh the vendored shared chrome (src/kit/) from the boq-kit master repo.

src/kit/ is a VENDORED COPY: git-tracked so this repo stays self-contained and
buildable offline, but never hand-edited. Edit boq-kit, bump its KIT_VERSION,
then run this script here and rebuild.

    python src/sync_kit.py                 # from the default master path
    python src/sync_kit.py --from D:/x     # from somewhere else
    python src/sync_kit.py --force         # overwrite locally modified files

Refuses to clobber a vendored file that has been edited in place (that would
silently drop someone's change) unless --force is given.

See docs/BOQ-SHARED-CHROME.md §5.
"""
import argparse, hashlib, json, os, shutil, sys

ROOT        = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIT_DIR     = f"{ROOT}/src/kit"
SOURCE_FILE = f"{KIT_DIR}/.kit-source"
DEFAULT_SRC = "C:/Projects/boq-kit"

# Files pulled from the master repo. fonts/ is copied wholesale.
KIT_FILES = ["KIT_VERSION", "kit.css", "kit.js", "kit-export.js", "bridge.js",
             "brand.schema.json"]
KIT_DIRS  = ["fonts"]


def sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def read_version(base):
    p = f"{base}/KIT_VERSION"
    return open(p, encoding="utf-8").read().strip() if os.path.exists(p) else "(none)"


def load_manifest():
    p = f"{KIT_DIR}/.kit-manifest.json"
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="src", default=None, help="path to the boq-kit repo")
    ap.add_argument("--force", action="store_true", help="overwrite locally modified files")
    args = ap.parse_args()

    src = args.src
    if not src and os.path.exists(SOURCE_FILE):
        src = open(SOURCE_FILE, encoding="utf-8").read().strip()
    src = src or DEFAULT_SRC
    if not os.path.isdir(src):
        sys.exit(f"boq-kit not found at {src}\n"
                 f"Clone it, or pass --from <path>.")

    old_ver, new_ver = read_version(KIT_DIR), read_version(src)
    manifest, dirty = load_manifest(), []

    # Guard: did anyone hand-edit a vendored file since the last sync?
    for rel, digest in manifest.items():
        local = f"{KIT_DIR}/{rel}"
        if os.path.exists(local) and sha(local) != digest:
            dirty.append(rel)
    if dirty and not args.force:
        sys.exit("Locally modified vendored file(s) — refusing to overwrite:\n  "
                 + "\n  ".join(dirty)
                 + "\n\nThe kit is not editable here. Port the change into boq-kit, or"
                   " re-run with --force to discard it.")

    os.makedirs(KIT_DIR, exist_ok=True)
    new_manifest, copied = {}, 0

    for rel in KIT_FILES:
        s = f"{src}/{rel}"
        if not os.path.exists(s):
            sys.exit(f"Missing in boq-kit: {rel}")
        shutil.copy2(s, f"{KIT_DIR}/{rel}")
        new_manifest[rel] = sha(s)
        copied += 1

    for d in KIT_DIRS:
        s_dir = f"{src}/{d}"
        if not os.path.isdir(s_dir):
            continue
        os.makedirs(f"{KIT_DIR}/{d}", exist_ok=True)
        for fn in sorted(os.listdir(s_dir)):
            s = f"{s_dir}/{fn}"
            if os.path.isfile(s):
                shutil.copy2(s, f"{KIT_DIR}/{d}/{fn}")
                new_manifest[f"{d}/{fn}"] = sha(s)
                copied += 1

    with open(f"{KIT_DIR}/.kit-manifest.json", "w", encoding="utf-8") as f:
        json.dump(new_manifest, f, indent=2, sort_keys=True)
    with open(SOURCE_FILE, "w", encoding="utf-8") as f:
        f.write(src)

    print(f"Kit synced from {src}")
    print(f"  version: {old_ver} -> {new_ver}" if old_ver != new_ver
          else f"  version: {new_ver} (unchanged)")
    print(f"  {copied} file(s) copied into src/kit/")
    if dirty:
        print(f"  WARNING: discarded local edits to {', '.join(dirty)}")
    print("\nNow run: python src/build_tool.py")


if __name__ == "__main__":
    main()
