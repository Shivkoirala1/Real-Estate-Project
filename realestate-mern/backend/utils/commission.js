/**
 * Effective commission % for a property: the property-level override wins,
 * otherwise the parent property type's default, otherwise 0.
 * `propertyType` may be a populated doc, a plain object, or null/undefined.
 */
const effectiveCommissionPercentage = (property, propertyType) => {
  if (property?.commissionPercentage != null) return property.commissionPercentage;
  return propertyType?.defaultCommissionPercentage ?? 0;
};

const estimatedCommissionAmount = (price, pct) =>
  Number(((Number(price) || 0) * pct / 100).toFixed(2));

module.exports = { effectiveCommissionPercentage, estimatedCommissionAmount };
