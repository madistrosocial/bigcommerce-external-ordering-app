---
name: Shared product-photo watermark
description: Shared prepared logo overlays and automatic watermarking across product photo upload surfaces.
---

Prepared dark/light logo overlays are centrally managed in Admin Integration Settings so upload surfaces and the Image Editor use the same assets. Product and variant uploads always normalize to 1200 × 1200 on a white canvas, fitting the source without distortion; watermarking, when enabled, uses the full-size square overlay. Product photos, variant photos, and Image Editor each have their own in-page automatic-stamping toggle and dark/light choice; do not save those controls globally or mix stamping into AI image generation.

**Why:** Staff need consistent branded product photos without manually watermarking each image. Square source canvases also prevent aspect-ratio mismatch from distorting the prepared logo or uploaded photo.

**How to apply:** Keep overlays as transparent 1200 × 1200 PNGs with their intended placement embedded. Fit source photos proportionally inside a white 1200 × 1200 canvas before optional stamping, apply the local upload-surface selection before upload, and fail visibly if automatic stamping is enabled but its selected logo is missing.
