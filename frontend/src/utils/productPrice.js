const UNIT_LABELS = { liter: 'л', piece: 'шт', kg: 'кг' };

export function productUnitLabel(unit) {
  return UNIT_LABELS[unit] || unit;
}

export function getProductSalePrice(product) {
  if (!product) return 0;
  if (product.is_kit && product.kit_price_type === 'auto' && product.components?.length) {
    return product.components.reduce(
      (sum, c) => sum + (c.price_override ?? c.component_price) * c.quantity,
      0,
    );
  }
  return product.retail_price;
}

export function formatProductPrice(product) {
  const price = getProductSalePrice(product);
  if (product?.is_kit) {
    return `${price} ₽`;
  }
  const unit = productUnitLabel(product?.unit);
  return `${price} ₽/${unit}`;
}

export function formatComponentUnitPrice(component) {
  const unitPrice = component.price_override ?? component.component_price;
  const unit = productUnitLabel(component.component_unit);
  return `${unitPrice} ₽/${unit}`;
}
