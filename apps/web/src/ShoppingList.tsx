import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppIcon } from "./ui/AppIcon";
import {
  SHOPPING_STORAGE_KEY,
  ShoppingListData,
  createShoppingItem,
  createShoppingList,
  readShoppingLists
} from "./shopping-model";

export function ShoppingList({ active, onBack }: { active: boolean; onBack: () => void }) {
  const [lists, setLists] = useState<ShoppingListData[]>(() => readShoppingLists());
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [newListTitle, setNewListTitle] = useState("");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [manageMode, setManageMode] = useState(false);
  const [draggedListId, setDraggedListId] = useState<string | null>(null);
  const [displayView, setDisplayView] = useState<"grid" | "list">(() => {
    try { return localStorage.getItem("sfera.shoppingDisplayView") === "list" ? "list" : "grid"; } catch { return "grid"; }
  });

  useEffect(() => {
    localStorage.setItem(SHOPPING_STORAGE_KEY, JSON.stringify(lists));
  }, [lists]);

  const selectedList = useMemo(
    () => lists.find((list) => list.id === selectedListId) ?? null,
    [lists, selectedListId]
  );

  const totalPending = useMemo(
    () => lists.reduce((sum, list) => sum + list.items.filter((item) => !item.checked).length, 0),
    [lists]
  );

  function addList(event: FormEvent) {
    event.preventDefault();
    const title = newListTitle.trim();
    if (!title) return;
    const list = createShoppingList(title);
    setLists((current) => [list, ...current]);
    setNewListTitle("");
    setCreatingList(false);
    setSelectedListId(list.id);
  }

  function renameList(list: ShoppingListData) {
    const nextTitle = window.prompt("Название списка", list.title)?.trim();
    if (!nextTitle || nextTitle === list.title) return;
    const now = new Date().toISOString();
    setLists((current) => current.map((item) =>
      item.id === list.id ? { ...item, title: nextTitle, updatedAt: now } : item
    ));
  }

  function deleteList(list: ShoppingListData) {
    if (!window.confirm(`Удалить список «${list.title}»?`)) return;
    setLists((current) => current.filter((item) => item.id !== list.id));
    setSelectedListId(null);
  }

  function setDisplayViewMode(mode: "grid" | "list") {
    setDisplayView(mode);
    try { localStorage.setItem("sfera.shoppingDisplayView", mode); } catch {}
  }

  function reorderLists(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    setLists((current) => {
      const from = current.findIndex((list) => list.id === sourceId);
      const to = current.findIndex((list) => list.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function moveList(id: string, direction: -1 | 1) {
    setLists((current) => {
      const index = current.findIndex((list) => list.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  function addItem(event: FormEvent) {
    event.preventDefault();
    const title = newItemTitle.trim();
    if (!title || !selectedList) return;

    const now = new Date().toISOString();
    const item = createShoppingItem(title);
    setLists((current) => current.map((list) =>
      list.id === selectedList.id
        ? { ...list, items: [...list.items, item], updatedAt: now }
        : list
    ));
    setNewItemTitle("");
  }

  function toggleItem(itemId: string) {
    if (!selectedList) return;
    const now = new Date().toISOString();
    setLists((current) => current.map((list) =>
      list.id === selectedList.id
        ? {
            ...list,
            updatedAt: now,
            items: list.items.map((item) =>
              item.id === itemId ? { ...item, checked: !item.checked, updatedAt: now } : item
            )
          }
        : list
    ));
  }

  function removeItem(itemId: string) {
    if (!selectedList) return;
    const now = new Date().toISOString();
    setLists((current) => current.map((list) =>
      list.id === selectedList.id
        ? { ...list, items: list.items.filter((item) => item.id !== itemId), updatedAt: now }
        : list
    ));
  }

  function clearCompleted() {
    if (!selectedList) return;
    const now = new Date().toISOString();
    setLists((current) => current.map((list) =>
      list.id === selectedList.id
        ? { ...list, items: list.items.filter((item) => !item.checked), updatedAt: now }
        : list
    ));
  }

  if (selectedList) {
    const pendingCount = selectedList.items.filter((item) => !item.checked).length;
    const completedCount = selectedList.items.length - pendingCount;

    return (
      <section className={`mobile-module-screen shopping-screen ${active ? "active" : ""}`} aria-hidden={!active}>
        <header className="shopping-detail-header">
          <button className="shopping-back" onClick={() => setSelectedListId(null)} aria-label="Назад">←</button>
          <div>
            <small>Список покупок</small>
            <h2>{selectedList.title}</h2>
            <span>{pendingCount} осталось · {selectedList.items.length} всего</span>
          </div>
          <button className="shopping-edit-list" onClick={() => renameList(selectedList)} aria-label="Переименовать список">
            <AppIcon name="edit" size={17} />
          </button>
        </header>

        <form className="shopping-add" onSubmit={addItem}>
          <AppIcon name="plus" size={18} />
          <input
            autoFocus
            value={newItemTitle}
            onChange={(event) => setNewItemTitle(event.target.value)}
            placeholder="Добавить покупку"
            aria-label="Новая покупка"
          />
          <button type="submit" disabled={!newItemTitle.trim()}>Добавить</button>
        </form>

        {selectedList.items.length === 0 ? (
          <div className="module-empty-card shopping-empty">
            <AppIcon name="cart" size={26} />
            <strong>Список пока пуст</strong>
            <span>Добавь первую покупку выше.</span>
          </div>
        ) : (
          <ol className="shopping-numbered-list">
            {selectedList.items.map((item, index) => (
              <li className={`shopping-numbered-row ${item.checked ? "is-done" : ""}`} key={item.id}>
                <span className="shopping-number">{index + 1}.</span>
                <button
                  className={`shopping-check ${item.checked ? "checked" : ""}`}
                  onClick={() => toggleItem(item.id)}
                  aria-label={item.checked ? `Вернуть ${item.title}` : `Куплено: ${item.title}`}
                >
                  {item.checked && <AppIcon name="check" size={13} />}
                </button>
                <button className="shopping-title" onClick={() => toggleItem(item.id)}>{item.title}</button>
                <button className="shopping-delete" onClick={() => removeItem(item.id)} aria-label={`Удалить ${item.title}`}>×</button>
              </li>
            ))}
          </ol>
        )}

        <div className="shopping-list-footer">
          {completedCount > 0 && <button onClick={clearCompleted}>Удалить купленные ({completedCount})</button>}
          <button className="shopping-delete-list" onClick={() => deleteList(selectedList)}>Удалить список</button>
        </div>
      </section>
    );
  }

  return (
    <section className={`mobile-module-screen shopping-screen ${active ? "active" : ""}`} aria-hidden={!active}>
      <header className="module-page-header shopping-header">
        <button className="shopping-back shopping-root-back" onClick={onBack} aria-label="Назад в сферы">←</button>
        <div className="shopping-header-copy">
          <span>Списки покупок</span>
          <h2>Покупки</h2>
        </div>
        <div className="shopping-header-actions section-header-actions projects-header-actions">
          <button
            className={`section-manage-button sphere-manage-toggle shopping-manage-toggle ${manageMode ? "active" : ""}`}
            onClick={() => { setManageMode((value) => !value); setDraggedListId(null); }}
            aria-pressed={manageMode}
          >
            <AppIcon name="edit" size={16} /><span>{manageMode ? "Готово" : "Редактировать"}</span>
          </button>
          <div className="project-view-toggle" role="group" aria-label="Вид списков покупок">
            <button className={displayView === "grid" ? "active" : ""} onClick={() => setDisplayViewMode("grid")} aria-label="Карточки" title="Карточки">▦</button>
            <button className={displayView === "list" ? "active" : ""} onClick={() => setDisplayViewMode("list")} aria-label="Список" title="Список">☷</button>
          </div>
          <button className="section-add-button projects-add-root" onClick={() => setCreatingList(true)} aria-label="Новый список" title="Новый список">＋</button>
        </div>
      </header>

      <div className="shopping-summary">
        <AppIcon name="cart" size={20} />
        <span><strong>{lists.length}</strong> списков</span>
        <span><strong>{totalPending}</strong> покупок осталось</span>
      </div>

      {creatingList && (
        <form className="shopping-create-list" onSubmit={addList}>
          <input
            autoFocus
            value={newListTitle}
            onChange={(event) => setNewListTitle(event.target.value)}
            placeholder="Например: Купить завтра"
            aria-label="Название списка покупок"
          />
          <button type="submit" disabled={!newListTitle.trim()}>Создать</button>
          <button type="button" onClick={() => { setCreatingList(false); setNewListTitle(""); }}>Отмена</button>
        </form>
      )}

      {lists.length === 0 ? (
        <div className="module-empty-card shopping-empty shopping-lists-empty">
          <AppIcon name="cart" size={28} />
          <strong>Создай первый список</strong>
          <span>Например: «Купить завтра», «Продукты», «Для ремонта».</span>
          <button onClick={() => setCreatingList(true)}>＋ Новый список</button>
        </div>
      ) : (
        <div className={`shopping-list-cards shopping-display-${displayView} ${manageMode ? "is-managing" : ""}`}>
          {lists.map((list, index) => {
            const pending = list.items.filter((item) => !item.checked).length;
            const done = list.items.length - pending;
            return (
              <article
                className={`shopping-list-card ${manageMode ? "is-managing" : ""} ${draggedListId === list.id ? "is-dragging" : ""}`}
                key={list.id}
                role="button"
                tabIndex={manageMode ? -1 : 0}
                draggable={manageMode}
                onClick={() => { if (!manageMode) setSelectedListId(list.id); }}
                onKeyDown={(event) => {
                  if (!manageMode && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    setSelectedListId(list.id);
                  }
                }}
                onDragStart={(event) => {
                  if (!manageMode) return;
                  setDraggedListId(list.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", list.id);
                }}
                onDragEnd={() => setDraggedListId(null)}
                onDragOver={(event) => { if (manageMode && draggedListId) event.preventDefault(); }}
                onDrop={(event) => {
                  if (!manageMode) return;
                  event.preventDefault();
                  const sourceId = draggedListId || event.dataTransfer.getData("text/plain");
                  if (sourceId) reorderLists(sourceId, list.id);
                  setDraggedListId(null);
                }}
              >
                <span className="shopping-list-card-icon"><AppIcon name="list" size={19} /></span>
                <span className="shopping-list-card-copy">
                  <strong>{list.title}</strong>
                  <small>{list.items.length === 0 ? "Пока пусто" : `${pending} осталось · ${done} куплено`}</small>
                </span>
                {!manageMode && <AppIcon name="chevron" size={17} />}
                {manageMode && (
                  <div className="shopping-manage-controls" onClick={(event) => event.stopPropagation()}>
                    <span className="shopping-drag-handle" title="Перетащить" aria-hidden="true">⠿</span>
                    <button type="button" onClick={() => moveList(list.id, -1)} disabled={index <= 0} aria-label="Выше" title="Выше">↑</button>
                    <button type="button" onClick={() => moveList(list.id, 1)} disabled={index >= lists.length - 1} aria-label="Ниже" title="Ниже">↓</button>
                    <button type="button" onClick={() => renameList(list)} aria-label="Переименовать" title="Переименовать"><AppIcon name="edit" size={14} /></button>
                    <button className="danger" type="button" onClick={() => deleteList(list)} aria-label="Удалить" title="Удалить">×</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
