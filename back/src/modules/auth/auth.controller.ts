import { All, Controller, Req, Res } from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.ts';

@Controller('api/auth')
export class AuthController {
  private readonly handler: ReturnType<typeof toNodeHandler>;
  constructor(auth: AuthService) { this.handler = toNodeHandler(auth.instance); }

  @All('*')
  handle(@Req() req: Request, @Res() res: Response) {
    return this.handler(req, res);
  }
}
