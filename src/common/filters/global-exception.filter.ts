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
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Default to 500 if not an HttpException
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'An unexpected error occurred.';

    // Format the response securely
    const errorResponse = {
      success: false,
      statusCode: status,
      errorCode:
        status === HttpStatus.INTERNAL_SERVER_ERROR
          ? 'INTERNAL_SERVER_ERROR'
          : 'API_ERROR',
      message:
        status === HttpStatus.INTERNAL_SERVER_ERROR
          ? (exception as any)?.message || 'An unexpected error occurred.'
          : typeof message === 'object' &&
              message !== null &&
              'message' in message
            ? (message as any).message
            : message,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    };

    // Log the exception appropriately using Pino via Nest Logger
    const logPayload = {
      err: exception,
      path: request.originalUrl,
      method: request.method,
      statusCode: status,
    };

    if (status >= 500) {
      this.logger.error(
        `Internal Server Error: ${request.method} ${request.originalUrl}`,
        logPayload,
      );
    } else if (status >= 400) {
      this.logger.warn(
        `Client Error: ${request.method} ${request.originalUrl}`,
        logPayload,
      );
    }

    response.status(status).json(errorResponse);
  }
}
