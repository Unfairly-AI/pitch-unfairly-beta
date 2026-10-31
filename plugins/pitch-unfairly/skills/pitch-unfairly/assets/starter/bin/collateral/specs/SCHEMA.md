# Print and merch spec registry: schema (print-format@1)

`print-merch.json` = { "group": "print-merch", "checked": "YYYY-MM-DD", "formats": [ ... ] }. It follows the
social registry's rules (`../../social/specs/SCHEMA.md`): every number traces to a source in `sources`,
the vendor's or media owner's own spec sheet is preferred, `confidence` is official | secondary | unverified,
and a value that can't be sourced is null with a note. Never guess. Each format adds:

```json
{
  "id": "print.ooh.bus_shelter.47x68",      // print.<kind>.<variant> or merch.<item>.<variant>
  "platform": "print" | "merch",
  "trim": { "w": 47.5, "h": 68.5, "units": "in" },   // finished size
  "visible": { "w": 46, "h": 67, "units": "in" },    // framed displays: what the frame shows
  "bleed_in": 0.125,                                  // beyond the trim, each side (null: not stated)
  "safe_in": 0.25 | { "left": 1.25, "right": 1.25, "top": 4, "bottom": 4 },  // inside the trim
  "dpi": { "min": 80, "recommended": 150, "note": "at finished size" },
  "color": "CMYK | sRGB | spot notes",
  "file": { "types": ["pdf"], "notes": "what the printer wants" },
  "print_area": { "w": 12, "h": 16, "units": "in", "placement": "merch: where it prints" },
  "canvas": { "w": 7125, "h": 10275 },               // (trim + 2 × bleed) × recommended dpi
  "most_common": true
}
```

## More spec files: markets and screens

Every `.json` in this folder is read (print-merch.json first; an id is used once). A market file such
as `ooh-san-francisco.json` adds `"market"`, `"family"` (Transit, Rail, Street furniture, Billboards,
Airport, Digital OOH, Wild posting) and `"owner"` (the media owner) to each format, and may add:

```json
{
  "mechanical": { "scale": 0.0416667, "label": "1/2 in = 1 ft" },   // the PDF is drawn at this scale
  "platform": "digital", "canvas": { "w": 1400, "h": 400 },          // a digital screen, in pixels
  "safe_px": { "left": 0, "right": 0, "top": 0, "bottom": 0 }        // optional, for a screen
}
```

A format whose trim plus bleed passes 200 in needs a `mechanical`; the registry test enforces it.
