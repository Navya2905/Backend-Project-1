import { INestApplication, ValidationPipe } from '@nestjs/common';

// Shared by main.ts and the end-to-end tests, so tests run the same pipeline as production.
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip fields the DTO doesn't declare
      forbidNonWhitelisted: true, // ...and reject requests that send them
      transform: true,
    }),
  );
  app.enableShutdownHooks();
}
