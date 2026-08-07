"""Build the single-file showcase page.

`index.html` is the source and keeps `__VIDEO__` / `__POSTER__` as placeholders,
because a ~750 KB base64 blob checked into an HTML file makes every subsequent
diff unreadable. This inlines the media so the built page is self-contained —
it renders correctly from a file:// path, a static host, or a strict CSP that
blocks every external request.

    python3 build.py                 # -> dist/index.html
    python3 build.py --out /tmp/x.html

Regenerate the video itself with ../demo/record.mjs, which drives a real browser
against a running instance.
"""

from __future__ import annotations

import argparse
import base64
import pathlib

HERE = pathlib.Path(__file__).resolve().parent

MEDIA = {
    "__VIDEO__": (HERE / "demo.webm", "video/webm"),
    "__POSTER__": (HERE / "poster.png", "image/png"),
}


def build(source: pathlib.Path, out: pathlib.Path) -> pathlib.Path:
    html = source.read_text()
    for token, (path, mime) in MEDIA.items():
        if token not in html:
            raise SystemExit(f"{source.name} has no {token} placeholder to fill")
        if not path.exists():
            raise SystemExit(f"missing {path.name} — record it with demo/record.mjs")
        uri = f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()
        html = html.replace(token, uri)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", type=pathlib.Path, default=HERE / "index.html")
    ap.add_argument("--out", type=pathlib.Path, default=HERE / "dist" / "index.html")
    args = ap.parse_args()

    out = build(args.source, args.out)
    size = out.stat().st_size
    print(f"built {out} — {size:,} bytes ({size / 1_048_576:.2f} MiB)")


if __name__ == "__main__":
    main()
