---
name: BigCommerce variant image removal
description: Variant-specific images are separate from product-gallery images; verified clearing behavior.
---

Clear a variant-specific image by updating that variant with `image_url: ""`, then read it back before reporting success. Do not look for or delete a product-gallery image as a substitute.

**Why:** Live store verification confirmed the empty-string update clears the variant image. Uploads can live under `product_images/attribute_rule_images` and do not appear in the product-gallery image collection. Gallery-image deletion is therefore not a reliable way to remove a variant image and risks removing a different image.

**How to apply:** Use the single-variant Catalog update endpoint, verify that the same variant now has an empty image URL, and only then clear the local cached reference. Treat an unchanged or missing read-back field as unconfirmed rather than success.
