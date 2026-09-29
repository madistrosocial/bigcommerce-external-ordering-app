---
name: Image Editor full-canvas logo overlay
description: Preserve the user's prepared, positioned logo overlay when compositing generated product images.
---

Keep the generated image untouched and logo-free in its own preview. The Image Editor has separate transparent 1200×1200 dark and light PNG overlays; preserve their dimensions and built-in coordinates, and apply only the selected overlay in the BigCommerce preview/upload.

**Why:** The logo assets already include their intended placement. Scaling them down made the marks too small, and mixing the overlay into generation hid the unbranded result and prevented choosing between dark/light logos afterward.

**How to apply:** Generate and display the original response separately. Keep each overlay unchanged, validate it as a transparent 1200×1200 PNG, resize only the preview background to 1200×1200, and upload the selected composite rather than the original.