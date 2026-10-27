---
name: Shared product-photo watermark
description: Shared prepared logo overlays and automatic watermarking across product photo upload surfaces.
---

Prepared dark/light logo overlays are centrally managed in Admin Integration Settings so upload surfaces and the Image Editor use the same assets. Automatic stamping is a separate opt-in setting and applies only to Product 360 product and variant photo uploads; it must not be mixed into AI image generation.

**Why:** Staff need consistent branded product photos without manually watermarking each image, while retaining the Image Editor's unbranded generation result and explicit logo-preview workflow.

**How to apply:** Keep overlays as transparent 1200 × 1200 PNGs with their intended placement embedded. Apply the selected overlay to the processed photo before upload, and fail visibly if automatic stamping is enabled but its selected logo is missing.
