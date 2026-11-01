import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Behind a reverse proxy (nginx in Docker), trust that many hops of X-Forwarded-For
  // so rate limits apply per real client instead of to the proxy's single address.
  const proxyHops = Number(process.env.TRUST_PROXY ?? 0);
  if (proxyHops > 0) app.set('trust proxy', proxyHops);
  configureApp(app);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
