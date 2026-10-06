import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { appModuleFor } from './app.module';
import { validateConfig } from './config';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import { httpLogger } from './common/http-logger';
import { v2BrowserContextMiddleware, v2NoStoreMiddleware } from './auth/http/v2-browser-context';

async function bootstrap(): Promise<void> {
  const config = validateConfig(process.env);
  const app = await NestFactory.create(appModuleFor(config), { bufferLogs: true });
  app.use(httpLogger);
  app.use(v2NoStoreMiddleware);
  if (config.AUTH_V2_ENABLED) {
    app.use('/v2', v2BrowserContextMiddleware({
      allowedOrigins: config.AUTH_V2_ALLOWED_ORIGINS,
      bindingCookieName: config.AUTH_V2_BINDING_COOKIE_NAME!,
      allowLoopbackHttpDevelopment: config.AUTH_V2_ALLOW_LOOPBACK_HTTP,
    }));
  }
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
