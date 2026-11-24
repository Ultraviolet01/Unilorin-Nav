"""Generates the two printable field PDFs from the repo data:
   docs/coordinates-to-confirm.pdf and docs/photo-checklist.pdf
   Usage: python3 scripts/make-field-pdfs.py"""
import csv, json, re
from datetime import date
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

PURPLE = colors.HexColor("#7C3AED")
ss = getSampleStyleSheet()
P = ParagraphStyle("p", parent=ss["Normal"], fontName="Helvetica", fontSize=8.5, leading=10.5)
PB = ParagraphStyle("pb", parent=P, fontName="Helvetica-Bold")
H = ParagraphStyle("h", parent=ss["Heading2"], textColor=PURPLE, spaceBefore=10, spaceAfter=4)
T = ParagraphStyle("t", parent=ss["Title"], textColor=PURPLE, fontSize=20, alignment=0, spaceAfter=4)
SUB = ParagraphStyle("s", parent=P, fontSize=9.5, leading=13, textColor=colors.HexColor("#374151"))
slug = lambda s: re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower().replace("&", "and")))
esc = lambda s: str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

class Box(Flowable):
    def __init__(self, size=11): super().__init__(); self.size = size; self.width = self.height = size
    def draw(self): self.canv.setStrokeColor(colors.black); self.canv.setLineWidth(1); self.canv.rect(0, 0, self.size, self.size)

pois = json.load(open("data/pois.json"))
check = list(csv.DictReader(open("data/faculty-checklist.csv", encoding="utf8")))
paths = json.load(open("data/paths.json"))["features"]
have = {slug(p["name"]) for p in pois}
missing = [r for r in check if slug(r["name"]) not in have and not (r["lat"] and r["lng"] and slug(r["name"]) in have)]
for r in check: r["slug"] = slug(r["name"])

def footer(canvas, doc):
    canvas.saveState(); canvas.setFont("Helvetica", 7.5); canvas.setFillColor(colors.grey)
    canvas.drawString(12 * mm, 7 * mm, f"Unilorin Navigator - {doc.title} - generated {date.today().isoformat()}")
    canvas.drawRightString(doc.pagesize[0] - 12 * mm, 7 * mm, f"Page {doc.page}"); canvas.restoreState()

def table(rows, widths, head_bg=PURPLE):
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), head_bg), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F3FF")]),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]))
    return t
hdr = lambda *c: [Paragraph(f"<font color='white'><b>{x}</b></font>", P) for x in c]

# ============ PDF 1: coordinates to confirm ============
def what_to_check(p):
    c, n = p["category"], p["name"]
    if c == "hostel": return "Pin is the CENTRE of a hostel complex. Record the main entrance (and note the hostel's real name)."
    if c == "uith": return "Pin is the centre of the hospital grounds. Record the main gate, emergency entrance and the wards you can name."
    if c == "sports": return "Record the main entrance/gate, not the middle of the pitch."
    if c == "worship": return "Record the main entrance."
    if "Walkway" in n: return "Record the entrance."
    return "Record the front entrance (where a student walks in). Check the name on the signboard."

doc1 = SimpleDocTemplate("docs/coordinates-to-confirm.pdf", pagesize=landscape(A4), leftMargin=12*mm, rightMargin=12*mm, topMargin=12*mm, bottomMargin=14*mm, title="Coordinates to confirm")
s = [Paragraph("Coordinates to confirm on the ground", T),
     Paragraph("Every pin in the app came from OpenStreetMap or from tracing satellite imagery. <b>None has been checked on the ground.</b> "
               "Stand at the <b>entrance</b>, open <b>/field</b> on your phone, tap the place, press <b>Use my GPS</b>, wait for the accuracy to read "
               "<b>under +/-15 m</b> (move to open sky if worse), take the photo and Save. Tick the box here when done. Re-check pins also tell you how far off the current pin is.", SUB),
     Paragraph("A. Existing pins: confirm or correct (%d)" % len(pois), H)]
