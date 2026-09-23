import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Histogram, Counter } from 'prom-client';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric('http_requests_total')
    private readonly requestCounter: Counter<string>,
    @InjectMetric('http_request_duration_seconds')
    private readonly requestDuration: Histogram<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();

    const path = req.route ? req.route.path : req.path;
    const method = req.method;

    const timer = this.requestDuration.startTimer();

    return next.handle().pipe(
      tap({
        next: () => {
          const status = res.statusCode;
          this.requestCounter.labels(method, path, status.toString()).inc();
          timer({ method, path, status: status.toString() });
        },
        error: (error) => {
          const status = error.status || 500;
          this.requestCounter.labels(method, path, status.toString()).inc();
          timer({ method, path, status: status.toString() });
        },
      }),
    );
  }
}
