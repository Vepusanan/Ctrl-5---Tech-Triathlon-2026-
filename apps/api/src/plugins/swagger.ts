import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fp from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export const swaggerPlugin = fp(
  async (app) => {
    await app.register(swagger, {
      openapi: {
        info: { title: 'Waypoint API', version: '0.0.0' },
        components: {
          securitySchemes: {
            session: { type: 'apiKey', in: 'cookie', name: 'session' },
          },
        },
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: '/api/docs' });
  },
  { name: 'swagger' },
);
