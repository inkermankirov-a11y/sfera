# СФЕРА

**СФЕРА** — модульное личное пространство для задач, знаний, дневника, календаря, коллекций и будущих пользовательских модулей.

## Принципы

- ядро не знает о книгах, рецептах, задачах и дневнике;
- все данные строятся на универсальных объектах, типах, полях и связях;
- уникальная бизнес-логика подключается модулями;
- модули общаются через Core API, события, capabilities и UI extension points;
- MVP строится как модульный монолит, без преждевременных микросервисов.

## MVP

Первые модули:

- Tasks
- Weekly Planner
- Journal
- Collections
- Calendar
- Dashboard

Документация:

- [Архитектура](docs/ARCHITECTURE.md)
- [Модули](docs/MODULES.md)
- [Дорожная карта](docs/ROADMAP.md)

## Структура

```text
apps/
  web/

packages/
  core/
  module-sdk/

modules/
  tasks/
  weekly-planner/
  journal/
  collections/
  calendar/
  dashboard/

docs/
```

Статус: начальная архитектура MVP.
