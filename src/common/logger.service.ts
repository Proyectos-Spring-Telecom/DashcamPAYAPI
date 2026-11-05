import { Injectable, Logger } from '@nestjs/common';

const SENSITIVE_KEY =
  /password|passhash|cvv|cvc|cardnumber|pan|pin|codigo|code|token|secret|privatekey|apikey|authorization|cookie/i;

const DRIVER_ERROR =
  /queryfailed|sql syntax|unknown column|duplicate entry|ER_[A-Z0-9_]+|econnreset|econnrefused|sqlstate|deadlock|cannot add or update a child row/i;

@Injectable()
export class LoggerService {
  private readonly logger = new Logger('DashcamPAY');

  private maskSensitiveData(data: unknown, depth = 0): unknown {
    if (data == null || depth > 8) return data;
    if (typeof data === 'string') {
      return this.maskString(data);
    }
    if (Array.isArray(data)) {
      return data.map((item) => this.maskSensitiveData(item, depth + 1));
    }
    if (typeof data === 'object') {
      const source = data as Record<string, unknown>;
      const masked: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(source)) {
        if (SENSITIVE_KEY.test(key)) {
          masked[key] = '[REDACTED]';
        } else {
          masked[key] = this.maskSensitiveData(value, depth + 1);
        }
      }
      return masked;
    }
    return data;
  }

  private maskString(str: string): string {
    if (
      /password=|token=|cvv|authorization:/i.test(str) ||
      DRIVER_ERROR.test(str) ||
      str.length > 4000
    ) {
      return '[REDACTED]';
    }
    return str;
  }

  private toSafeError(error: unknown): { message: string; name: string } {
    const raw =
      error instanceof Error
        ? error.message
        : typeof error === 'object' &&
            error !== null &&
            typeof (error as { message?: unknown }).message === 'string'
          ? String((error as { message: string }).message)
          : 'Unknown error';
    // El código del driver (ER_DUP_ENTRY, ECONNRESET…) no lleva datos y es lo
    // único que permite diagnosticar; el mensaje sí puede traer valores.
    const code = (error as { code?: unknown })?.code;
    const safeCode =
      typeof code === 'string' && /^[A-Z0-9_]{2,40}$/.test(code) ? code : null;
    return {
      message: DRIVER_ERROR.test(raw)
        ? `Error interno${safeCode ? ` (${safeCode})` : ''}`
        : raw.slice(0, 200),
      name: 'Error',
    };
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
