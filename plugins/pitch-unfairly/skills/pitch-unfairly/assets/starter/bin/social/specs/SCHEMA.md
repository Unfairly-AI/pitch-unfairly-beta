# Platform spec registry — schema (social-format@1)

One JSON file per platform group: `specs/<group>.json` = { "group": "...", "checked": "YYYY-MM-DD", "formats": [ ... ] }.
Each format:

```json
{
  "id": "instagram.feed.portrait",            // platform.placement.variant, lowercase, dots
  "platform": "instagram",                     // instagram|facebook|threads|linkedin|x|tiktok|youtube|pinterest|snapchat|google|reddit
  "surface": "organic" | "ad" | "both",
  "placement": "Feed",                         // the platform's own name for it
  "name": "Feed post, portrait",
  "media": ["image","video"],                 // image|video|carousel|document|gif|html5|text
  "canvas": { "w": 1080, "h": 1350 },          // the size we should RENDER at (recommended)
  "aspect": "4:5",
  "accepted_aspects": ["1:1","4:5","1.91:1"], // what the platform accepts for this placement
  "min": { "w": 600, "h": 750 }, "max": { "w": null, "h": null },
  "file": { "types": ["jpg","png"], "max_mb": 30 },
  "video": { "types": ["mp4","mov"], "codec": "H.264", "audio": "AAC", "fps": [23,60], "min_s": 1, "max_s": 60, "recommended_s": [6,15], "max_mb": 4000, "captions": "burned-in recommended; sound-off default" },
  "carousel": { "min": 2, "max": 20, "card_aspects": ["1:1","4:5"] },
  "safe_zone": { "top": 0, "bottom": 0, "left": 0, "right": 0, "units": "px at canvas", "note": "what covers it (UI, CTA bar, captions)" },
  "crop_notes": "e.g. profile grid previews feed posts at 3:4",
  "text": { "primary": { "max": 2200, "truncates_at": 125 }, "headline": { "max": 40 } },
  "notes": "anything else a designer must know (text-in-image guidance, no clickable UI fakes, etc.)",
  "sources": [ { "url": "https://...", "title": "...", "checked": "2026-10-25" } ],
  "confidence": "official" | "secondary" | "unverified"
}
```

Rules: every number traces to a source in `sources`. Prefer the platform's own help center / ads guide / business site. If only a third-party guide states it, mark `"confidence":"secondary"`. If you cannot find it, use null and say so in notes — never guess. Omit keys that don't apply.
