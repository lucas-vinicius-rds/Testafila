import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { HttpExceptionFilter } from './common/http-exception.filter.ts';
import { DatabaseModule } from './database/database.module.ts';
import { ProjectsModule } from './projects/projects.module.ts';
import { HealthModule } from './health/health.module.ts';

@Module({
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
  imports: [
    DatabaseModule,
    ProjectsModule,
    HealthModule,
  ],
})
export class AppModule {}
