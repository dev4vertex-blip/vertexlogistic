import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { securityHeadersMiddleware } from './common/middleware/security.middleware.js';

@Module({
  imports: [HealthModule],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(securityHeadersMiddleware).forRoutes('*');
  }
}
