---
name: BigCommerce product fixed shipping
description: BigCommerce's native product-level fixed shipping behavior and mixed-cart limitation.
---

BigCommerce products and variants support a fixed shipping cost that replaces normal shipping calculation for that product. In a mixed cart, BigCommerce combines the fixed product amount with the normal quote for the other items; it does not make the entire order use only the fixed amount.

**Why:** A dropship-only $10 rate can be native when the product is configured with fixed shipping, but the desired mixed-cart behavior must be checked separately because native fixed shipping is additive in mixed carts.

**How to apply:** Set the product or variant fixed shipping field only after confirming the product is published in the target store. If mixed carts must remain at one standard rate, use a custom shipping-rate/checkout solution rather than relying only on the product field.