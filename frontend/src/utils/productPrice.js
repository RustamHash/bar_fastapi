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

export function formatOrderItemLine(item) {
  if (item.is_kit_component && item.kit_component_qty != null && item.unit_price != null) {
    const unit = productUnitLabel(item.unit);
    const kits = item.kit_order_quantity ?? 1;
    const qtyLabel = item.unit === 'liter'
      ? `${item.kit_component_qty}л`
      : `${item.kit_component_qty} ${unit}`;
    return `${item.product_name} ${qtyLabel} × ${kits} = ${item.price}₽ × ${kits} = ${item.total}₽`;
  }
  return item.product_name;
}

export function formatOrderItemPrice(item) {
  if (item.is_kit_component && item.kit_component_qty != null) {
    return `${item.price} ₽`;
  }
  return `${item.price} ₽`;
}

export function formatOrderItemTotal(item) {
  return `${item.total} ₽`;
}

export function getComponentKitShare(component) {
  const unitPrice = component.price_override ?? component.component_price;
  return unitPrice * component.quantity;
}

export function formatComponentKitShare(component) {
  const unitPrice = component.price_override ?? component.component_price;
  const share = unitPrice * component.quantity;
  const unit = productUnitLabel(component.component_unit);
  if (component.quantity === 1) {
    return `${share} ₽`;
  }
  return `${unitPrice} ₽/${unit} × ${component.quantity} = ${share} ₽`;
}

export function formatComponentUnitPrice(component) {
  const unitPrice = component.price_override ?? component.component_price;
  const unit = productUnitLabel(component.component_unit);
  return `${unitPrice} ₽/${unit}`;
}
