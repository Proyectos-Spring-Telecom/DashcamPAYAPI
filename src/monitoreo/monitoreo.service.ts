import { nowDb } from 'src/common/clock';
import { clienteHijosDesdeSp } from 'src/common/tenant/ownership-resolvers';
import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiResponseCommon } from 'src/common/ApiResponse';
import { Clientes } from 'src/entities/Clientes';
import { Variantes } from 'src/entities/Variantes';
import { UsuariosZonas } from 'src/entities/UsuariosZonas';
import { Posiciones } from 'src/entities/Posiciones';
import { Vehiculos } from 'src/entities/Vehiculos';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Validadores } from 'src/entities/Validadores';
import { Operadores } from 'src/entities/Operadores';
import { Usuarios } from 'src/entities/Usuarios';
import { Turnos } from 'src/entities/Turnos';
import { Viajes } from 'src/entities/Viajes';
import { Repository } from 'typeorm';
import { RecorridoMonitoreoDto } from './dto/recorrido-monitoreo.dto';

@Injectable()
export class MonitoreoService {
  private readonly logger = new Logger(MonitoreoService.name);

  constructor(
    @InjectRepository(UsuariosZonas)
    private readonly usuarioszonasRepository: Repository<UsuariosZonas>,
    @InjectRepository(Variantes)
    private readonly variantesRepository: Repository<Variantes>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    @InjectRepository(Posiciones)
    private readonly posicionesRepository: Repository<Posiciones>,
    @InjectRepository(Vehiculos)
    private readonly vehiculosRepository: Repository<Vehiculos>,
    @InjectRepository(Instalaciones)
    private readonly instalacionesRepository: Repository<Instalaciones>,
    @InjectRepository(Validadores)
    private readonly validadoresRepository: Repository<Validadores>,
    @InjectRepository(Operadores)
    private readonly operadoresRepository: Repository<Operadores>,
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    @InjectRepository(Turnos)
    private readonly turnosRepository: Repository<Turnos>,
    @InjectRepository(Viajes)
    private readonly viajesRepository: Repository<Viajes>,
  ) {}

  //funcion para obtener los clientes hijos
  private async clienteHijos(cliente: number) {
    return clienteHijosDesdeSp(this.clienteRepository.manager, cliente);
  }

  private async consultarVarianteListado(cliente: number) {
    const query = `
  SELECT 
    -- Datos del variante (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariante,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.RecorridoInterpolar AS recorridoInterpolar,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariante,
    d.Estatus AS estatusVariante,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Id IN (?)   -- cliente del token (parametrizado)
  AND c.Estatus = 1
  AND ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1          -- Solo zonas activas
  AND d.Estatus = 1

ORDER BY d.Id DESC;
    `;
    return this.usuarioszonasRepository.query(query, [cliente]);
  }

  private async consultarVarianteListadoPorZonasUsuario(
    cliente: number,
    idUsuario: number,
  ) {
    const query = `
  SELECT 
    d.Id AS id,
    d.Nombre AS nombreVariante,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.RecorridoInterpolar AS recorridoInterpolar,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariante,
    d.Estatus AS estatusVariante,
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente
FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id
WHERE c.Id IN (?)
  AND r.Id IN (
    SELECT uz.IdZona FROM UsuariosZonas uz
    WHERE uz.IdUsuario = ? AND uz.Estatus = 1
  )
  AND c.Estatus = 1
  AND ru.Estatus = 1
  AND r.Estatus = 1
  AND d.Estatus = 1
ORDER BY d.Id DESC;
    `;
    return this.usuarioszonasRepository.query(query, [cliente, idUsuario]);
  }

