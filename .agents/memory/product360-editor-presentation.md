---
name: Product 360 editor presentation
description: User-approved organization and photo/category interactions for Product 360 catalog details.
---

In Product 360 product details, keep pricing and cost visually separate from physical specifications. Show assigned categories in a searchable, expandable checkbox tree rather than a flat checklist. Product creation should use the same tree inside a popup selector and use the full available window width. The photo gallery spans the full Details width with 150px tiles, compact editable captions, and an admin option to set the BigCommerce primary image. Below it, keep catalog details, pricing, and specifications in the left 70% and categories in a right 30% sidebar. In Variants, show each variant's thumbnail in the first column and let admins upload a missing image directly to that variant.

**Why:** The user explicitly requested and approved these presentation and interaction choices while refining the product details editor and product creation flow. BigCommerce has a separate variant-image endpoint; product-level images do not guarantee a particular image is assigned to that variant.

**How to apply:** Preserve these patterns when extending or restyling Product 360. Keep the create form free of a max-width cap and keep variant uploads scoped to the selected BigCommerce variant.
