#!/usr/bin/env python3
"""Render outlined SVG assets for the GitHub profile README.

Text is converted to paths so GitHub's image proxy does not need webfonts.
Palette is a quiet charcoal field with one low-saturation teal accent.
"""

from __future__ import annotations

import html
import re
from pathlib import Path

from fontTools.misc.transform import Transform
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"

FIELD = "#111315"
HAIRLINE = "#2C3036"
INK = "#E8E6E3"
MUTE = "#A8AAA8"
TEAL = "#6AA8A2"

INTER_REG = "/usr/share/fonts/truetype/macos/Inter-Regular.ttf"
INTER_MED = "/usr/share/fonts/truetype/macos/Inter-Medium.ttf"
INTER_SEMI = "/usr/share/fonts/truetype/macos/Inter-SemiBold.ttf"
JB_MONO = "/usr/share/fonts/truetype/macos/JetBrainsMono-Regular.ttf"

MOTION_CSS = """
<style>
@media (prefers-reduced-motion: reduce) {
  animate, animateTransform { display: none !important; }
}
</style>
""".strip()


class OutlineFont:
    def __init__(self, path: str) -> None:
        self.tt = TTFont(path)
        self.glyphs = self.tt.getGlyphSet()
        self.upem = self.tt["head"].unitsPerEm
        self.cmap = self.tt.getBestCmap()

    def _advance(self, char: str) -> int:
        name = self.cmap.get(ord(char))
        if name is None:
            return 0
        return int(self.glyphs[name].width)

    def width(self, text: str, size: float, tracking: float = 0) -> float:
        scale = size / self.upem
        total = 0.0
        for i, char in enumerate(text):
            if char == " ":
                total += self._advance(" ") * scale
            else:
                total += self._advance(char) * scale
            if i < len(text) - 1:
                total += tracking
        return total

    def paths(self, text: str, x: float, y: float, size: float, fill: str, tracking: float = 0) -> str:
        scale = size / self.upem
        cursor = x
        chunks: list[str] = []
        for i, char in enumerate(text):
            if char == " ":
                cursor += self._advance(" ") * scale
                if i < len(text) - 1:
                    cursor += tracking
                continue
            name = self.cmap.get(ord(char))
            if name is None:
                cursor += size * 0.45
                continue
            glyph = self.glyphs[name]
            pen = SVGPathPen(self.glyphs)
            transform = Transform(scale, 0, 0, -scale, cursor, y)
            glyph.draw(TransformPen(pen, transform))
            d = _round_path(pen.getCommands())
            if d:
                chunks.append(f'<path fill="{fill}" d="{d}"/>')
            cursor += glyph.width * scale
            if i < len(text) - 1:
                cursor += tracking
        return "\n    ".join(chunks)


def _round_path(d: str) -> str:
    return re.sub(r"-?\d+\.\d+", lambda m: f"{float(m.group()):.2f}", d)


def svg_doc(width: int, height: int, title: str, desc: str, body: str) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
  <title id="title">{html.escape(title)}</title>
  <desc id="desc">{html.escape(desc)}</desc>
  {MOTION_CSS}
  {body}
