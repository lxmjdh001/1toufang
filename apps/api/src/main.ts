import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix("api");
  const configuredOrigins = config.get<string>("WEB_URLS");
  const defaultOrigins = [
    config.get<string>("WEB_URL") ?? "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3006"
  ];
  const allowedOrigins = Array.from(
    new Set((configuredOrigins ? configuredOrigins.split(",") : defaultOrigins).map((origin) => origin.trim()))
  );
  app.enableCors({
    origin: allowedOrigins,
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("WzzAds API")
    .setDescription("TikTok + Meta one-click ad operations API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(config.get<number>("PORT") ?? 4000);
}

void bootstrap();
