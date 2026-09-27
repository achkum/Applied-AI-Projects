import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateConfig } from './config';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import { httpLogger } from './common/http-logger';

async function bootstrap(): Promise<void> {
  const config = validateConfig(process.env);
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.use(httpLogger);
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
  await app.listen(config.PORT, '0.0.0.0');
}

void bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error &&
    error.message.startsWith('Invalid API configuration')
      ? error.message
      : 'API startup failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
