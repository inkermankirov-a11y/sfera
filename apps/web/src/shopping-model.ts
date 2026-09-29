export type ShoppingItem = {
  id: string;
  title: string;
  checked: boolean;
  createdAt: string;
  updatedAt: string;
};

export const SHOPPING_STORAGE_KEY = "sfera.shopping.v1";

export function readShoppingItems(): ShoppingItem[] {
  try {
    const raw = localStorage.getItem(SHOPPING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function createShoppingItem(title: string): ShoppingItem {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    checked: false,
    createdAt: now,
    updatedAt: now
  };
}
