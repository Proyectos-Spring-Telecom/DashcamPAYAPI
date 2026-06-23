import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConnectedUsers } from 'src/entities/ConnectedUsers';
import { Clientes } from 'src/entities/Clientes';

interface AuthenticatedSocket extends Socket {
  userId?: number;
  cliente?: number;
  rol?: number;
}

interface SessionData {
  userId: number;
  cliente: number;
  rol: number;
  socket: Socket;
  rooms: Set<string>;
}

@Injectable()
@WebSocketGateway({
  namespace: '/monitoreo',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
})
export class MonitoreoGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MonitoreoGateway.name);
  private activeSessions = new Map<string, SessionData>(); // socketId -> SessionData
  private lastActiveIntervals = new Map<string, NodeJS.Timeout>(); // socketId -> interval

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectRepository(ConnectedUsers)
    private readonly connectedUsersRepository: Repository<ConnectedUsers>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Autenticación JWT desde query params o auth headers
      const token =
        client.handshake.auth?.token ||
        client.handshake.query?.token?.toString();

      if (!token) {
        this.logger.warn(`Conexión rechazada: sin token - SocketId: ${client.id}`);
        client.disconnect();
        return;
      }

      // Verificar y decodificar JWT
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      // Asignar datos del usuario al socket
      client.userId = payload.id;
      client.cliente = payload.cliente;
      client.rol = payload.rol;

      // Buscar si el usuario ya tiene una sesión (activa o inactiva reciente)
      // Prioridad: primero buscar activa, luego inactiva más reciente
      // Si existe, reutilizar ese registro SIN actualizar socketId
      // NOTA: Siempre reutiliza el mismo registro sin importar el tiempo transcurrido
      let existingUserSession = await this.connectedUsersRepository.findOne({
        where: { 
          idUsuario: payload.id,
          estatus: 1,
        },
        order: { lastActive: 'DESC' },
      });

      // Si no hay sesión activa, buscar la más reciente (inactiva) del mismo usuario
      // Esto incluye sesiones de hace días/semanas - siempre reutiliza el mismo registro
      if (!existingUserSession) {
        existingUserSession = await this.connectedUsersRepository.findOne({
          where: { 
            idUsuario: payload.id,
          },
          order: { lastActive: 'DESC' },
        });
      }

      if (existingUserSession) {
        // Usuario ya tiene sesión (activa o inactiva): reutilizar el mismo registro
        // Reactivar si estaba inactiva y actualizar lastActive
        // NO actualizar socketId para mantener el mismo registro
        await this.connectedUsersRepository.update(
          { id: existingUserSession.id },
          {
            estatus: 1,
            lastActive: new Date(),
            // NO actualizamos socketId para mantener el mismo registro
          },
        );
        this.logger.log(
          `Sesión reutilizada: SesiónId: ${existingUserSession.id} | SocketId BD: ${existingUserSession.socketId} | SocketId conexión: ${client.id} | Usuario: ${payload.id}`,
        );

        // Limpiar sesión anterior de memoria si existe con el socketId anterior
        if (this.activeSessions.has(existingUserSession.socketId)) {
          const oldInterval = this.lastActiveIntervals.get(existingUserSession.socketId);
          if (oldInterval) {
            clearInterval(oldInterval);
            this.lastActiveIntervals.delete(existingUserSession.socketId);
          }
          this.activeSessions.delete(existingUserSession.socketId);
        }
      } else {
        // Verificar si ya existe sesión con ese SocketId específico
        const existingSocketSession = await this.connectedUsersRepository.findOne({
          where: { socketId: client.id },
        });

        if (existingSocketSession) {
          // Actualizar sesión existente con ese SocketId
          await this.connectedUsersRepository.update(
            { socketId: client.id },
            {
              estatus: 1,
              lastActive: new Date(),
            },
          );
          this.logger.log(
            `Sesión actualizada (mismo SocketId): SocketId: ${client.id} | Usuario: ${payload.id}`,
          );
        } else {
          // Crear nueva sesión solo si no existe ninguna para este usuario
          const newSession = this.connectedUsersRepository.create({
            idUsuario: payload.id,
            socketId: client.id,
            estatus: 1,
          });
          await this.connectedUsersRepository.save(newSession);
          this.logger.log(
            `Nueva sesión creada: SocketId: ${client.id} | Usuario: ${payload.id}`,
          );
        }
      }

      // Obtener clientes hijos para crear rooms
      const { ids } = await this.clienteHijos(payload.cliente);

      // Unirse a rooms por cada cliente (incluyendo el propio)
      const rooms = ids.map((id) => `cliente:${id}`);
      rooms.forEach((room) => {
        client.join(room);
      });

      // Guardar sesión en memoria
      this.activeSessions.set(client.id, {
        userId: payload.id,
        cliente: payload.cliente,
        rol: payload.rol,
        socket: client,
        rooms: new Set(rooms),
      });

      // Configurar intervalo para actualizar LastActive cada 30 segundos
      const interval = setInterval(() => {
        this.updateLastActive(client.id);
      }, 30000); // 30 segundos
      this.lastActiveIntervals.set(client.id, interval);

      this.logger.log(
        `Cliente conectado: SocketId: ${client.id} | Usuario: ${payload.id} | Cliente: ${payload.cliente} | Rooms: ${rooms.join(', ')}`,
      );

      // Notificar conexión exitosa
      client.emit('connected', {
        message: 'Conectado al sistema de monitoreo',
        userId: payload.id,
        cliente: payload.cliente,
        rooms: rooms,
      });
    } catch (error) {
      this.logger.error(`Error en conexión: ${error.message} | SocketId: ${client.id}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    try {
      // Limpiar intervalo
      const interval = this.lastActiveIntervals.get(client.id);
      if (interval) {
        clearInterval(interval);
        this.lastActiveIntervals.delete(client.id);
      }

      // Buscar la sesión activa del usuario (no por socketId porque puede haber cambiado)
      if (client.userId) {
        const userSession = await this.connectedUsersRepository.findOne({
          where: { 
            idUsuario: client.userId,
            estatus: 1,
          },
        });

        if (userSession) {
          // Marcar sesión como desconectada (soft delete) usando el Id del registro
          await this.connectedUsersRepository.update(
            { id: userSession.id },
            {
              estatus: 0,
              lastActive: new Date(),
            },
          );
          this.logger.log(`Cliente desconectado: SesiónId: ${userSession.id} | SocketId conexión: ${client.id} | Usuario: ${client.userId}`);
        } else {
          // Si no encuentra por usuario, intentar por socketId (fallback)
          await this.connectedUsersRepository.update(
            { socketId: client.id },
            {
              estatus: 0,
              lastActive: new Date(),
            },
          );
          this.logger.log(`Cliente desconectado (fallback por socketId): SocketId: ${client.id}`);
        }
      } else {
        // Si no hay userId, buscar por socketId
        await this.connectedUsersRepository.update(
          { socketId: client.id },
          {
            estatus: 0,
            lastActive: new Date(),
          },
        );
        this.logger.log(`Cliente desconectado (sin userId): SocketId: ${client.id}`);
      }

      // Eliminar de memoria
      this.activeSessions.delete(client.id);
    } catch (error) {
      this.logger.error(`Error al desconectar: ${error.message} | SocketId: ${client.id}`);
    }
  }

  /**
   * Actualiza LastActive de una sesión en BD
   * Busca por socketId en memoria para obtener userId, luego busca en BD por userId
   */
  private async updateLastActive(socketId: string): Promise<void> {
    try {
      // Obtener userId desde la sesión en memoria
      const session = this.activeSessions.get(socketId);
      if (session && session.userId) {
        // Buscar sesión activa del usuario en BD
        const userSession = await this.connectedUsersRepository.findOne({
          where: { 
            idUsuario: session.userId,
            estatus: 1,
          },
        });

        if (userSession) {
          // Actualizar usando el Id del registro (no socketId)
          await this.connectedUsersRepository.update(
            { id: userSession.id },
            { lastActive: new Date() },
          );
        }
      } else {
        // Fallback: buscar por socketId si no hay sesión en memoria
        await this.connectedUsersRepository.update(
          { socketId },
          { lastActive: new Date() },
        );
      }
    } catch (error) {
      this.logger.error(`Error al actualizar LastActive: ${error.message} | SocketId: ${socketId}`);
    }
  }

  /**
   * Obtiene usuarios conectados por cliente
   */
  async getConnectedUsersByCliente(idCliente: number): Promise<string[]> {
    try {
      const { ids, placeholders } = await this.clienteHijos(idCliente);

      const query = `
        SELECT cu.SocketId, cu.IdUsuario 
        FROM ConnectedUsers cu 
        INNER JOIN Usuarios u ON cu.IdUsuario = u.Id 
        WHERE cu.Estatus = 1 AND u.IdCliente IN (${placeholders})
      `;

      const results = await this.clienteRepository.query(query, ids);
      return results.map((row: any) => row.SocketId);
    } catch (error) {
      this.logger.error(`Error al obtener usuarios conectados: ${error.message}`);
      return [];
    }
  }

  /**
   * Emite actualización de posición a los clientes conectados del cliente correspondiente
   */
  emitPositionUpdate(positionData: {
    numeroSerieValidador: string;
    latitud: number;
    longitud: number;
    velocidad: number;
    fechaHora: Date;
    idCliente: number;
    exactitud?: string;
    direccion?: number;
    estado?: number;
    [key: string]: any;
  }): void {
    // Emitir solo a los clientes del cliente correspondiente usando rooms
    const room = `cliente:${positionData.idCliente}`;
    this.server.to(room).emit('position:update', positionData);
    this.logger.debug(`Posición emitida a room: ${room} | Validador: ${positionData.numeroSerieValidador}`);
  }

  /**
   * Emite actualización completa de unidad de monitoreo
   * unidadData debe tener el mismo formato que devuelve obtenerUnidades
   */
  emitUnidadUpdate(unidadData: any, idCliente: number): void {
    const room = `cliente:${idCliente}`;
    this.server.to(room).emit('unidad:update', unidadData);
    this.logger.debug(`Unidad actualizada emitida a room: ${room} | Vehículo: ${unidadData?.id}`);
  }

  /**
   * Handler para suscripción manual a eventos específicos
   */
  @SubscribeMessage('subscribe:unidades')
  handleSubscribeUnidades(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.cliente) {
      return { error: 'No autenticado' };
    }
    // El cliente ya está en los rooms necesarios desde handleConnection
    this.logger.debug(`Cliente suscrito a unidades: SocketId: ${client.id}`);
    return { message: 'Suscrito a actualizaciones de unidades' };
  }

  /**
   * Función para obtener los clientes hijos (igual que en MonitoreoService)
   */
  private async clienteHijos(cliente: number) {
    const clientesFiltrado = await this.clienteRepository.query(
      `CALL spGetClientes(?);`,
      [cliente],
    );

    const idsFiltrados = clientesFiltrado[0]; // El primer índice contiene los resultados
    const ids = idsFiltrados
      .map((clientesFiltrado: any) => Number(clientesFiltrado.Id))
      .filter(Boolean);
    if (ids.length === 0) {
      return { ids: [cliente], placeholders: '?' }; // Al menos el cliente mismo
    }

    // Construir el query dinámico con los IDs
    const placeholders = ids.map(() => '?').join(', ');
    return { ids, placeholders };
  }
}
