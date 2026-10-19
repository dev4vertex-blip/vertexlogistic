import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorType = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        message = (body['message'] as string) || exception.message;
        errorType = (body['error'] as string) || exception.name;
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled Exception on ${request.method} ${request.url}: ${exception.message}`, exception.stack);
      // In production / public response, do NOT expose stack traces or internal error details
      message = 'An unexpected error occurred. Please contact system support.';
      errorType = 'InternalServerError';
    } else {
      this.logger.error(`Unknown exception type caught: ${String(exception)}`);
    }

    response.status(status).json({
      statusCode: status,
      error: errorType,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
