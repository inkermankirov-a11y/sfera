export type ShoppingItem = {
  id: string;
  title: string;
  checked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ShoppingListData = {
  id: string;
  title: string;
  items: ShoppingItem[];
  createdAt: string;
  updatedAt: string;
};

export const SHOPPING_STORAGE_KEY = "sfera.shopping.v1";
export const LEGACY_SHOPPING_LIST_ID = "shopping-default";

function isShoppingList(value: unknown): value is ShoppingListData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string"
    && typeof item.title === "string"
    && Array.isArray(item.items);
}

function isShoppingItem(value: unknown): value is ShoppingItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string"
    && typeof item.title === "string"
    && typeof item.checked === "boolean";
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

export function createShoppingList(title: string): ShoppingListData {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    items: [],
    createdAt: now,
    updatedAt: now
  };
}

export function readShoppingLists(): ShoppingListData[] {
  try {
    const raw = localStorage.getItem(SHOPPING_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    if (parsed.every(isShoppingList)) return parsed;

    const legacyItems = parsed.filter(isShoppingItem);
    if (legacyItems.length === 0) return [];

    const createdAt = legacyItems.map((item) => item.createdAt).sort()[0] ?? new Date().toISOString();
    const updatedAt = legacyItems.map((item) => item.updatedAt).sort().at(-1) ?? createdAt;

    return [{
      id: LEGACY_SHOPPING_LIST_ID,
      title: "Мои покупки",
      items: legacyItems,
      createdAt,
      updatedAt
    }];
  } catch {
    return [];
  }
}
