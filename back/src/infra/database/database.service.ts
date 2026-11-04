import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

const require = createRequire(import.meta.url);

export interface PreparedStatement {
  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db: any = null;
  public readonly dbPath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.dbPath = customPath;
    } else {
      // Workspace commands run with back as cwd, independent of source vs dist.
      this.dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data/testafila.sqlite');
    }

    this.connect();
  }

  public connect(): void {
    if (this.db) {
      return;
    }

    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    try {
      const BetterSqlite3 = require('better-sqlite3');
      this.db = new BetterSqlite3(this.dbPath);
    } catch (error) { throw new Error('better-sqlite3 não está disponível; instalação/compilação obrigatória.', { cause: error }); }

    this.exec('PRAGMA foreign_keys = ON;');
    if (this.dbPath !== ':memory:') {
      try {
        this.exec('PRAGMA journal_mode = WAL;');
      } catch {
        // WAL may not be supported on all environments
      }
    }
    this.exec('PRAGMA busy_timeout = 5000;');
  }

  public onModuleInit(): void {
    this.connect();
  }

  public onModuleDestroy(): void {
    this.close();
  }

  public exec(sql: string): void {
    if (!this.db) this.connect();
    this.db.exec(sql);
  }

  public prepare(sql: string): PreparedStatement {
    if (!this.db) this.connect();
    const stmt = this.db.prepare(sql);
    return {
      run: (...params: any[]) => stmt.run(...params),
      get: (...params: any[]) => stmt.get(...params),
      all: (...params: any[]) => stmt.all(...params),
    };
  }

  public transaction<T>(fn: () => T): T {
    if (!this.db) this.connect();
    this.exec('BEGIN IMMEDIATE;');
    try {
      const result = fn();
      this.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        this.exec('ROLLBACK;');
      } catch {
        // Ignore rollback error if already aborted
      }
      throw err;
    }
  }

  public getRawDatabase(): any {
    if (!this.db) this.connect();
    return this.db;
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
