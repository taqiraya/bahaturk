"""Split original fonts by unicode coverage; retain all characters and outlines."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / ".runtime" / "font-tools"))
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen


def ranges(points):
    result = []
    start = previous = None
    for point in sorted(points):
        if start is None:
            start = previous = point
        elif point == previous + 1:
            previous = point
        else:
            result.append(f"U+{start:X}" if start == previous else f"U+{start:X}-{previous:X}")
            start = previous = point
    if start is not None:
        result.append(f"U+{start:X}" if start == previous else f"U+{start:X}-{previous:X}")
    return ",".join(result)


output = ROOT / "src/assets/fonts/optimized"
output.mkdir(parents=True, exist_ok=True)
faces = [
    ("InterVariable", "bahaturk-inter", "100 900"),
    ("Inter_18pt-Medium", "bahaturk-inter-medium", "500"),
    ("Inter_18pt-ExtraBold", "bahaturk-inter-extrabold", "800"),
]
css = []
report = []
ui_characters = set(map(ord, "".join(path.read_text(encoding="utf-8") for path in (ROOT / "src").rglob("*.jsx"))))
for name, family, weight in faces:
    source = ROOT / "src/assets/fonts" / f"{name}.woff2"
    original = TTFont(source)
    cmap = original.getBestCmap()
    core = {cp for cp in cmap if cp <= 0x00FF or 0x2000 <= cp <= 0x206F or 0x20A0 <= cp <= 0x20CF or cp in ui_characters}
    remainder = set(cmap) - core
    covered = set()
    for label, points in [("core", core), ("extended", remainder)]:
        font = TTFont(source)
        options = subset.Options()
        options.layout_features = ["*"]
        options.name_IDs = ["*"]
        options.name_languages = ["*"]
        options.name_legacy = True
        options.retain_gids = True
        options.glyph_names = True
        options.recalc_timestamp = False
        tool = subset.Subsetter(options=options)
        tool.populate(unicodes=points)
        tool.subset(font)
        font.flavor = "woff2"
        filename = f"{name}-{label}.woff2"
        font.save(output / filename)
        saved = TTFont(output / filename)
        actual = saved.getBestCmap()
        assert set(actual) == points, "Unicode coverage changed"
        covered.update(actual)
        # Preserve original advances and outlines, including variable weights.
        locations = [{}, {"wght": 500}, {"wght": 800}] if "fvar" in original else [{}]
        for location in locations:
            before = original.getGlyphSet(location=location)
            after = saved.getGlyphSet(location=location)
            for cp in points:
                assert original["hmtx"].metrics[cmap[cp]] == saved["hmtx"].metrics[actual[cp]], f"Metrics changed: {cp}"
                if location and not (0x20 <= cp <= 0x7F or 0x2000 <= cp <= 0x206F):
                    continue
                a = before[cmap[cp]]
                b = after[actual[cp]]
                assert a.width == b.width, f"Advance changed: {cp}"
                pa, pb = RecordingPen(), RecordingPen()
                a.draw(pa)
                b.draw(pb)
                assert pa.value == pb.value, f"Outline changed: {cp}"
        css.append(f'@font-face {{ font-family: "{family}"; src: url("./{filename}") format("woff2"); font-weight: {weight}; font-style: normal; font-display: swap; unicode-range: {ranges(points)}; }}')
        report.append({"file": filename, "bytes": (output / filename).stat().st_size, "characters": len(points), "coverageAndOutlinesVerified": True})
    assert covered == set(cmap), "Original characters were lost"
(output / "fonts.css").write_text("\n".join(css) + "\n", encoding="utf-8")
(ROOT / ".runtime/font-optimization.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
