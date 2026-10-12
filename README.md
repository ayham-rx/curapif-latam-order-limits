# CURA PIF LATAM — Argentina & Peru Order Limits

Velo code for the CURA PIF LATAM Wix site (`curapif.com`) that blocks any order shipping to Argentina or Peru from exceeding each country's customs-clearance item cap, and separately caps a handful of multi-item bundle SKUs at 1 unit per order. Orders over the limit get stuck in customs, so the site should never let a customer place one.

This isn't a standalone app or server — it's a **Wix eCommerce Validations service plugin**, a Velo Service Plugin (SPI) that lives inside the Wix site's own Dev Mode code. Wix calls `getValidationViolations()` every time a visitor's cart or checkout changes. If a rule below is broken, it returns one `ERROR`-severity violation per broken rule, which blocks the "Place Order" button and shows the customer why, in Spanish.

> **This replaces the site's previous Argentina-only validation code.** There is only one Validations service plugin active on this site, so the Peru and bundled-SKU rules had to be added into the same `getValidationViolations` function rather than installed alongside it — see [Installing this in the Wix Editor](#installing-this-in-the-wix-editor).

## Rules

1. **Country item limit** — orders shipping to Argentina are capped at **3 items** total; orders shipping to Peru are capped at **4 items** total. Both limits count line-item quantity, summed across the cart, excluding the bundled SKUs in rule 2.
2. **Bundled SKU limit** — for orders shipping to Argentina or Peru, these SKUs may only be ordered in **quantity 1**, because each unit already contains more than one physical item and would exceed the country limit on its own if ordered twice:

   | SKU | Items per unit |
   | --- | --- |
   | `EID1931CAP120` | 2 |
   | `EID1931CAP180` | 3 |
   | `EIDD15CAP120` | 2 |
   | `EIDD15CAP180` | 3 |
   | `EIDD30CAP120` | 2 |
   | `EIDD30CAP180` | 3 |

   These SKUs are **not** added into rule 1's total — they're governed only by their own 1-unit cap. A cart can contain one bundled SKU at quantity 1 *and* up to the country's full item limit of other, non-bundled products.

Both rules can fire at once; the response can contain more than one violation.

## Files

- `ecom-validations.js` — the validation logic (`getValidationViolations`).
- `ecom-validations.config.js` — plugin config (`getConfig`), sets `validateInCart: true` so the same checks also show a warning on the cart page, not just at checkout.

## How the check works

1. Read the destination country from `validationInfo.shippingAddress.address.country`, falling back to `validationInfo.billingInfo.address.country` if no shipping address has been entered yet.
2. If the country isn't Argentina or Peru, return no violations.
3. For each line item whose SKU (`item.physicalProperties.sku`) is one of the six bundled SKUs above, if its `quantity` exceeds 1, add a violation naming that product and how many items it bundles.
4. Sum `quantity` across every *other* line item (i.e. excluding the bundled SKUs). If that sum exceeds the matched country's limit (3 for Argentina, 4 for Peru), add a violation stating the customs-clearance reason and how many items to remove.
5. Return whatever violations were collected (zero, one, or both).

## Installing this in the Wix Editor

Wix Velo service plugins are added and edited directly inside the Wix Editor's Dev Mode — they can't be deployed from outside Wix (no CLI/Git integration for this extension type as of this writing). To install:

1. Open the **CURA PIF LATAM** site in the Wix Editor.
2. Turn on **Dev Mode** if it isn't already (top toolbar).
3. Open the **Code** sidebar → **Public & Backend** → **Service Plugins**.
4. Find the existing eCommerce Validations integration (previously set up for the Argentina-only rule — likely named something like `argentina-order-limit`) and open its code.
5. **Replace the body of `getValidationViolations`** with the logic from this repo's `ecom-validations.js`, and confirm `ecom-validations.config.js`'s `getConfig()` still returns `{ validateInCart: true }` (unchanged from before).
   - **Keep the auto-generated function name/signature as-is.** If the generated signature for `getValidationViolations` differs from `(options)` — e.g. `({ request, metadata })` — adjust the destructuring line (`const { validationInfo } = options.request;`) to match.
   - If no such integration exists yet (fresh install), choose category **eCommerce** → **Validations** under **+ Add**, name it (e.g. `latam-order-limits`, no spaces/special characters), click **Add & Edit Code**, then paste in both files' contents.
6. Save both files.
7. **Preview** the site and test:
   - **Argentina, regular items:** add 4+ non-bundled items, set shipping/billing to Argentina → blocked with the 3-item message. Reduce to 3 → passes.
   - **Peru, regular items:** add 5+ non-bundled items, set address to Peru → blocked with the 4-item message. Reduce to 4 → passes.
   - **Bundled SKU, either country:** add quantity 2 of any SKU from the table above, with an Argentina or Peru address → blocked with the bundled-SKU message. Reduce to quantity 1 → passes.
   - **Bundled SKU + regular items together:** 1 unit of a bundled SKU plus the country's full regular-item limit (3 for Argentina, 4 for Peru) → passes, since the bundled SKU doesn't count toward that total.
   - **Non-Argentina/Peru address:** same over-limit carts → not blocked by either rule.
8. **Publish** the site. Service plugins only take effect after publishing (and Preview reflects saved-but-unpublished code).

## Notes

- `COUNTRY_ITEM_LIMITS` and `BUNDLED_SKU_ITEMS_PER_UNIT` are both isolated at the top of `ecom-validations.js` if a limit, SKU list, or country needs to change later.
- The country field observed in Wix eCommerce validation requests is the ISO 3166-1 alpha-2 code (`AR`, `PE`); the code also matches each country's literal name defensively in case a full name is ever passed instead.
- The bundled-SKU items-per-unit values (2 or 3) are used only to make the customer-facing message more informative — they are not summed into any limit, since the rule is a flat 1-unit cap per SKU regardless of its contents.
