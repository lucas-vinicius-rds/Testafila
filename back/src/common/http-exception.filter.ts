import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppError } from './types.ts';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'Erro interno do servidor';
    const parserError = exception instanceof Error
      ? exception as Error & { type?: string; status?: number }
      : undefined;

    if (parserError?.type === 'entity.too.large' && parserError.status === 413) {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'O projeto excedeu o limite de 100 KiB.';
    } else if (parserError?.type === 'entity.parse.failed' && parserError.status === 400) {
      status = HttpStatus.BAD_REQUEST;
      code = 'BAD_REQUEST';
      message = 'O corpo da requisição deve conter JSON válido.';
    } else if (exception instanceof AppError) {
      status = exception.statusCode;
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res: any = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        message = res.message || message;
      }

      switch (status) {
        case HttpStatus.BAD_REQUEST:
          code = 'BAD_REQUEST';
          break;
        case HttpStatus.UNAUTHORIZED:
          code = 'UNAUTHORIZED';
          break;
        case HttpStatus.FORBIDDEN:
          code = 'FORBIDDEN';
          break;
        case HttpStatus.NOT_FOUND:
          code = 'NOT_FOUND';
          break;
        case HttpStatus.CONFLICT:
          code = 'CONFLICT';
          break;
        default:
          code = 'INTERNAL_SERVER_ERROR';
      }
    }

    response.status(status).json({
      error: {
        code,
        message,
      },
    });
  }
}
