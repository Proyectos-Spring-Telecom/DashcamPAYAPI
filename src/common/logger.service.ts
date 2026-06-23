import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class LoggerService {
  private readonly logger = new Logger('DashcamPAY');

  private maskSensitiveData(data: unknown): unknown {
    if (data == null) return data;
    if (typeof data === 'string') {
      return this.maskString(data);
    }
    if (Array.isArray(data)) {
      return data.map((item) => this.maskSensitiveData(item));
    }
    if (typeof data === 'object') {
      const source = data as Record<string, unknown>;
      const masked: Record<string, unknown> = { ...source };
      const sensitiveKeys = [
        'password',
        'passwordHash',
        'cvv2',
        'cvv',
        'cardNumber',
        'pin',
        'code',
        'token',
        'secretKey',
        'privateKey',
        'apiKey',
      ];
      for (const key of sensitiveKeys) {
        if (key in masked) {
          const value = masked[key];
          if (typeof value === 'string' && value.length > 0) {
            masked[key] = `***${value.slice(-3)}`;
          }
        }
      }
      return masked;
    }
    return data;
  }

  private maskString(str: string): string {
    if (
      str.includes('password=') ||
      str.includes('token=') ||
      str.includes('cvv')
    ) {
      return '***MASKED***';
    }
    return str;
  }

  private toSafeError(error: unknown): { message: string; name: string } {
    if (error instanceof Error) {
      return { message: error.message, name: error.name };
    }
    if (typeof error === 'object' && error !== null) {
      const record = error as Record<string, unknown>;
      return {
        message:
          typeof record.message === 'string' ? record.message : 'Unknown error',
        name: typeof record.name === 'string' ? record.name : 'Error',
      };
    }
    return { message: 'Unknown error', name: 'Error' };
  }

  log(context: string, message: string, data?: unknown) {
    const maskedData = data ? this.maskSensitiveData(data) : '';
    this.logger.log(`[${context}] ${message}`, maskedData);
  }

  error(context: string, message: string, error?: unknown) {
    const safeError = error ? this.toSafeError(error) : {};
    this.logger.error(`[${context}] ${message}`, safeError);
  }

  warn(context: string, message: string, data?: unknown) {
    const maskedData = data ? this.maskSensitiveData(data) : '';
    this.logger.warn(`[${context}] ${message}`, maskedData);
  }

  debug(context: string, message: string, data?: unknown) {
    if (process.env.NODE_ENV === 'development') {
      const maskedData = data ? this.maskSensitiveData(data) : '';
      this.logger.debug(`[${context}] ${message}`, maskedData);
    }
  }
}
