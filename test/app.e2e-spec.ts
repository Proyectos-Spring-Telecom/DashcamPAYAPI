import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

// e2e mínimo contra el health check público. Requiere entorno (BD, env) para
// arrancar AppModule; se ejecuta en el arnés/CI con la réplica levantada.
describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/health/live (GET) responde 200', () => {
    return request(app.getHttpServer()).get('/health/live').expect(200);
  });
});
