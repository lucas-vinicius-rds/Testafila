import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.ts';
import { getAppOrigins } from './common/app-origins.ts';

async function bootstrap() {
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '127.0.0.1';
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: getAppOrigins(), credentials: true });
  await app.listen(port, host);
}

bootstrap().catch((error: unknown) => {
  console.error('[TestaFila API] Bootstrap falhou:', error);
  process.exitCode = 1;
});
