import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../modules/auth/auth.service.ts';
import { AppError } from './types.ts';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const session = await this.authService.instance.api.getSession({ headers: request.headers });

    if (!session) {
      throw new AppError(401, 'UNAUTHORIZED', 'Sessão necessária para acessar este recurso');
    }

    request.user = session.user;
    return true;
  }
}