rows = [hdr("", "#", "Place", "Category", "Current lat, lng", "Source / last edited", "What to do", "Measured lat, lng")]
for i, p in enumerate(sorted(pois, key=lambda x: (x["campus"], x["category"], x["name"])), 1):
    src = re.sub(r"OpenStreetMap ", "OSM ", p.get("source", "")).replace("(last edited ", "(").replace("w", "way ", 1) if False else p.get("source", "").replace("OpenStreetMap ", "OSM ").replace("(last edited ", "(edited ")
    rows.append([Box(), Paragraph(str(i), P), Paragraph(f"<b>{esc(p['name'])}</b><br/><font size=7 color='#6B7280'>{'UITH & colleges tab' if p['campus']=='uith' else 'Main campus'}</font>", P),
                 Paragraph(p["category"], P), Paragraph(f"{p['lat']:.6f},<br/>{p['lng']:.6f}", P), Paragraph(esc(src), ParagraphStyle("x", parent=P, fontSize=7)), Paragraph(what_to_check(p), P), ""])
s.append(table(rows, [8*mm, 8*mm, 52*mm, 20*mm, 28*mm, 38*mm, 70*mm, 43*mm]))

todo = [r for r in check if not (r["lat"] and r["lng"])]
s += [Paragraph("B. Places with NO coordinates yet (%d)" % len(todo), H),
      Paragraph("Not in OpenStreetMap or any source we could use. Find each one, record its entrance, and write the coordinates here as a backup.", SUB)]
rows = [hdr("", "Place", "Category", "Tab", "What we know / what to find", "Measured lat, lng")]
for r in todo:
    rows.append([Box(), Paragraph(f"<b>{esc(r['name'])}</b>", P), Paragraph(r["category"], P), Paragraph("UITH & colleges" if r["campus"] == "uith" else r["campus"], P), Paragraph(esc(r["description"] or "-"), P), ""])
s.append(table(rows, [8*mm, 62*mm, 20*mm, 24*mm, 110*mm, 43*mm]))

withc = [r for r in check if r["lat"] and r["lng"] and r["slug"] not in have]
if withc:
    s += [Paragraph("C. Extra places with a coordinate from OpenStreetMap, not yet in the app (%d)" % len(withc), H)]
    rows = [hdr("", "Place", "Category", "OSM lat, lng", "Note", "Measured lat, lng")]
    for r in withc: rows.append([Box(), Paragraph(f"<b>{esc(r['name'])}</b>", P), Paragraph(r["category"], P), Paragraph(f"{float(r['lat']):.6f},<br/>{float(r['lng']):.6f}", P), Paragraph(esc(r["description"]), P), ""])
    s.append(table(rows, [8*mm, 62*mm, 20*mm, 28*mm, 106*mm, 43*mm]))

foot = [f for f in paths if f["properties"]["kind"] == "footpath"]
roads = [f for f in paths if f["properties"]["kind"] == "road"]
s += [PageBreak(), Paragraph("D. Walking network: walk it and check (%d footpaths, %d roads)" % (len(foot), len(roads)), H),
      Paragraph("The footpaths and roads were <b>traced by eye from satellite photos</b> (about 5-10 m accuracy) and several short connectors into buildings are guesses. "
                "For each line: does the path really exist, and does it join where the app draws it? Use the <b>Footpaths</b> tab in /field to record the real path (pick the start and end places, press Start, walk, press Stop). "
                "<b>Priority:</b> the unverified Stadium link and any shortcut students rely on.", SUB)]
rows = [hdr("", "Footpath / connector", "Exists?", "Joins correctly?", "Notes")]
for f in sorted(foot, key=lambda f: f["properties"]["name"]):
    n = f["properties"]["name"]; flag = " <b><font color='#B91C1C'>(unverified)</font></b>" if "unverified" in n.lower() else ""
    rows.append([Box(), Paragraph(esc(n) + flag, P), Paragraph("yes / no", P), Paragraph("yes / no", P), ""])
s.append(table(rows, [8*mm, 100*mm, 28*mm, 32*mm, 99*mm]))
s += [Spacer(1, 6), Paragraph("Roads (quick check while travelling between places): " + "; ".join(esc(f["properties"]["name"]) for f in roads) + ".", SUB)]
doc1.build(s, onFirstPage=footer, onLaterPages=footer)

