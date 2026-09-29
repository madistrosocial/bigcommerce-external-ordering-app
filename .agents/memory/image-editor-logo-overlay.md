---
name: Image Editor full-canvas logo overlay
description: Preserve the user's prepared, positioned logo overlay when compositing generated product images.
---

Treat the Image Editor's transparent 1200×1200 PNG as a full-canvas overlay. Preserve its dimensions and built-in logo coordinates; align the generated square image canvas to it instead of resizing or repositioning the overlay.

**Why:** The user's logo asset already includes its intended placement. Scaling the full overlay down made the logo mark too small and changed its baked-in position.

**How to apply:** Keep the original PNG buffer unchanged, reject non-1200×1200 overlays before requesting image generation, resize the generated square background to 1200×1200, and composite the overlay at the canvas origin.