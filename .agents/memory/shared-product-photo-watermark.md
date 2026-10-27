---
name: Shared product-photo watermark
description: Shared prepared logo overlays and automatic watermarking across product photo upload surfaces.
---

Prepared dark/light logo overlays are centrally managed in Admin Integration Settings so upload surfaces and the Image Editor use the same assets. Product photos and variant photos each have their own in-page automatic-stamping toggle and dark/light choice; do not save those controls globally or mix stamping into AI image generation.

**Why:** Staff need consistent branded product photos without manually watermarking each image, while retaining the Image Editor's unbranded generation result and explicit logo-preview workflow.

**How to apply:** Keep overlays as transparent 1200 × 1200 PNGs with their intended placement embedded. Apply the local upload-surface selection to the processed photo before upload, and fail visibly if automatic stamping is enabled but its selected logo is missing.
