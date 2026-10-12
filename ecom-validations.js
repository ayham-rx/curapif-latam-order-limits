import * as ecomValidations from 'interfaces-ecommerce-v1-validations-provider';

// Country-wide item limits (customs clearance caps).
// Keyed by ISO 3166-1 alpha-2 code; `codes` lists every raw country value
// observed/expected in validation requests for that country, matched
// case-insensitively against shippingAddress (falling back to billingInfo).
const COUNTRY_ITEM_LIMITS = {
  AR: { limit: 3, codes: ['AR', 'ARGENTINA'], name: 'Argentina' },
  PE: { limit: 4, codes: ['PE', 'PERU', 'PERÚ'], name: 'Perú' }
};

// SKUs that already bundle multiple physical items into a single sellable
// unit (e.g. a multi-bottle pack). Ordering more than 1 unit of any of
// these would, on its own, push a single line item past the Argentina/Peru
// customs item caps above — so these are capped at quantity 1 regardless of
// how many other items are in the cart. Their contribution is tracked here
// only to explain the limit in the customer-facing message; it is NOT added
// into the general item-count total below, which only sums quantities from
// every OTHER (non-bundled) line item.
const BUNDLED_SKU_ITEMS_PER_UNIT = {
  EID1931CAP120: 2,
  EID1931CAP180: 3,
  EIDD15CAP120: 2,
  EIDD15CAP180: 3,
  EIDD30CAP120: 2,
  EIDD30CAP180: 3
};
const BUNDLED_SKU_MAX_QUANTITY = 1;

/**
 * @param {import('interfaces-ecommerce-v1-validations-provider').GetValidationViolationsOptions} options
 * @param {import('interfaces-ecommerce-v1-validations-provider').Context} context
 * @returns {Promise<import('interfaces-ecommerce-v1-validations-provider').GetValidationViolationsResponse | import('interfaces-ecommerce-v1-validations-provider').BusinessError>}
 */
export const getValidationViolations = async (options, context) => {
  const { validationInfo } = options;

  const shippingCountry = validationInfo?.shippingAddress?.address?.country;
  const billingCountry = validationInfo?.billingInfo?.address?.country;
  const country = (shippingCountry || billingCountry || '').toString().trim().toUpperCase();

  const countryRule = Object.values(COUNTRY_ITEM_LIMITS).find(rule => rule.codes.includes(country));

  if (!countryRule) {
    return { violations: [] };
  }

  const lineItems = validationInfo?.lineItems || [];
  const violations = [];

  // Rule 1 — bundled SKUs: capped at 1 unit per line item, independent of
  // the general item-count check below.
  for (const item of lineItems) {
    const sku = item?.physicalProperties?.sku;
    const itemsPerUnit = sku ? BUNDLED_SKU_ITEMS_PER_UNIT[sku] : undefined;
    const quantity = item?.quantity || 0;

    if (itemsPerUnit && quantity > BUNDLED_SKU_MAX_QUANTITY) {
      const productName = item?.productName?.translated || item?.productName?.original || sku;
      violations.push({
        severity: 'ERROR',
        target: { other: { name: 'OTHER_DEFAULT' } },
        description:
          `El producto "${productName}" (SKU: ${sku}) incluye ${itemsPerUnit} artículos por unidad, por lo que, debido a los requisitos de despacho aduanero de ${countryRule.name}, solo se permite pedir ${BUNDLED_SKU_MAX_QUANTITY} unidad de este producto por pedido. ` +
          `Por favor reduce la cantidad de "${productName}" a ${BUNDLED_SKU_MAX_QUANTITY} para continuar.`
      });
    }
  }

  // Rule 2 — general item-count limit: applies to every line item OTHER
  // than the bundled SKUs above, same as the original Argentina-only check.
  const regularItemsTotalQuantity = lineItems
    .filter(item => !BUNDLED_SKU_ITEMS_PER_UNIT[item?.physicalProperties?.sku])
    .reduce((sum, item) => sum + (item.quantity || 0), 0);

  if (regularItemsTotalQuantity > countryRule.limit) {
    const overBy = regularItemsTotalQuantity - countryRule.limit;
    violations.push({
      severity: 'ERROR',
      target: { other: { name: 'OTHER_DEFAULT' } },
      description:
        `Debido a los requisitos de despacho aduanero de ${countryRule.name}, los pedidos enviados a ${countryRule.name} están limitados a un máximo de ${countryRule.limit} artículos. ` +
        `Tu pedido actualmente tiene ${regularItemsTotalQuantity} artículo(s) — por favor elimina ${overBy} artículo(s) para continuar.`
    });
  }

  return { violations };
};
