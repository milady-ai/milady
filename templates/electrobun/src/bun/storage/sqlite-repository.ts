import { Database } from "bun:sqlite";

export type NoteRow = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};

export function openAppDatabase(path = "app.db") {
  const db = new Database(path, { create: true });
  db.exec(`
    create table if not exists notes (
      id text primary key,
      title text not null,
      body text not null,
      created_at text not null
    );
  `);

  return {
    searchNotes(query: string): NoteRow[] {
      return db
        .query<NoteRow, [string]>("select * from notes where title like ? or body like ? order by created_at desc limit 20")
        .all(`%${query}%`, `%${query}%`);
    },
    close() {
      db.close();
    },
  };
}
