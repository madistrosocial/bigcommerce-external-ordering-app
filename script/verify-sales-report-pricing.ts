import assert from "node:assert/strict";
import {
  calculateSaleAmount,
  resolveBigCommerceOrderLinePrice,
} from "../server/sales-report-pricing";

const tierPrice = resolveBigCommerceOrderLinePrice({
  base_price: "12.50",
  price_ex_tax: "99.00",
});
assert.deepEqual(tierPrice, { amount: "12.50", source: "base_price" });

const freePromoPrice = resolveBigCommerceOrderLinePrice({
  base_price: 0,
  price_ex_tax: "12.50",
});
assert.deepEqual(freePromoPrice, { amount: "0", source: "base_price" });

const fallbackOrderPrice = resolveBigCommerceOrderLinePrice({
  price_ex_tax: "7.25",
});
assert.deepEqual(fallbackOrderPrice, { amount: "7.25", source: "price_ex_tax" });

const missingPrice = resolveBigCommerceOrderLinePrice({});
assert.deepEqual(missingPrice, { amount: "0", source: "missing" });

assert.equal(
  calculateSaleAmount([
    { quantity: 2, base_price: tierPrice.amount },
    { quantity: 1, base_price: freePromoPrice.amount },
    { quantity: 1, base_price: fallbackOrderPrice.amount },
  ]),
  32.25,
);

console.log("Sales report pricing checks passed.");