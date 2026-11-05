"""Build the printable, standalone user guide from its Markdown source."""
from pathlib import Path
import html
import re

root = Path(__file__).resolve().parents[1]
source = root / "docs" / "FleetGo_User_Guide.md"
target = source.with_suffix(".html")
blocks = []
contents = []
paragraph = []
list_kind = None


def flush():
    if paragraph:
        blocks.append("<p>" + html.escape(" ".join(paragraph)) + "</p>")
        paragraph.clear()


def close_list():
    global list_kind
    if list_kind:
        blocks.append(f"</{list_kind}>")
        list_kind = None


for line in source.read_text(encoding="utf-8").splitlines():
    heading = re.match(r"^(#{1,3}) (.+)$", line)
    item = re.match(r"^(?:(\d+)\. |(-) )(.+)$", line)
    if heading:
        flush()
        close_list()
        level, title = len(heading[1]), heading[2]
        anchor = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
        blocks.append(f'<h{level} id="{anchor}">{html.escape(title)}</h{level}>')
        if level == 2:
            contents.append(f'<li><a href="#{anchor}">{html.escape(title)}</a></li>')
    elif item:
        flush()
        kind = "ol" if item[1] else "ul"
        if kind != list_kind:
            close_list()
            blocks.append(f"<{kind}>")
            list_kind = kind
        blocks.append("<li>" + html.escape(item[3]) + "</li>")
    elif not line.strip():
        flush()
        close_list()
    else:
        close_list()
        paragraph.append(line.strip())
flush()
close_list()

style = """
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; color: #20292d; background: #f0f3f2; font: 17px/1.65 'Segoe UI', Arial, sans-serif; }
main { max-width: 920px; margin: 32px auto; padding: 54px 64px; background: white; }
h1,h2,h3 { color: #000; line-height: 1.25; scroll-margin-top: 24px; }
h1 { font-size: 36px; margin: 0 0 28px; }
h2 { font-size: 25px; margin: 46px 0 18px; }
h3 { font-size: 20px; margin: 28px 0 12px; }
p { margin: 0 0 16px; }
li { margin-bottom: 9px; padding-left: 4px; }
ol,ul { padding-left: 26px; margin: 12px 0 22px; }
a { color: #155b59; text-underline-offset: 3px; }
nav { margin: 28px 0; }
nav ul { columns: 2; column-gap: 32px; font-size: 15px; }
nav li { break-inside: avoid; }
button { border: 0; border-radius: 6px; background: #174b49; color: white; padding: 12px 18px; font: inherit; cursor: pointer; }
.tools { max-width: 920px; margin: 24px auto 0; padding: 0 16px; }
.tools p { font-size: 15px; margin-top: 8px; }
@media (max-width: 700px) { main { margin: 12px; padding: 28px 22px; } nav ul { columns: 1; } h1 { font-size: 30px; } }
@page { size: A4; margin: 19mm 19mm 20mm; }
@media print {
 body { background: white; color: black; font: 11pt/1.4 Arial, sans-serif; }
 main { max-width: none; margin: 0; padding: 0; }
 .tools { display: none; }
 h1 { font-size: 25pt; }
 h2 { font-size: 17pt; margin: 22pt 0 10pt; break-after: avoid; }
 h3 { font-size: 13pt; margin: 15pt 0 7pt; break-after: avoid; }
 p,li { orphans: 3; widows: 3; }
 li { margin-bottom: 5pt; }
 a { color: black; text-decoration: none; }
 nav ul { font-size: 10pt; }
}
"""
document = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FleetGo user guide</title><style>""" + style + """</style></head><body>
<div class="tools"><button type="button" onclick="window.print()">Print or save as PDF</button>
<p>To share a PDF, select this button, choose Save as PDF in the print window, and check the preview.</p></div><main>"""
# Keep the introduction before the clickable contents.
insert_at = next(i for i, block in enumerate(blocks) if 'id="task-finder"' in block)
blocks.insert(insert_at, '<nav aria-label="Guide contents"><h2>Contents</h2><ul>' + "".join(contents) + '</ul></nav>')
target.write_text(document + "\n".join(blocks) + "</main></body></html>", encoding="utf-8")
print(f"Created {target}")
print(f"Words: {len(source.read_text(encoding='utf-8').split())}; sections: {len(contents)}")
