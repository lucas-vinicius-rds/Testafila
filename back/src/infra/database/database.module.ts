import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service.ts';
import { runMigrations } from './migrations.ts';

@Global()
@Module({
  providers: [
    {
      provide: DatabaseService,
      useFactory: () => {
        const db = new DatabaseService();
        runMigrations(db);
        return db;
      },
    },
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
