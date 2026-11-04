import { DatabaseService } from './database.service';

export interface Migration {
  name: string;
  up: (db: DatabaseService) => void;
}

export const migrations: Migration[] = [
  {
    name: '001_initial_auth_and_projects',
    up: (db: DatabaseService) => {
      // Better Auth standard schema tables
      db.exec(`
        CREATE TABLE IF NOT EXISTS user (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          emailVerified INTEGER NOT NULL DEFAULT 0,
          image TEXT,
          role TEXT NOT NULL DEFAULT 'user',
          banned INTEGER NOT NULL DEFAULT 0,
          banReason TEXT,
          banExpires TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS session (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          expiresAt TEXT NOT NULL,
          ipAddress TEXT,
          userAgent TEXT,
          impersonatedBy TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);
        CREATE INDEX IF NOT EXISTS idx_session_user ON session(userId);
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS account (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          accountId TEXT NOT NULL,
          providerId TEXT NOT NULL,
          accessToken TEXT,
          refreshToken TEXT,
          idToken TEXT,
          accessTokenExpiresAt TEXT,
          refreshTokenExpiresAt TEXT,
          scope TEXT,
          password TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_account_user ON account(userId);
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS verification (
          id TEXT PRIMARY KEY,
          identifier TEXT NOT NULL,
          value TEXT NOT NULL,
          expiresAt TEXT NOT NULL,
          createdAt TEXT,
          updatedAt TEXT
        );
      `);

      // Projects table
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          schema_version INTEGER NOT NULL DEFAULT 1,
          scene TEXT NOT NULL,
          preview_key TEXT,
          FOREIGN KEY (owner_id) REFERENCES user(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_projects_owner_updated ON projects(owner_id, updated_at DESC);
      `);
    },
  },
  {
    name: '002_local_projects_owner',
    up: (db: DatabaseService) => {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT OR IGNORE INTO user (id, name, email, emailVerified, role, banned, createdAt, updatedAt)
        VALUES (?, ?, ?, 1, 'user', 0, ?, ?)
      `).run('local-project-owner', 'Projeto local', 'local-project-owner@testafila.invalid', now, now);
    },
  },
];

export function runMigrations(db: DatabaseService): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT name FROM _migrations').all() as { name: string }[];
  const appliedSet = new Set(appliedRows.map((r) => r.name));

  const insertStmt = db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)');

  for (const migration of migrations) {
    if (!appliedSet.has(migration.name)) {
      db.transaction(() => {
        migration.up(db);
        insertStmt.run(migration.name, new Date().toISOString());
      });
    }
  }
}
