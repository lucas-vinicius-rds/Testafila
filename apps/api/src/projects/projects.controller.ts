import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../common/types.ts';
import { ProjectsService } from './projects.service.ts';

@Controller('api/projects')
export class ProjectsController {
  private readonly projectsService: ProjectsService;

  constructor(projectsService: ProjectsService) {
    this.projectsService = projectsService;
  }

  @Get()
  async listProjects() {
    return this.projectsService.listProjects();
  }

  @Get(':id')
  async getProject(@Param('id') id: string) {
    return this.projectsService.getProject(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProject(@Body() body: any, @Req() req: Request) {
    this.checkOrigin(req);
    return this.projectsService.createProject(body);
  }

  @Patch(':id')
  async updateProject(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request
  ) {
    this.checkOrigin(req);
    return this.projectsService.updateProject(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProject(@Param('id') id: string, @Req() req: Request) {
    this.checkOrigin(req);
    this.projectsService.deleteProject(id);
  }

  private checkOrigin(req: Request) {
    const origin = req.headers.origin;
    if (origin !== (process.env.APP_ORIGIN ?? 'http://localhost:3000')) {
      throw new AppError(403, 'FORBIDDEN', 'Origem da requisição não permitida');
    }
  }
}
