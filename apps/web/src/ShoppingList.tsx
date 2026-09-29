import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppIcon } from "./ui/AppIcon";
import {
  SHOPPING_STORAGE_KEY,
  ShoppingItem,
  createShoppingItem,
  readShoppingItems
} from "./shopping-model";

export function ShoppingList({ active }: { active: boolean }) {
  const [items, setItems] = useState<ShoppingItem[]>(() => readShoppingItems());
  const [title, setTitle] = useState("");

  useEffect(() => {
    localStorage.setItem(SHOPPING_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const pending = useMemo(() => items.filter((item) => !item.checked), [items]);
  const completed = useMemo(() => items.filter((item) => item.checked), [items]);

  function addItem(event: FormEvent) {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    setItems((current) => [createShoppingItem(value), ...current]);
    setTitle("");
  }

  function toggleItem(id: string) {
    const now = new Date().toISOString();
    setItems((current) => current.map((item) =>
      item.id === id ? { ...item, checked: !item.checked, updatedAt: now } : item
    ));
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function clearCompleted() {
    setItems((current) => current.filter((item) => !item.checked));
  }

  return (
    <section
      className={`mobile-module-screen shopping-screen ${active ? "active" : ""}`}
      aria-hidden={!active}
    >
      <header className="module-page-header shopping-header">
        <div>
          <span>Быстрый список</span>
          <h2>Покупки</h2>
        </div>
        <span className="shopping-count">{pending.length}</span>
      </header>

      <form className="shopping-add" onSubmit={addItem}>
        <AppIcon name="plus" size={18} />
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Что купить?"
          aria-label="Новая покупка"
        />
        <button type="submit" disabled={!title.trim()}>Добавить</button>
      </form>

      <div className="shopping-list">
        {pending.length === 0 && completed.length === 0 ? (
          <div className="module-empty-card shopping-empty">
            <AppIcon name="cart" size={26} />
            <strong>Список пуст</strong>
            <span>Добавь то, что нужно купить.</span>
          </div>
        ) : (
          <>
            {pending.map((item) => (
              <article className="shopping-row" key={item.id}>
                <button
                  className="shopping-check"
                  onClick={() => toggleItem(item.id)}
                  aria-label={`Куплено: ${item.title}`}
                />
                <button className="shopping-title" onClick={() => toggleItem(item.id)}>
                  {item.title}
                </button>
                <button className="shopping-delete" onClick={() => removeItem(item.id)} aria-label={`Удалить ${item.title}`}>×</button>
              </article>
            ))}

            {completed.length > 0 && (
              <section className="shopping-completed">
                <header>
                  <strong>Куплено</strong>
                  <button onClick={clearCompleted}>Очистить</button>
                </header>
                {completed.map((item) => (
                  <article className="shopping-row is-done" key={item.id}>
                    <button className="shopping-check checked" onClick={() => toggleItem(item.id)} aria-label={`Вернуть ${item.title}`}>
                      <AppIcon name="check" size={14} />
                    </button>
                    <button className="shopping-title" onClick={() => toggleItem(item.id)}>{item.title}</button>
                    <button className="shopping-delete" onClick={() => removeItem(item.id)} aria-label={`Удалить ${item.title}`}>×</button>
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </section>
  );
}
