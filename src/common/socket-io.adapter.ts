import { INestApplicationContext, WebSocketAdapter } from '@nestjs/common';
import { MessageMappingProperties } from '@nestjs/websockets';
import { Observable, fromEvent, EMPTY } from 'rxjs';
import { mergeMap, filter } from 'rxjs/operators';
import { Server, ServerOptions } from 'socket.io';

/**
 * Adaptador de Socket.IO para NestJS
 * Implementa correctamente WebSocketAdapter para evitar conflictos
 * Usa un patrón singleton para evitar múltiples instancias del servidor
 */
export class SocketIOAdapter implements WebSocketAdapter {
  private static ioServer: Server | null = null;
  
  constructor(
    private app: INestApplicationContext,
  ) {}

  create(port: number, options?: ServerOptions & { namespace?: string; server?: any }): any {
    // Si ya existe una instancia del servidor principal
    if (SocketIOAdapter.ioServer) {
      // Si se solicita un namespace específico, retornar ese namespace
      if (options?.namespace) {
        return SocketIOAdapter.ioServer.of(options.namespace);
      }
      // Si no, retornar el servidor principal
      return SocketIOAdapter.ioServer;
    }

    const { Server } = require('socket.io');
    
    if (!this.app) {
      SocketIOAdapter.ioServer = new Server(port, options);
      return options?.namespace 
        ? SocketIOAdapter.ioServer!.of(options.namespace)
        : SocketIOAdapter.ioServer;
    }

    // Obtener el servidor HTTP de la aplicación
    const httpServer = this.getHttpServer();
    
    if (!httpServer) {
      SocketIOAdapter.ioServer = new Server(port, options);
      return options?.namespace 
        ? SocketIOAdapter.ioServer!.of(options.namespace)
        : SocketIOAdapter.ioServer;
    }

    // Crear UNA ÚNICA instancia del servidor Socket.IO adjunto al servidor HTTP de NestJS
    SocketIOAdapter.ioServer = new Server(httpServer, {
      ...options,
      cors: options?.cors || {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    // Si se solicita un namespace, retornarlo
    if (options?.namespace) {
      return SocketIOAdapter.ioServer!.of(options.namespace);
    }

    return SocketIOAdapter.ioServer;
  }

  bindClientConnect(server: Server, callback: Function) {
    server.on('connection', (socket: any) => callback(socket));
  }

  bindClientDisconnect(client: any, callback: Function) {
    client.on('disconnect', () => callback(client));
  }

  bindMessageHandlers(
    client: any,
    handlers: MessageMappingProperties[],
    transform: (data: any) => Observable<any>,
  ) {
    const disconnect$ = fromEvent(client, 'disconnect').pipe(
      mergeMap(() => EMPTY),
    );

    handlers.forEach(({ message, callback }) => {
      const source$ = fromEvent(client, message).pipe(
        mergeMap((payload: any) => {
          const { data, ack } = this.mapPayload(payload);
          return transform(callback(data, ack)).pipe(
            filter((response: any) => !isNil(response)),
          );
        }),
      );
      source$.subscribe((response: any) => {
        if (client.connected) {
          client.emit(message, response);
        }
      });
    });
  }

  mapPayload(payload: any): { data: any; ack?: Function } {
    if (!Array.isArray(payload)) {
      return { data: payload };
    }
    const lastElement = payload[payload.length - 1];
    const isAck = typeof lastElement === 'function';
    if (isAck) {
      const size = payload.length - 1;
      return {
        data: size === 1 ? payload[0] : payload.slice(0, size),
        ack: lastElement,
      };
    }
    return { data: payload.length === 1 ? payload[0] : payload };
  }

  close(server: Server) {
    server.close();
    // Limpiar la instancia singleton al cerrar
    SocketIOAdapter.ioServer = null;
  }

  private getHttpServer(): any {
    try {
      // Intentar obtener el servidor HTTP de la aplicación
      return (this.app as any).getHttpServer?.() || 
             (this.app as any).getHttpAdapter?.()?.getHttpServer?.() ||
             (this.app as any).httpAdapter?.getHttpServer?.();
    } catch {
      return null;
    }
  }
}

function isNil(value: any): boolean {
  return value === undefined || value === null;
}
