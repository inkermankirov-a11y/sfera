# Архитектура MVP «СФЕРА»

## 1. Цель

Создать расширяемую платформу, в которой новые пользовательские функции подключаются как модули, не ломая ядро.

## 2. Ядро

Core содержит только универсальные механизмы:

- Workspace
- Objects
- Object Types
- Fields
- Relations
- Views
- Events
- History
- Search
- Files
- Module Registry

Core не должен содержать сущности «Книга», «Рецепт», «Дневник» или «Задача».

## 3. Универсальная модель объекта

Базовая сущность:

```text
Object
- id
- workspaceId
- typeId
- title
- properties
- createdAt
- updatedAt
- archivedAt
```

Динамические пользовательские поля хранятся в `properties`. Системные поля остаются нормализованными.

## 4. Типы объектов

`ObjectType` описывает схему объекта и может быть:

- создан модулем;
- создан пользователем без программирования.

Минимальные типы полей MVP:

- text
- rich_text
- number
- boolean
- date
- datetime
- select
- multi_select
- rating
- url
- relation
- file

## 5. Связи

Связи хранятся отдельно от объектов:

```text
ObjectRelation
- id
- fromObjectId
- toObjectId
- relationType
- metadata
- createdAt
```

Примеры:

- goal contains task
- task depends_on task
- book inspired thought

## 6. События

Модули не должны напрямую импортировать внутренние сервисы других модулей.

Базовые события:

- object.created
- object.updated
- object.archived
- relation.created
- task.created
- task.completed
- task.moved
- journal.entry.created
- file.uploaded

## 7. Разрешённые интерфейсы между модулями

1. Core API
2. Event Bus
3. Module Capabilities
4. UI Extension Points

Прямые циклические зависимости между модулями запрещены.

## 8. UI Extension Points

Ядро предоставляет точки расширения:

- sidebar
- dashboard
- object.actions
- object.sidebar
- settings

Модули могут регистрировать страницы, виджеты и действия.

## 9. Представления

Один набор объектов может иметь разные Views:

- list
- table
- cards
- calendar

Фильтрация, сортировка и группировка принадлежат View, а не самим данным.

## 10. История

Разделить:

- техническую историю изменений;
- пользовательскую содержательную временную линию.

Это разные сущности и разные сценарии.

## 11. Архитектурный стиль MVP

Используем **модульный монолит**.

Не используем на старте:

- микросервисы;
- внешний marketplace;
- real-time collaboration;
- полноценный offline-first;
- AI-агента;
- сложный automation builder.

## 12. Предварительный стек

- TypeScript
- Next.js
- PostgreSQL
- JSONB для динамических properties
- объектное хранилище для файлов
- PWA / online-first + local cache

Конкретный ORM и UI-библиотека выбираются перед реализацией persistence-слоя.