# ============ PDF 2: photo checklist ============
doc2 = SimpleDocTemplate("docs/photo-checklist.pdf", pagesize=A4, leftMargin=12*mm, rightMargin=12*mm, topMargin=12*mm, bottomMargin=14*mm, title="Photo checklist")
items = {}
for p in pois: items[slug(p["name"])] = (p["name"], p["category"], p["campus"])
for r in check:
    if re.search(r"\(add |find out which|motor park\(s\)", r["name"], re.I): continue   # instruction rows, not buildings
    if r["slug"] not in items: items[r["slug"]] = (r["name"], r["category"], r["campus"] or "main")
NOT_BUILDINGS = ("Fountain Roundabout",)
GROUPS = [("Administration, library and services", lambda c, n: c in ("admin", "health", "atm", "market", "cbt") and "Park" not in n and "park" not in n),
          ("Lecture theatres, halls and classrooms", lambda c, n: c == "lecture"),
          ("Faculties and department blocks", lambda c, n: c == "faculty"),
          ("Hostels, worship and sports", lambda c, n: c in ("hostel", "worship", "sports")),
          ("Eateries", lambda c, n: c == "eatery"),
          ("Gates, parks and transport (photograph the sign and the spot)", lambda c, n: c in ("gate", "transport") or "park" in n.lower()),
          ("UITH and the colleges", lambda c, n: c == "uith")]
used = set(); groups = []
for title, f in GROUPS:
    sel = sorted([(k, v) for k, v in items.items() if k not in used and v[0] not in NOT_BUILDINGS and (f(v[1], v[0]) or (title.startswith("UITH") and v[2] == "uith"))], key=lambda kv: (kv[1][2], kv[1][0]))
    used |= {k for k, _ in sel}; groups.append((title, sel))
rest = sorted([(k, v) for k, v in items.items() if k not in used and v[0] not in NOT_BUILDINGS], key=lambda kv: kv[1][0])
if rest: groups.append(("Other", rest))

total = sum(len(g) for _, g in groups)
s = [Paragraph("Photo checklist", T),
     Paragraph(f"<b>{total} places to photograph.</b> A fresher should be able to recognise the building from your photo.", SUB),
     Paragraph("<b>Shot 1 (required):</b> the front entrance, with the name board or sign readable. "
               "<b>Shot 2 (if you can):</b> the building as seen from the nearest road or path, so someone walking up knows they have the right place. "
               "Daylight, phone held level, one clear photo each. No close-ups of people. For lecture halls also note the capacity or any room numbers you see.", SUB),
     Paragraph("In the <b>/field</b> collector, take the photo on the same screen where you record the GPS - it is named automatically. "
               "The file name below is what it will be called.", SUB)]
for title, g in groups:
    if not g: continue
    rows = [hdr("", "Place", "Tab", "Photo file", "Done by / notes")]
    for k, (name, cat, campus) in g:
        rows.append([Box(), Paragraph(f"<b>{esc(name)}</b>", P), Paragraph("UITH & colleges" if campus == "uith" else ("Mini campus" if campus == "mini" else "Main campus"), ParagraphStyle("y", parent=P, fontSize=7.5)), Paragraph(k + ".jpg", ParagraphStyle("z", parent=P, fontSize=7, textColor=colors.HexColor("#6B7280"))), ""])
    s.append(KeepTogether([Paragraph(f"{esc(title)} ({len(g)})", H), table(rows[:6], [8*mm, 84*mm, 24*mm, 40*mm, 38*mm])]) if len(rows) <= 6 else Paragraph(f"{esc(title)} ({len(g)})", H))
    if len(rows) > 6: s.append(table(rows, [8*mm, 84*mm, 24*mm, 40*mm, 38*mm]))
doc2.build(s, onFirstPage=footer, onLaterPages=footer)
print("PDFs written:", total, "places to photograph;", len(pois), "pins to confirm;", len(todo), "with no coordinates;", len(foot), "footpaths")
