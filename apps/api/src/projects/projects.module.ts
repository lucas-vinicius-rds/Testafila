import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service.ts';
import { ProjectsController } from './projects.controller.ts';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