  // ========================================
  // 🔹 OBTENER EL MAPA DE MONITOREO
  // ========================================
  async monitoreoListado(idUser: number, cliente: number, rol: number) {
    try {
      let data;
      let ultimaPosicion: any[] = [];
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          data = await this.usuarioszonasRepository.query(
            `
  SELECT 
    -- Datos del variante (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariante,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.RecorridoInterpolar AS recorridoInterpolar,
    d.DistanciaKm AS distanciaKm,
    d.Estatus AS estatusVariante,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1          -- Solo zonas activas
  AND d.Estatus = 1
  AND c.Estatus = 1

ORDER BY d.Id DESC;
      `,
          );
          ultimaPosicion = await this.ultimaPosicion();
          break;

        case 2:
          data = await this.consultarVarianteListado(cliente);
          ultimaPosicion = await this.ultimaPosicion(cliente);
          break;

        case 3:
          data = await this.consultarVarianteListadoPorZonasUsuario(
            cliente,
            idUser,
          );
          ultimaPosicion = await this.ultimaPosicion(cliente, idUser);
          break;

        default:
          data = await this.consultarVarianteListado(cliente);
          ultimaPosicion = await this.ultimaPosicion(cliente);
          break;
      }

      const variantes = data.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
        distanciaKm: Number(item.distanciaKm),
      }));

      const posicion = ultimaPosicion.map((item) => ({
        ...item,
        id: Number(item.id),
        idDispositivo: Number(item.idDispositivo),
        idContador: Number(item.idContador),
        idVehiculo: Number(item.idVehiculo),
      }));

      // Transformación de resultados
      const _result: ApiResponseCommon = {
        data: variantes,
      };

      return { variantes, posicion };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Error al obtener listado variantes',
      );
    }
  }

  private async ultimaPosicion(cliente?: number, idUsuarioZonas?: number) {
    const query = `
SELECT
    up.Id AS id,
    up.Exactitud AS exactitud,
    up.Estado AS estado,
    up.Velocidad AS velocidad,
    up.Direccion AS direccion,
    up.Latitud AS latitud,
    up.Longitud AS longitud,
    up.FechaHora AS fechaHora,
    up.FHRegistro AS fhRegistro,
    up.NumeroSerieValidador AS numeroSerieValidador,
    
    -- Validador
  d.Id AS idDispositivo,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contador
  i.IdContador AS idContador,
  cont.NumeroSerie AS numeroSerieContador,
  cont.Marca AS marcaContador,
  cont.Modelo AS modeloContador,
  
  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,
  v.Foto AS foto,

    CONCAT(
        cli.Nombre,
        IFNULL(CONCAT(' ', cli.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', cli.ApellidoMaterno), '')
    ) AS nombreCompletoCliente

FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
INNER JOIN Contadores cont ON i.IdContador = cont.Id AND i.IdCliente = cont.IdCliente
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes cli ON i.IdCliente = cli.Id
INNER JOIN UltimaPosicion up ON d.NumeroSerie = up.NumeroSerieValidador
    
WHERE i.Estatus = 1  -- Solo instalaciones activas
AND cli.Estatus = 1
${cliente != null ? 'AND cli.Id IN (?)' : ''}
${
  idUsuarioZonas != null
    ? `AND EXISTS (
  SELECT 1
  FROM Turnos t
  INNER JOIN Viajes vi ON vi.IdTurno = t.Id AND vi.Estatus = 1
  INNER JOIN Variantes va ON va.Id = vi.IdVariante
  INNER JOIN Rutas ru ON ru.Id = va.IdRuta
  INNER JOIN UsuariosZonas uz
    ON uz.IdZona = ru.IdZona AND uz.IdUsuario = ? AND uz.Estatus = 1
  WHERE t.IdInstalacion = i.Id
)`
    : ''
}

ORDER BY up.Id DESC;

    `;
    const params: number[] = [];
    if (cliente != null) params.push(cliente);
    if (idUsuarioZonas != null) params.push(idUsuarioZonas);
    return this.usuarioszonasRepository.query(query, params);
  }

  // ========================================
  // 🔹 OBTENER EL RECORRIDO DE UN DISPOSITIVO
  // ========================================
  async monitoreoRecorrido(
    recorridoMonitoreoDto: RecorridoMonitoreoDto,
    cliente: number,
    rol: number,
    idUser: number,
  ) {
    try {
      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }
      const fechaDesfasada = nowDb();
      // Solo la fecha del momento
      const fechaActual = `${fechaDesfasada.getUTCFullYear()}-${pad(fechaDesfasada.getUTCMonth() + 1)}-${pad(fechaDesfasada.getUTCDate())}`;
      const { NumeroSerieValidador } = recorridoMonitoreoDto;

      // Usar parámetros preparados para evitar SQL injection
      const fechaInicio = `${fechaActual} 00:00:00`;
      const fechaFin = `${fechaActual} 23:59:59`;

      const recorridoMonitoreo = await this.usuarioszonasRepository.query(
        `
SELECT
  up.Id AS id,
    up.Exactitud AS exactitud,
    up.Estado AS estado,
    up.Velocidad AS velocidad,
    up.Direccion AS direccion,
    up.Latitud AS latitud,
    up.Longitud AS longitud,
    up.FechaHora AS fechaHora,
    up.FHRegistro AS fhRegistro,
    up.NumeroSerieValidador AS numeroSerieValidador,
    
    -- Validador
  d.Id AS idDispositivo,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contador (a través de InstalacionContadores - múltiples contadores concatenados)
  GROUP_CONCAT(DISTINCT cont.Id ORDER BY cont.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT cont.NumeroSerie ORDER BY cont.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT cont.Marca ORDER BY cont.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT cont.Modelo ORDER BY cont.Id SEPARATOR ', ') AS modeloContadores,
  -- Para compatibilidad (primer contador)
  MIN(cont.Id) AS idContador,
  GROUP_CONCAT(DISTINCT cont.NumeroSerie ORDER BY cont.Id SEPARATOR ', ') AS numeroSerieContador,
  GROUP_CONCAT(DISTINCT cont.Marca ORDER BY cont.Id SEPARATOR ', ') AS marcaContador,
  GROUP_CONCAT(DISTINCT cont.Modelo ORDER BY cont.Id SEPARATOR ', ') AS modeloContador,
  
  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,
  v.Foto AS foto,

    CONCAT(
        cli.Nombre,
        IFNULL(CONCAT(' ', cli.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', cli.ApellidoMaterno), '')
    ) AS nombreCompletoCliente

FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores cont ON ic.IdContador = cont.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes cli ON i.IdCliente = cli.Id
INNER JOIN Posiciones up ON d.NumeroSerie = up.NumeroSerieValidador

WHERE up.FechaHora >= ?
AND up.FechaHora <= ?
AND up.NumeroSerieValidador = ?
AND i.Estatus = 1
AND d.Estatus = 1
${Number(rol) !== 1 ? 'AND cli.Id IN (?)' : ''}
${
  Number(rol) === 3
    ? `AND EXISTS (
  SELECT 1
  FROM Turnos t
  INNER JOIN Viajes vi ON vi.IdTurno = t.Id AND vi.Estatus = 1
  INNER JOIN Variantes va ON va.Id = vi.IdVariante
  INNER JOIN Rutas ru ON ru.Id = va.IdRuta
  INNER JOIN UsuariosZonas uz
    ON uz.IdZona = ru.IdZona AND uz.IdUsuario = ? AND uz.Estatus = 1
  WHERE t.IdInstalacion = i.Id
)`
    : ''
}

GROUP BY up.Id, up.Exactitud, up.Estado, up.Velocidad, up.Direccion, 
         up.Latitud, up.Longitud, up.FechaHora, up.FHRegistro, up.NumeroSerieValidador,
         d.Id, d.NumeroSerie, d.Marca, d.Modelo,
         i.IdVehiculo, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico, v.Foto,
         cli.Nombre, cli.ApellidoPaterno, cli.ApellidoMaterno

ORDER BY up.FechaHora ASC
      `,
        (() => {
          const params: Array<string | number> = [
            fechaInicio,
            fechaFin,
            NumeroSerieValidador,
          ];
          if (Number(rol) !== 1) params.push(cliente);
          if (Number(rol) === 3) params.push(idUser);
          return params;
        })(),
      );
      const posicion = recorridoMonitoreo.map((item) => ({
        ...item,
        id: Number(item.id),
        idDispositivo: Number(item.idDispositivo),
        idContador: Number(item.idContador),
        idVehiculo: Number(item.idVehiculo),
      }));

      // Transformación de resultados
      const _result: ApiResponseCommon = {
        data: posicion,
      };

      return { posicion };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Error al obtener el recorrido del dispositivo',
      );
    }
  }

  // ========================================
  // 🔹 OBTENER UNIDADES DE MONITOREO
  // ========================================
  async obtenerUnidades(cliente: number, rol = 0, idUser = 0) {
    try {
      const { ids, placeholders } = await this.clienteHijos(cliente);

      // Consulta para obtener la última posición de cada validador y datos relacionados
      const query = `
SELECT
  -- Vehículo
  v.Id AS idVehiculo,
  v.Placa AS placa,
  v.Modelo AS modelo,
  
  -- Última posición
  p.Id AS idPosicion,
  p.Latitud AS latitud,
  p.Longitud AS longitud,
  p.Velocidad AS velocidad,
  p.FechaHora AS fechaHora,
  p.Estado AS estado,
  
  -- Validador
  val.NumeroSerie AS numeroSerieValidador,
  
  -- Operador/Conductor (del turno activo más reciente)
  CONCAT(
    IFNULL(u.Nombre, ''),
    IFNULL(CONCAT(' ', u.ApellidoPaterno), ''),
    IFNULL(CONCAT(' ', u.ApellidoMaterno), '')
  ) AS conductor,
  
  -- Instalación
  i.Id AS idInstalacion,
  
  -- Turno activo
  t_activo.Id AS idTurno,
  t_activo.Estatus AS turnoEstatus,
  t_activo.Inicio AS turnoInicio,
  t_activo.Fin AS turnoFin,
  
  -- Viaje activo
  viaje.Id AS idViaje,
  viaje.Estatus AS viajeEstatus,
  viaje.Inicio AS viajeInicio,
  viaje.Fin AS viajeFin,
  
  -- Variante del viaje
  var.Id AS idVariante,
  var.Nombre AS nombreVariante,
  
  -- Sumatorias de ConteoPasajeros por idViaje
  COALESCE(SUM(cp.Entradas), 0) AS sumSubidas,
  COALESCE(SUM(cp.Salidas), 0) AS sumBajadas,
  COALESCE(SUM(cp.Entradas), 0) - COALESCE(SUM(cp.Salidas), 0) AS diferencia

FROM Instalaciones i
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Validadores val ON i.IdValidador = val.Id AND i.IdCliente = val.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

-- Última posición del validador usando la vista UltimaPosicion
INNER JOIN UltimaPosicion p ON val.NumeroSerie = p.NumeroSerieValidador

-- Turno activo más reciente (estatus = 1)
LEFT JOIN (
  SELECT 
    t1.Id,
    t1.IdInstalacion,
    t1.IdOperador,
    t1.Estatus,
    t1.Inicio,
    t1.Fin
  FROM Turnos t1
  WHERE t1.Estatus = 1
    AND t1.Fin IS NULL
    AND t1.Inicio = (
      SELECT MAX(t2.Inicio)
      FROM Turnos t2
      WHERE t2.IdInstalacion = t1.IdInstalacion
        AND t2.Estatus = 1
        AND t2.Fin IS NULL
    )
) t_activo ON i.Id = t_activo.IdInstalacion

-- Viaje activo del turno (si existe)
LEFT JOIN (
  SELECT 
    v1.Id,
    v1.IdTurno,
    v1.IdVariante,
    v1.Estatus,
    v1.Inicio,
    v1.Fin
  FROM Viajes v1
  WHERE v1.Estatus = 1
    AND v1.Fin IS NULL
    AND v1.Inicio = (
      SELECT MAX(v2.Inicio)
      FROM Viajes v2
      WHERE v2.IdTurno = v1.IdTurno
        AND v2.Estatus = 1
        AND v2.Fin IS NULL
    )
) viaje ON t_activo.Id = viaje.IdTurno

-- Variante del viaje
LEFT JOIN Variantes var ON viaje.IdVariante = var.Id

-- Operador del turno
LEFT JOIN Operadores o ON t_activo.IdOperador = o.Id
LEFT JOIN Usuarios u ON o.IdUsuario = u.Id

-- Conteo de pasajeros por viaje
LEFT JOIN ConteoPasajeros cp ON viaje.Id = cp.IdViaje AND cp.Estatus = 1

WHERE c.Id IN (${placeholders})
  AND i.Estatus = 1
  AND v.Estatus = 1
  AND val.Estatus = 1
${
  Number(rol) === 3
    ? `AND EXISTS (
  SELECT 1
  FROM Turnos t
  INNER JOIN Viajes vi ON vi.IdTurno = t.Id AND vi.Estatus = 1
  INNER JOIN Variantes va ON va.Id = vi.IdVariante
  INNER JOIN Rutas ru ON ru.Id = va.IdRuta
  INNER JOIN UsuariosZonas uz
    ON uz.IdZona = ru.IdZona AND uz.IdUsuario = ? AND uz.Estatus = 1
  WHERE t.IdInstalacion = i.Id
)`
    : ''
}

GROUP BY 
  v.Id, v.Placa, v.Modelo,
  p.Id, p.Latitud, p.Longitud, p.Velocidad, p.FechaHora, p.Estado,
  val.NumeroSerie,
  u.Nombre, u.ApellidoPaterno, u.ApellidoMaterno,
  i.Id,
  t_activo.Id, t_activo.Estatus, t_activo.Inicio, t_activo.Fin,
  viaje.Id, viaje.Estatus, viaje.Inicio, viaje.Fin,
  var.Id, var.Nombre

ORDER BY v.Id ASC, p.FechaHora DESC;
      `;

      const params = [...(ids ?? [])];
      if (Number(rol) === 3) params.push(idUser);
      const resultados = await this.clienteRepository.query(query, params);

      // Eliminar duplicados por vehículo, tomando la instalación con la posición más reciente
      const unidadesUnicas = new Map<number, any>();
      resultados.forEach((item: any) => {
        const idVehiculo = Number(item.idVehiculo);
        const fechaHora = item.fechaHora
          ? new Date(item.fechaHora).getTime()
          : 0;

        if (!unidadesUnicas.has(idVehiculo)) {
          unidadesUnicas.set(idVehiculo, item);
        } else {
          const existente = unidadesUnicas.get(idVehiculo);
          const fechaHoraExistente = existente.fechaHora
            ? new Date(existente.fechaHora).getTime()
            : 0;

          // Si la nueva posición es más reciente, reemplazar
          if (fechaHora > fechaHoraExistente) {
            unidadesUnicas.set(idVehiculo, item);
          }
        }
      });

      // Formatear la respuesta según la estructura UnidadMapa
      const unidades = Array.from(unidadesUnicas.values()).map((item) => {
        // Formatear fechaHora a formato HH:mm
        const fechaHora = item.fechaHora ? new Date(item.fechaHora) : null;
        const ultimoPing = fechaHora
          ? `${String(fechaHora.getUTCHours()).padStart(2, '0')}:${String(fechaHora.getUTCMinutes()).padStart(2, '0')}`
          : null;

        // Determinar estado basado en turno, viaje y posición
        let estado = 'pausa'; // Por defecto
        const tieneTurno = item.idTurno && item.turnoEstatus === 1;
        const tieneViaje = item.idViaje && item.viajeEstatus === 1;

        if (tieneViaje) {
          // Si está en viaje, está en ruta
          estado = 'ruta';
        } else if (tieneTurno) {
          // Si tiene turno pero no viaje, está en pausa
          estado = 'pausa';
        } else {
          // Si no tiene turno, está disponible o fuera de servicio
          estado = 'pausa';
        }

        // Formatear velocidad
        const velocidad = item.velocidad
          ? `${Math.round(item.velocidad)} km/h`
          : '0 km/h';

        const unidad: any = {
          id: Number(item.idVehiculo),
          codigo: item.placa || `U-${String(item.idVehiculo).padStart(3, '0')}`,
          modelo: item.modelo || '',
          conductor: item.conductor || 'Sin asignar',
          ultimoPing: ultimoPing || '--:--',
          velocidad: velocidad,
          estado: estado,
          posicion: {
            lat: Number(item.latitud) || 0,
            lng: Number(item.longitud) || 0,
          },
          numeroSerieValidador: item.numeroSerieValidador || null,
          // Información de turno, viaje y variante
          idInstalacion: item.idInstalacion ? Number(item.idInstalacion) : null,
          idTurno: item.idTurno ? Number(item.idTurno) : null,
          turnoEstatus: item.turnoEstatus ? Number(item.turnoEstatus) : null,
          turnoInicio: item.turnoInicio || null,
          turnoFin: item.turnoFin || null,
          idViaje: item.idViaje ? Number(item.idViaje) : null,
          viajeEstatus: item.viajeEstatus ? Number(item.viajeEstatus) : null,
          viajeInicio: item.viajeInicio || null,
          viajeFin: item.viajeFin || null,
          idVariante: item.idVariante ? Number(item.idVariante) : null,
          nombreVariante: item.nombreVariante || null,
          sumSubidas: item.sumSubidas ? Number(item.sumSubidas) : 0,
          sumBajadas: item.sumBajadas ? Number(item.sumBajadas) : 0,
          diferencia: item.diferencia ? Number(item.diferencia) : 0,
        };

        return unidad;
      });

      const result: ApiResponseCommon = {
        data: unidades,
      };

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error al obtener las unidades de monitoreo.',
      );
    }
  }

  /**
   * Obtiene los datos completos de una unidad por numeroSerieValidador
   * Retorna el mismo formato que obtenerUnidades pero para una unidad específica
   */
  async obtenerUnidadPorValidador(
    numeroSerieValidador: string,
    idCliente: number,
  ): Promise<any | null> {
    try {
      const { ids, placeholders } = await this.clienteHijos(idCliente);

      // Consulta similar a obtenerUnidades pero filtrada por validador específico
      const query = `
SELECT
  -- Vehículo
  v.Id AS idVehiculo,
  v.Placa AS placa,
  v.Modelo AS modelo,
  
  -- Última posición
  p.Id AS idPosicion,
  p.Latitud AS latitud,
  p.Longitud AS longitud,
  p.Velocidad AS velocidad,
  p.FechaHora AS fechaHora,
  p.Estado AS estado,
  
  -- Validador
  val.NumeroSerie AS numeroSerieValidador,
  
  -- Operador/Conductor (del turno activo más reciente)
  CONCAT(
    IFNULL(u.Nombre, ''),
    IFNULL(CONCAT(' ', u.ApellidoPaterno), ''),
    IFNULL(CONCAT(' ', u.ApellidoMaterno), '')
  ) AS conductor,
  
  -- Instalación
  i.Id AS idInstalacion,
  
  -- Turno activo
  t_activo.Id AS idTurno,
  t_activo.Estatus AS turnoEstatus,
  t_activo.Inicio AS turnoInicio,
  t_activo.Fin AS turnoFin,
  
  -- Viaje activo
  viaje.Id AS idViaje,
  viaje.Estatus AS viajeEstatus,
  viaje.Inicio AS viajeInicio,
  viaje.Fin AS viajeFin,
  
  -- Variante del viaje
  var.Id AS idVariante,
  var.Nombre AS nombreVariante,
  
  -- Sumatorias de ConteoPasajeros por idViaje
  COALESCE(SUM(cp.Entradas), 0) AS sumSubidas,
  COALESCE(SUM(cp.Salidas), 0) AS sumBajadas,
  COALESCE(SUM(cp.Entradas), 0) - COALESCE(SUM(cp.Salidas), 0) AS diferencia

FROM Instalaciones i
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Validadores val ON i.IdValidador = val.Id AND i.IdCliente = val.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

-- Última posición del validador usando la vista UltimaPosicion
INNER JOIN UltimaPosicion p ON val.NumeroSerie = p.NumeroSerieValidador

-- Turno activo más reciente (estatus = 1)
LEFT JOIN (
  SELECT 
    t1.Id,
    t1.IdInstalacion,
    t1.IdOperador,
    t1.Estatus,
    t1.Inicio,
    t1.Fin
  FROM Turnos t1
  WHERE t1.Estatus = 1
    AND t1.Fin IS NULL
    AND t1.Inicio = (
      SELECT MAX(t2.Inicio)
      FROM Turnos t2
      WHERE t2.IdInstalacion = t1.IdInstalacion
        AND t2.Estatus = 1
        AND t2.Fin IS NULL
    )
) t_activo ON i.Id = t_activo.IdInstalacion

-- Viaje activo del turno (si existe)
LEFT JOIN (
  SELECT 
    v1.Id,
    v1.IdTurno,
    v1.IdVariante,
    v1.Estatus,
    v1.Inicio,
    v1.Fin
  FROM Viajes v1
  WHERE v1.Estatus = 1
    AND v1.Fin IS NULL
    AND v1.Inicio = (
      SELECT MAX(v2.Inicio)
      FROM Viajes v2
      WHERE v2.IdTurno = v1.IdTurno
        AND v2.Estatus = 1
        AND v2.Fin IS NULL
    )
) viaje ON t_activo.Id = viaje.IdTurno

-- Variante del viaje
LEFT JOIN Variantes var ON viaje.IdVariante = var.Id

-- Operador del turno
LEFT JOIN Operadores o ON t_activo.IdOperador = o.Id
LEFT JOIN Usuarios u ON o.IdUsuario = u.Id

-- Conteo de pasajeros por viaje
LEFT JOIN ConteoPasajeros cp ON viaje.Id = cp.IdViaje AND cp.Estatus = 1

WHERE c.Id IN (${placeholders})
  AND i.Estatus = 1
  AND v.Estatus = 1
  AND val.Estatus = 1
  AND val.NumeroSerie = ?

GROUP BY 
  v.Id, v.Placa, v.Modelo,
  p.Id, p.Latitud, p.Longitud, p.Velocidad, p.FechaHora, p.Estado,
  val.NumeroSerie,
  u.Nombre, u.ApellidoPaterno, u.ApellidoMaterno,
  i.Id,
  t_activo.Id, t_activo.Estatus, t_activo.Inicio, t_activo.Fin,
  viaje.Id, viaje.Estatus, viaje.Inicio, viaje.Fin,
  var.Id, var.Nombre

ORDER BY p.FechaHora DESC
LIMIT 1;
      `;

      const resultados = await this.clienteRepository.query(query, [
        ...ids,
        numeroSerieValidador,
      ]);

      if (!resultados || resultados.length === 0) {
        return null;
      }

      const item = resultados[0];

      // Formatear fechaHora a formato HH:mm
      const fechaHora = item.fechaHora ? new Date(item.fechaHora) : null;
      const ultimoPing = fechaHora
        ? `${String(fechaHora.getUTCHours()).padStart(2, '0')}:${String(fechaHora.getUTCMinutes()).padStart(2, '0')}`
        : null;

      // Determinar estado basado en turno, viaje y posición
      let estado = 'pausa'; // Por defecto
      const tieneTurno = item.idTurno && item.turnoEstatus === 1;
      const tieneViaje = item.idViaje && item.viajeEstatus === 1;

      if (tieneViaje) {
        estado = 'ruta';
      } else if (tieneTurno) {
        estado = 'pausa';
      } else {
        estado = 'pausa';
      }

      // Formatear velocidad
      const velocidad = item.velocidad
        ? `${Math.round(item.velocidad)} km/h`
        : '0 km/h';

      const unidad: any = {
        id: Number(item.idVehiculo),
        codigo: item.placa || `U-${String(item.idVehiculo).padStart(3, '0')}`,
        modelo: item.modelo || '',
        conductor: item.conductor || 'Sin asignar',
        ultimoPing: ultimoPing || '--:--',
        velocidad: velocidad,
        estado: estado,
        posicion: {
          lat: Number(item.latitud) || 0,
          lng: Number(item.longitud) || 0,
        },
        numeroSerieValidador: item.numeroSerieValidador || null,
        // Información de turno, viaje y variante
        idInstalacion: item.idInstalacion ? Number(item.idInstalacion) : null,
        idTurno: item.idTurno ? Number(item.idTurno) : null,
        turnoEstatus: item.turnoEstatus ? Number(item.turnoEstatus) : null,
        turnoInicio: item.turnoInicio || null,
        turnoFin: item.turnoFin || null,
        idViaje: item.idViaje ? Number(item.idViaje) : null,
        viajeEstatus: item.viajeEstatus ? Number(item.viajeEstatus) : null,
        viajeInicio: item.viajeInicio || null,
        viajeFin: item.viajeFin || null,
        idVariante: item.idVariante ? Number(item.idVariante) : null,
        nombreVariante: item.nombreVariante || null,
        sumSubidas: item.sumSubidas ? Number(item.sumSubidas) : 0,
        sumBajadas: item.sumBajadas ? Number(item.sumBajadas) : 0,
        diferencia: item.diferencia ? Number(item.diferencia) : 0,
      };

      return unidad;
    } catch (error) {
      this.logger.error('Error al obtener unidad por validador');
      return null;
    }
  }
}
