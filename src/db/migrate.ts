import { client } from './client'

export async function runMigrations() {
  await client.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      description VARCHAR(255) NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT false
    );
  `)
}
