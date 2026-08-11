import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import 'reflect-metadata';
import {
  ClassSerializerInterceptor,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // The admin is server-rendered HTML at /admin, so it must sit outside the
  // `api` prefix. Express 5 rejects the old `admin/(.*)` wildcard form.
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'admin', method: RequestMethod.ALL },
      { path: 'admin/{*splat}', method: RequestMethod.ALL },
    ],
  });
  app.setBaseViewsDir(join(__dirname, 'admin', 'views'));
  app.setViewEngine('hbs');
  // Static middleware runs before the router, so this is served without being
  // caught by AdminController's `:entity` route.
  app.useStaticAssets(join(__dirname, 'admin', 'public'), {
    prefix: '/admin/static',
  });
  app.use(cookieParser());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  const options = new DocumentBuilder()
    .setTitle('Base API')
    .setDescription('Base API')
    .setVersion('1.0')
    .addCookieAuth('sid')
    .setBasePath('api')
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('/docs', app, document);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
