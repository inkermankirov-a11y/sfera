export type NoteKind = "note" | "idea" | "diary" | "collection" | "list";

export type Note = {
  id: string;
  title: string;
  body: string;
  kind: NoteKind;
  projectId: string | null;
  date: string | null;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export const NOTES_STORAGE_KEY = "sfera.notes.v1";

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function createNote(partial: Partial<Note> & Pick<Note, "title">): Note {
  const now = nowIso();
  return {
    id: partial.id ?? crypto.randomUUID(),
    title: partial.title,
    body: partial.body ?? "",
    kind: partial.kind ?? "note",
    projectId: partial.projectId ?? null,
    date: partial.date ?? null,
    favorite: partial.favorite ?? false,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now
  };
}

export function seedNotes(): Note[] {
  return [
    createNote({
      id: "note-tarot-week",
      title: "Идея расклада недели",
      body: "Сохранить тему и вернуться к ней при подготовке контента.",
      kind: "idea",
      projectId: "project-tarot-content",
      favorite: true
    }),
    createNote({
      id: "note-diary-today",
      title: "Что сегодня дало мне силы",
      body: "Короткая запись дня. Дневник всегда привязан к дате.",
      kind: "diary",
      date: todayIso()
    }),
    createNote({
      id: "note-books",
      title: "Книги на осень",
      body: "Коллекция книг, которые хочется прочитать.",
      kind: "collection"
    })
  ];
}

export function readNotes(): Note[] {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((item) => createNote(item));
    }
  } catch {
    // fall through
  }
  return seedNotes();
}
