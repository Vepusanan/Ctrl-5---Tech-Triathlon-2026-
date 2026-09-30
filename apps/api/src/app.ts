import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { Database } from '@waypoint/database';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { healthRoutes } from './modules/health/routes.ts';

interface AppOptions {
  db: Database;
  logger: NonNullable<FastifyServerOptions['logger']>;
}

export async function buildApp({ db, logger }: AppOptions) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(swagger, {
    openapi: { info: { title: 'Waypoint API', version: '0.0.0' } },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  await app.register(healthRoutes, { prefix: '/api', db });

  return app;
}
