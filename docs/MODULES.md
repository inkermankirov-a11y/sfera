# Карта модулей MVP

## Core

Обязательные подсистемы:

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

## Tasks

Добавляет тип `task` и бизнес-логику:

- create
- complete
- reopen
- move
- schedule

События:

- task.created
- task.completed
- task.reopened
- task.moved

## Weekly Planner

Использует Tasks, но не владеет задачами.

MVP:

- недельный экран;
- drag & drop;
- задачи без даты;
- порядок задач внутри дня;
- перенос на следующую неделю;
- полноэкранный режим.

## Journal

Добавляет тип `journal_entry`.

MVP:

- несколько записей в день;
- дата;
- rich text;
- связь с другими объектами.

## Collections

Главный пользовательский конструктор.

Позволяет создавать собственные типы:

- книги;
- рецепты;
- фильмы;
- идеи;
- мысли;
- любые будущие коллекции.

Отдельные BookModule/RecipeModule на старте не создаются.

## Calendar

Модуль-представление.

Не хранит собственные события. Показывает любые объекты, у которых есть подходящие поля даты.

## Dashboard

Компонует виджеты других модулей.

Примеры:

- задачи сегодня;
- неделя;
- последние мысли;
- быстрый ввод.

## Контракт модуля

Каждый модуль должен объявлять:

```text
id
version
dependencies
objectTypes
routes
capabilities
events
widgets
extensionPoints
```

## Правило

Если функция реализуется комбинацией Object Type + Fields + Views, новый кодовый модуль не создаём.

Модуль появляется только при наличии уникальной бизнес-логики.
