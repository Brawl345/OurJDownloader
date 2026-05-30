import type { BasketItem } from './basket';

export interface BasketPackage {
  name: string;
  items: BasketItem[];
  passwords: string[];
}

export interface BasketGroups {
  manual: BasketItem[];
  packages: BasketPackage[];
}

// Splits basket items into ungrouped manual links and CNL packages (grouped by
// package name, carrying the first item's passwords). Used both for rendering
// and for sending to a device.
export function groupBasket(items: BasketItem[]): BasketGroups {
  const manual: BasketItem[] = [];
  const map = new Map<string, BasketItem[]>();

  for (const item of items) {
    if (item.type === 'cnl' && item.cnlData?.packageName) {
      const existing = map.get(item.cnlData.packageName);
      if (existing) {
        existing.push(item);
      } else {
        map.set(item.cnlData.packageName, [item]);
      }
    } else {
      manual.push(item);
    }
  }

  const packages: BasketPackage[] = [...map.entries()].map(([name, group]) => ({
    name,
    items: group,
    passwords: group[0]?.cnlData?.passwords ?? [],
  }));

  return { manual, packages };
}
