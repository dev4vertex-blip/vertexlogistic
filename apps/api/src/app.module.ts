import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from '@vertex/database';
import { AuthModule } from './auth/auth.module.js';
import { securityHeadersMiddleware } from './common/middleware/security.middleware.js';

@Module({
  imports: [HealthModule, PrismaModule, AuthModule],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(securityHeadersMiddleware).forRoutes('*');
  }
}
