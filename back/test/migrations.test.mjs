import test from 'node:test';
import assert from 'node:assert/strict';
import 'reflect-metadata';
import { DatabaseService } from '../dist/src/infra/database/database.service.js';
import { runMigrations } from '../dist/src/infra/database/migrations.js';

test('Database Migrations', async (t) => {
  await t.test('applies initial schema and tables', () => {
    const db = new DatabaseService(':memory:');
    runMigrations(db);

    // Verify tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => r.name);

    assert.ok(tables.includes('_migrations'), 'Should have _migrations table');
    assert.ok(tables.includes('user'), 'Should have user table');
    assert.ok(tables.includes('session'), 'Should have session table');
    assert.ok(tables.includes('account'), 'Should have account table');
    assert.ok(tables.includes('verification'), 'Should have verification table');
    assert.ok(tables.includes('projects'), 'Should have projects table');

    // Verify migrations tracking
    const migrations = db.prepare('SELECT name FROM _migrations').all();
    assert.deepEqual(migrations.map((migration) => migration.name).sort(), [
      '001_initial_auth_and_projects',
      '002_local_projects_owner',
    ]);

    // Verify idempotency
    runMigrations(db);
    const migrationsAfter = db.prepare('SELECT name FROM _migrations').all();
    assert.deepEqual(migrationsAfter, migrations);

    db.close();
  });
});