</svg>
"""


def header_svg(inter_semi: OutlineFont, inter_reg: OutlineFont, mono: OutlineFont) -> str:
    name = "Tanishq Bafna"
    role = "Product & UX designer"
    typed = "design systems  ·  HCI  ·  AI + Figma"
    loc = "MUMBAI"

    name_size = 36
    role_size = 14.5
    typed_size = 12.5
    loc_size = 10.5
    tb_size = 9.5

    name_w = inter_semi.width(name, name_size, tracking=-0.4)
    typed_w = mono.width(typed, typed_size, tracking=0.4)
    loc_w = mono.width(loc, loc_size, tracking=1.8)
    tb_w = mono.width("TB", tb_size, tracking=0.6)

    mark = 22
    mark_x, mark_y = 28, 26
    tb_x = mark_x + (mark - tb_w) / 2
    tb_y = mark_y + 15.2

    body = f"""
  <defs>
    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#E8E6E3" stroke-width="0.4" opacity="0.045"/>
    </pattern>
    <radialGradient id="wash" cx="78%" cy="16%" r="58%">
      <stop offset="0%" stop-color="{TEAL}" stop-opacity="0.10">
        <animate attributeName="stop-opacity" values="0.06;0.13;0.06" dur="18s" repeatCount="indefinite"/>
      </stop>
      <stop offset="100%" stop-color="{TEAL}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="typeClip">
      <rect x="28" y="150" width="{typed_w + 18:.2f}" height="24">
        <animate attributeName="width" from="0" to="{typed_w + 18:.2f}" dur="2.4s" begin="0.35s" fill="freeze"/>
      </rect>
    </clipPath>
  </defs>
  <rect width="800" height="192" fill="{FIELD}"/>
  <rect width="800" height="192" fill="url(#wash)"/>
  <rect width="800" height="192" fill="url(#grid)"/>
  <rect x="0.5" y="0.5" width="799" height="191" fill="none" stroke="{HAIRLINE}" stroke-width="1"/>

  <rect x="{mark_x}" y="{mark_y}" width="{mark}" height="{mark}" fill="none" stroke="{HAIRLINE}" stroke-width="1"/>
    {mono.paths("TB", tb_x, tb_y, tb_size, TEAL, tracking=0.6)}
    {mono.paths(loc, 800 - 28 - loc_w, 41.5, loc_size, MUTE, tracking=1.8)}

    {inter_semi.paths(name, 28, 96, name_size, INK, tracking=-0.4)}
    {inter_reg.paths(role, 28, 118, role_size, MUTE)}

  <line x1="28" y1="142" x2="772" y2="142" stroke="{TEAL}" stroke-width="1" opacity="0.28"/>
  <rect x="28" y="141.5" width="64" height="1" fill="{TEAL}" opacity="0.95">
    <animate attributeName="x" values="28;708;28" dur="20s" repeatCount="indefinite"/>
  </rect>

  <g clip-path="url(#typeClip)">
    {mono.paths(typed, 28, 166, typed_size, INK, tracking=0.4)}
  </g>
  <rect x="{28 + typed_w + 6:.2f}" y="154.5" width="1.25" height="13" fill="{TEAL}">
    <animate attributeName="x" from="28" to="{28 + typed_w + 6:.2f}" dur="2.4s" begin="0.35s" fill="freeze"/>
    <animate attributeName="opacity" values="1;1;0;1;0;1;0;1" keyTimes="0;0.55;0.62;0.7;0.78;0.86;0.93;1" dur="4.2s" begin="0.35s" fill="freeze"/>
  </rect>
"""
    # name_w unused except to keep layout honest if we later right-edge align
    _ = name_w
    return svg_doc(
        800,
        192,
        "Tanishq Bafna — Product & UX designer",
        "Product and UX designer based in Mumbai. Design systems, HCI, and AI + Figma tooling.",
        body,
    )


def work_card(
    inter_med: OutlineFont,
    inter_reg: OutlineFont,
    mono: OutlineFont,
    kicker: str,
    title: str,
    line1: str,
    line2: str,
    label: str,
) -> str:
    kicker_w = mono.width(kicker, 11, tracking=1.6)
    title_size = 16
    body_size = 12.5

    body = f"""
  <rect width="392" height="124" fill="{FIELD}"/>
  <rect x="0.5" y="0.5" width="391" height="123" fill="none" stroke="{HAIRLINE}" stroke-width="1"/>
  <rect x="0" y="0" width="2" height="124" fill="{TEAL}"/>
    {mono.paths(kicker, 20, 32, 11, TEAL, tracking=1.6)}
    {inter_med.paths(title, 20, 58, title_size, INK)}
    {inter_reg.paths(line1, 20, 86, body_size, MUTE)}
    {inter_reg.paths(line2, 20, 104, body_size, MUTE)}
  <path d="M 364 24 L 372 32 L 364 40" fill="none" stroke="{TEAL}" stroke-width="1.2" stroke-linecap="square" stroke-linejoin="miter"/>
"""
    _ = kicker_w
    return svg_doc(
        392,
        124,
        label,
        f"{title}. {line1} {line2}",
        body,
    )


def main() -> None:
    ASSETS.mkdir(exist_ok=True)
    inter_reg = OutlineFont(INTER_REG)
    inter_med = OutlineFont(INTER_MED)
    inter_semi = OutlineFont(INTER_SEMI)
    mono = OutlineFont(JB_MONO)

    header = header_svg(inter_semi, inter_reg, mono)
    keyline = work_card(
        inter_med,
        inter_reg,
        mono,
        "KEYLINE",
        "Figma map for AI agents",
        "Resolve a master. Get a short usage card.",
        "Place the right thing — not a new system.",
        "Keyline",
    )
    portfolio = work_card(
        inter_med,
        inter_reg,
        mono,
        "PORTFOLIO",
        "Selected product & UX work",
        "Case studies in product and interaction.",
        "tanishqbafna.com",
        "Portfolio",
    )

    (ASSETS / "header.svg").write_text(header)
    (ASSETS / "card-keyline.svg").write_text(keyline)
    (ASSETS / "card-portfolio.svg").write_text(portfolio)
    print("wrote", ASSETS / "header.svg")
    print("wrote", ASSETS / "card-keyline.svg")
    print("wrote", ASSETS / "card-portfolio.svg")


if __name__ == "__main__":
    main()
