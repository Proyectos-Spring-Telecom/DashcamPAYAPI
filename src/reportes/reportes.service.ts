import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Clientes } from 'src/entities/Clientes';
import { RecaudacionDiariaRutaDto } from './dto/recaudacion-diaria-ruta.dto';
import { RecaudacionPorOperadorDto } from './dto/recaudacion-por-operador.dto';
import { RecaudacionPorVehiculoDto } from './dto/recaudacion-por-vehiculo.dto';
import { RecaudacionPorDispositivoDto } from './dto/recaudacion-por-dispositivo.dto';
import { TransaccionesDebitoDto } from './dto/transacciones-debito.dto';
import { ApiResponseCommon } from 'src/common/ApiResponse';

@Injectable()
export class ReportesService {
  constructor(
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
  ) {}

  private async clienteHijos(cliente: number) {
    const clientesFiltrado = await this.clienteRepository.query(
      `CALL spGetClientes(?);`,
      [cliente],
    );

    const idsFiltrados = clientesFiltrado[0];
    const ids = idsFiltrados
      .map((clientesFiltrado: any) => Number(clientesFiltrado.Id))
      .filter(Boolean);

    // Asegurar que el cliente mismo esté incluido en la lista
    if (!ids.includes(cliente)) {
      ids.unshift(cliente);
    }

    if (ids.length === 0) {
      return { ids: [], placeholders: '' };
    }

    const placeholders = ids.map(() => '?').join(', ');
    return { ids, placeholders };
  }

  async recaudacionDiariaPorRuta(
    filtros: RecaudacionDiariaRutaDto,
    cliente: number,
  ): Promise<ApiResponseCommon> {
    try {
      // Si idCliente es null o undefined, usar el cliente del usuario autenticado y sus hijos
      // Si idCliente tiene valor, usar ese cliente y sus hijos
      const clienteFiltro =
        filtros.idCliente !== null && filtros.idCliente !== undefined
          ? filtros.idCliente
          : cliente;

      // Obtener jerarquía de clientes (cliente y sus hijos)
      const { ids: clienteIds, placeholders } =
        await this.clienteHijos(clienteFiltro);

      if (clienteIds.length === 0) {
        return {
          data: [],
        };
      }

      // Construir condiciones WHERE para transacciones
      const condiciones: string[] = [];
      const parametros: any[] = [];

      // Filtro de clientes a través de Monederos
      condiciones.push(`m.IdCliente IN (${placeholders})`);
      parametros.push(...clienteIds);

      // Filtro de fecha - SOLO EN TRANSACCIONES
      if (filtros.fechaInicio) {
        const fechaInicio = filtros.fechaInicio.split('T')[0];
        condiciones.push(`DATE(td.FHRegistro) >= ?`);
        parametros.push(fechaInicio);
      }
      if (filtros.fechaFin) {
        const fechaFin = filtros.fechaFin.split('T')[0];
        condiciones.push(`DATE(td.FHRegistro) <= ?`);
        parametros.push(fechaFin);
      }

      // Filtro de ruta
      if (filtros.idRuta) {
        condiciones.push(`r.Id = ?`);
        parametros.push(filtros.idRuta);
      }

      // Filtro de variante
      if (filtros.idVariante) {
        condiciones.push(`d.Id = ?`);
        parametros.push(filtros.idVariante);
      }

      const whereClause =
        condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

      const query = `
SELECT
    DATE(td.FHRegistro) AS fecha,
    reg.Id AS idRegion,
    reg.Nombre AS nombreRegion,
    r.Id AS idRuta,
    r.Nombre AS nombreRuta,
    d.Id AS idVariante,
    d.Nombre AS nombreVariante,
    COUNT(DISTINCT v.Id) AS viajes,
    COUNT(DISTINCT td.Id) AS validaciones,
    COALESCE(SUM(td.Monto), 0) AS ingresos,
    CASE 
        WHEN COUNT(DISTINCT td.Id) > 0 
        THEN COALESCE(SUM(td.Monto), 0) / COUNT(DISTINCT td.Id)
        ELSE 0 
    END AS ticketPromedio,
    CASE 
        WHEN COUNT(DISTINCT td.Id) > 0
        THEN (COUNT(DISTINCT CASE WHEN td.ControlTransaccion = 1 THEN td.Id END) * 100.0) / COUNT(DISTINCT td.Id)
        ELSE 0
    END AS porcentajeElectronico,
    COALESCE(SUM(vc.Diferencia), 0) AS ascensos,
    GREATEST(COALESCE(SUM(vc.Diferencia), 0) - COUNT(DISTINCT td.Id), 0) AS evasionAbsoluta,
    CASE 
        WHEN COALESCE(SUM(vc.Diferencia), 0) > 0
        THEN (GREATEST(COALESCE(SUM(vc.Diferencia), 0) - COUNT(DISTINCT td.Id), 0) * 100.0) / COALESCE(SUM(vc.Diferencia), 0)
        ELSE 0
    END AS evasionPorcentual
FROM TransaccionesDebito td
INNER JOIN Monederos m ON td.NumeroSerieMonedero = m.NumeroSerie
INNER JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN Viajes v ON td.IdViaje = v.Id
LEFT JOIN Variantes d ON v.IdVariante = d.Id
LEFT JOIN Rutas r ON d.IdRuta = r.Id
LEFT JOIN Zonas reg ON r.IdZona = reg.Id
LEFT JOIN ViajesConteos vc_rel ON vc_rel.IdViaje = v.Id
LEFT JOIN ConteoPasajeros vc ON vc_rel.IdConteo = vc.Id
${whereClause}
GROUP BY DATE(td.FHRegistro), reg.Id, reg.Nombre, r.Id, r.Nombre, d.Id, d.Nombre
HAVING COUNT(DISTINCT td.Id) > 0
ORDER BY DATE(td.FHRegistro) DESC, reg.Nombre, r.Nombre, d.Nombre;
      `;

      const resultados = await this.clienteRepository.query(query, parametros);

      // Formatear resultados
      const data = resultados.map((row: any) => ({
        fecha: row.fecha || null,
        idRegion: row.idRegion ? Number(row.idRegion) : null,
        nombreRegion: row.nombreRegion || null,
        idRuta: row.idRuta ? Number(row.idRuta) : null,
        nombreRuta: row.nombreRuta || null,
        idVariante: row.idVariante ? Number(row.idVariante) : null,
        nombreVariante: row.nombreVariante || null,
        viajes: row.viajes ? Number(row.viajes) : 0,
        validaciones: row.validaciones ? Number(row.validaciones) : 0,
        ingresos: row.ingresos
          ? Number(parseFloat(String(row.ingresos)).toFixed(2))
          : 0,
        ticketPromedio: row.ticketPromedio
          ? Number(parseFloat(String(row.ticketPromedio)).toFixed(2))
          : 0,
        porcentajeElectronico: row.porcentajeElectronico
          ? Number(parseFloat(String(row.porcentajeElectronico)).toFixed(2))
          : 0,
        ascensos: row.ascensos ? Number(row.ascensos) : 0,
        evasionAbsoluta:
          row.evasionAbsoluta !== null && row.evasionAbsoluta !== undefined
            ? Number(row.evasionAbsoluta)
            : 0,
        evasionPorcentual: row.evasionPorcentual
          ? Number(parseFloat(String(row.evasionPorcentual)).toFixed(2))
          : 0,
      }));

      return {
        data,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al generar el reporte de recaudación diaria por ruta',
        error: error.message,
        stack: error.stack,
      });
    }
  }

  async recaudacionPorOperador(
    filtros: RecaudacionPorOperadorDto,
    cliente: number,
  ): Promise<ApiResponseCommon> {
    let query: string = '';
    let parametrosCompletos: any[] = [];

    try {
      // Si idCliente es null o undefined, usar el cliente del usuario autenticado y sus hijos
      // Si idCliente tiene valor, usar ese cliente y sus hijos
      const clienteFiltro =
        filtros.idCliente !== null && filtros.idCliente !== undefined
          ? filtros.idCliente
          : cliente;

      // Obtener jerarquía de clientes (cliente y sus hijos)
      const { ids: clienteIds, placeholders } =
        await this.clienteHijos(clienteFiltro);

      if (clienteIds.length === 0) {
        return {
          data: [],
        };
      }

      // Preparar filtros de fecha - SOLO PARA TRANSACCIONES
      const fechaInicio = filtros.fechaInicio
        ? filtros.fechaInicio.split('T')[0]
        : null;
      const fechaFin = filtros.fechaFin ? filtros.fechaFin.split('T')[0] : null;

      // Construir la lista de IDs de clientes como string para usar en subconsultas
      const clienteIdsStr = clienteIds.join(',');

      // Consulta: empezar desde transacciones y agrupar por operador
      // Las subconsultas de turnos y viajes NO tienen filtro de fecha
      query = `
SELECT
    datos.idOperador,
    datos.operador,
    licencias_data.licencia,
    COALESCE(turnos_data.totalTurnos, 0) AS turnos,
    COALESCE(viajes_data.totalViajes, 0) AS viajes,
    datos.validaciones,
    datos.ingresos,
    datos.ticketPromedio,
    datos.evasionPorcentual,
    turnos_data.ultimoTurno AS ultimoTurno
FROM (
    SELECT
        COALESCE(o.Id, 0) AS idOperador,
        CASE 
            WHEN o.Id IS NOT NULL AND u.Nombre IS NOT NULL
            THEN CONCAT(
                u.Nombre,
                ' ',
                COALESCE(u.ApellidoPaterno, ''),
                IFNULL(CONCAT(' ', u.ApellidoMaterno), '')
            )
            ELSE 'Sin operador asignado'
        END AS operador,
        COUNT(DISTINCT td.Id) AS validaciones,
        COALESCE(SUM(td.Monto), 0) AS ingresos,
        CASE 
            WHEN COUNT(DISTINCT td.Id) > 0 
            THEN COALESCE(SUM(td.Monto), 0) / COUNT(DISTINCT td.Id)
            ELSE 0 
        END AS ticketPromedio,
        CASE 
            WHEN COALESCE(SUM(vc.Diferencia), 0) > 0
            THEN (GREATEST(COALESCE(SUM(vc.Diferencia), 0) - COUNT(DISTINCT td.Id), 0) * 100.0) / COALESCE(SUM(vc.Diferencia), 0)
            ELSE 0
        END AS evasionPorcentual
    FROM TransaccionesDebito td
    INNER JOIN Monederos m ON td.NumeroSerieMonedero = m.NumeroSerie
    INNER JOIN Clientes c ON m.IdCliente = c.Id
    LEFT JOIN Viajes v ON td.IdViaje = v.Id
    LEFT JOIN Operadores o ON v.IdOperador = o.Id
    LEFT JOIN Usuarios u ON o.IdUsuario = u.Id
    LEFT JOIN ViajesConteos vc_rel ON vc_rel.IdViaje = v.Id
    LEFT JOIN ConteoPasajeros vc ON vc_rel.IdConteo = vc.Id
    WHERE c.Id IN (${placeholders})
    ${fechaInicio ? `AND DATE(td.FHRegistro) >= ?` : ''}
    ${fechaFin ? `AND DATE(td.FHRegistro) <= ?` : ''}
    ${filtros.idOperador ? 'AND (o.Id = ? OR o.Id IS NULL)' : ''}
    GROUP BY o.Id, u.Nombre, u.ApellidoPaterno, u.ApellidoMaterno
) AS datos
LEFT JOIN (
    SELECT 
        l.IdOperador AS IdOperador,
        GROUP_CONCAT(DISTINCT l.NumeroLicencia SEPARATOR ', ') AS licencia
    FROM Licencias l
    GROUP BY l.IdOperador
) AS licencias_data ON licencias_data.IdOperador = datos.idOperador AND datos.idOperador > 0
LEFT JOIN (
    SELECT 
        t.IdOperador AS IdOperador,
        COUNT(DISTINCT t.Id) AS totalTurnos,
        MAX(t.Inicio) AS ultimoTurno
    FROM Turnos t
    WHERE t.IdCliente IN (${clienteIdsStr})
    GROUP BY t.IdOperador
) AS turnos_data ON turnos_data.IdOperador = datos.idOperador AND datos.idOperador > 0
LEFT JOIN (
    SELECT 
        v2.IdOperador AS IdOperador,
        COUNT(DISTINCT v2.Id) AS totalViajes
    FROM Viajes v2
    WHERE v2.IdCliente IN (${clienteIdsStr})
    GROUP BY v2.IdOperador
) AS viajes_data ON viajes_data.IdOperador = datos.idOperador AND datos.idOperador > 0
ORDER BY datos.ingresos DESC, datos.operador ASC;
      `;

      // Construir parámetros para la consulta principal
      // Orden: clienteIds (para datos), fechas WHERE principal (solo transacciones), idOperador
      parametrosCompletos = [...clienteIds];

      // Parámetros de fecha para el WHERE principal (solo transacciones)
      if (fechaInicio) {
        parametrosCompletos.push(fechaInicio);
      }
      if (fechaFin) {
        parametrosCompletos.push(fechaFin);
      }

      // Parámetro de operador si existe
      if (filtros.idOperador) {
        parametrosCompletos.push(filtros.idOperador);
      }

      const resultados = await this.clienteRepository.query(
        query,
        parametrosCompletos,
      );

      // Formatear resultados
      const data = resultados.map((row: any) => {
        const idOperador = Number(row.idOperador);
        return {
          idOperador: idOperador === 0 ? null : idOperador,
          operador: row.operador || 'Sin operador asignado',
          licencia: row.licencia || null,
          turnos: Number(row.turnos) || 0,
          viajes: Number(row.viajes) || 0,
          validaciones: Number(row.validaciones) || 0,
          ingresos: Number(parseFloat(String(row.ingresos)).toFixed(2)) || 0,
          ticketPromedio:
            Number(parseFloat(String(row.ticketPromedio)).toFixed(2)) || 0,
          evasionPorcentual:
            Number(parseFloat(String(row.evasionPorcentual)).toFixed(2)) || 0,
          ultimoTurno: row.ultimoTurno || null,
        };
      });

      return {
        data,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error en recaudacionPorOperador:', error);
      console.error('Query:', query);
      console.error('Parámetros:', parametrosCompletos);
      throw new InternalServerErrorException({
        message: 'Error al generar el reporte de recaudación por operador',
        error: error.message,
        stack: error.stack,
      });
    }
  }

  async recaudacionPorVehiculo(
    filtros: RecaudacionPorVehiculoDto,
    cliente: number,
  ): Promise<ApiResponseCommon> {
    try {
      // Si idCliente es null o undefined, usar el cliente del usuario autenticado y sus hijos
      // Si idCliente tiene valor, usar ese cliente y sus hijos
      const clienteFiltro =
        filtros.idCliente !== null && filtros.idCliente !== undefined
          ? filtros.idCliente
          : cliente;

      // Obtener jerarquía de clientes (cliente y sus hijos)
      const { ids: clienteIds, placeholders } =
        await this.clienteHijos(clienteFiltro);

      if (clienteIds.length === 0) {
        return {
          data: [],
        };
      }

      // Preparar filtros de fecha - SOLO PARA TRANSACCIONES
      const fechaInicio = filtros.fechaInicio
        ? filtros.fechaInicio.split('T')[0]
        : null;
      const fechaFin = filtros.fechaFin ? filtros.fechaFin.split('T')[0] : null;

      // Consulta principal: empezar desde transacciones y agrupar por vehículo
      // Las subconsultas de turnos y viajes NO tienen filtro de fecha
      const query = `
SELECT
    datos.idVehiculo,
    datos.numeroEconomico,
    datos.placa,
    datos.marca,
    datos.modelo,
    datos.ano,
    COALESCE(turnos_data.totalTurnos, 0) AS turnos,
    COALESCE(viajes_data.totalViajes, 0) AS viajes,
    datos.validaciones,
    datos.ingresos,
    datos.ticketPromedio,
    COALESCE(turnos_data.horasServicio, 0) AS horasServicio
FROM (
    SELECT
        veh.Id AS idVehiculo,
        veh.NumeroEconomico AS numeroEconomico,
        veh.Placa AS placa,
        veh.Marca AS marca,
        veh.Modelo AS modelo,
        veh.Ano AS ano,
        COUNT(DISTINCT td.Id) AS validaciones,
        COALESCE(SUM(td.Monto), 0) AS ingresos,
        CASE 
            WHEN COUNT(DISTINCT td.Id) > 0 
            THEN COALESCE(SUM(td.Monto), 0) / COUNT(DISTINCT td.Id)
            ELSE 0 
        END AS ticketPromedio
    FROM TransaccionesDebito td
    INNER JOIN Monederos m ON td.NumeroSerieMonedero = m.NumeroSerie
    INNER JOIN Clientes c ON m.IdCliente = c.Id
    LEFT JOIN Viajes v ON td.IdViaje = v.Id
    LEFT JOIN Turnos t ON v.IdTurno = t.Id
    LEFT JOIN Instalaciones ins ON t.IdInstalacion = ins.Id
    LEFT JOIN Vehiculos veh ON ins.IdVehiculo = veh.Id
    LEFT JOIN Variantes d ON v.IdVariante = d.Id
    LEFT JOIN Rutas r ON d.IdRuta = r.Id
    WHERE c.Id IN (${placeholders})
    ${fechaInicio ? `AND DATE(td.FHRegistro) >= ?` : ''}
    ${fechaFin ? `AND DATE(td.FHRegistro) <= ?` : ''}
    ${filtros.idVehiculo ? 'AND veh.Id = ?' : ''}
    ${filtros.idRuta ? 'AND r.Id = ?' : ''}
    GROUP BY veh.Id, veh.NumeroEconomico, veh.Placa, veh.Marca, veh.Modelo, veh.Ano
) AS datos
LEFT JOIN (
    SELECT 
        veh2.Id AS IdVehiculo,
        COUNT(DISTINCT t2.Id) AS totalTurnos,
        COALESCE(SUM(
            CASE 
                WHEN t2.Fin IS NOT NULL 
                THEN TIMESTAMPDIFF(HOUR, t2.Inicio, t2.Fin)
                ELSE 0
            END
        ), 0) AS horasServicio
    FROM Vehiculos veh2
    INNER JOIN Instalaciones ins2 ON ins2.IdVehiculo = veh2.Id
    INNER JOIN Turnos t2 ON t2.IdInstalacion = ins2.Id
    GROUP BY veh2.Id
) AS turnos_data ON turnos_data.IdVehiculo = datos.idVehiculo
LEFT JOIN (
    SELECT 
        veh3.Id AS IdVehiculo,
        COUNT(DISTINCT v3.Id) AS totalViajes
    FROM Vehiculos veh3
    INNER JOIN Instalaciones ins3 ON ins3.IdVehiculo = veh3.Id
    INNER JOIN Turnos t3 ON t3.IdInstalacion = ins3.Id
    INNER JOIN Viajes v3 ON v3.IdTurno = t3.Id
    GROUP BY veh3.Id
) AS viajes_data ON viajes_data.IdVehiculo = datos.idVehiculo
ORDER BY datos.ingresos DESC, datos.numeroEconomico ASC;
      `;

      // Construir parámetros para la consulta principal
      // Orden: clienteIds, fechas (solo transacciones), idVehiculo, idRuta
      const parametrosCompletos = [...clienteIds];

      // Parámetros de fecha (solo para transacciones)
      if (fechaInicio) {
        parametrosCompletos.push(fechaInicio);
      }
      if (fechaFin) {
        parametrosCompletos.push(fechaFin);
      }

      // Parámetro de vehículo si existe
      if (filtros.idVehiculo) {
        parametrosCompletos.push(filtros.idVehiculo);
      }

      // Parámetro de ruta si existe
      if (filtros.idRuta) {
        parametrosCompletos.push(filtros.idRuta);
      }

      const resultados = await this.clienteRepository.query(
        query,
        parametrosCompletos,
      );

      // Formatear resultados
      const data = resultados.map((row: any) => ({
        idVehiculo: row.idVehiculo ? Number(row.idVehiculo) : null,
        numeroEconomico: row.numeroEconomico || null,
        placa: row.placa || null,
        marca: row.marca || null,
        modelo: row.modelo || null,
        ano: row.ano ? Number(row.ano) : null,
        marcaModeloAno:
          `${row.marca || ''} ${row.modelo || ''} ${row.ano || ''}`.trim(),
        turnos: Number(row.turnos) || 0,
        viajes: Number(row.viajes) || 0,
        validaciones: Number(row.validaciones) || 0,
        ingresos: Number(parseFloat(String(row.ingresos)).toFixed(2)) || 0,
        ticketPromedio:
          Number(parseFloat(String(row.ticketPromedio)).toFixed(2)) || 0,
        horasServicio:
          Number(parseFloat(String(row.horasServicio)).toFixed(2)) || 0,
      }));

      return {
        data,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al generar el reporte de recaudación por vehículo',
        error: error.message,
        stack: error.stack,
      });
    }
  }

  async recaudacionPorDispositivo(
    filtros: RecaudacionPorDispositivoDto,
    cliente: number,
  ): Promise<ApiResponseCommon> {
    try {
      // Si idCliente es null o undefined, usar el cliente del usuario autenticado y sus hijos
      // Si idCliente tiene valor, usar ese cliente y sus hijos
      const clienteFiltro =
        filtros.idCliente !== null && filtros.idCliente !== undefined
          ? filtros.idCliente
          : cliente;

      // Obtener jerarquía de clientes (cliente y sus hijos)
      const { ids: clienteIds, placeholders } =
        await this.clienteHijos(clienteFiltro);

      if (clienteIds.length === 0) {
        return {
          data: [],
        };
      }

      // Preparar filtros de fecha - SOLO PARA TRANSACCIONES
      const fechaInicio = filtros.fechaInicio
        ? filtros.fechaInicio.split('T')[0]
        : null;
      const fechaFin = filtros.fechaFin ? filtros.fechaFin.split('T')[0] : null;

      // Consulta principal: empezar desde transacciones y agrupar por instalación/dispositivo
      const query = `
SELECT
    datos.idInstalacion,
    datos.serieDispositivo,
    datos.serieContador,
    datos.numeroEconomico,
    datos.placa,
    datos.vehiculo,
    datos.validaciones,
    datos.ingresos,
    datos.estadoDispositivo,
    pos.latitud AS ultimaPosicionLatitud,
    pos.longitud AS ultimaPosicionLongitud,
    pos.fechaHora AS ultimaPosicionFecha
FROM (
    SELECT
        ins.Id AS idInstalacion,
        disp.NumeroSerie AS serieDispositivo,
        GROUP_CONCAT(DISTINCT cont.NumeroSerie SEPARATOR ', ') AS serieContador,
        veh.NumeroEconomico AS numeroEconomico,
        veh.Placa AS placa,
        CONCAT(veh.NumeroEconomico, ' - ', veh.Placa) AS vehiculo,
        COUNT(DISTINCT td.Id) AS validaciones,
        COALESCE(SUM(td.Monto), 0) AS ingresos,
        disp.EstadoActual AS estadoDispositivo
    FROM TransaccionesDebito td
    INNER JOIN Monederos m ON td.NumeroSerieMonedero = m.NumeroSerie
    INNER JOIN Clientes cli ON m.IdCliente = cli.Id
    LEFT JOIN Viajes v ON td.IdViaje = v.Id
    LEFT JOIN Turnos t ON v.IdTurno = t.Id
    LEFT JOIN Instalaciones ins ON t.IdInstalacion = ins.Id
    LEFT JOIN Validadores disp ON ins.IdValidador = disp.Id AND ins.IdCliente = disp.IdCliente
    LEFT JOIN InstalacionContadores ic ON ic.IdInstalacion = ins.Id AND ic.Estatus = 1
    LEFT JOIN Contadores cont ON ic.IdContador = cont.Id
    LEFT JOIN Vehiculos veh ON ins.IdVehiculo = veh.Id AND ins.IdCliente = veh.IdCliente
    WHERE ins.IdCliente IN (${placeholders})
    ${fechaInicio ? `AND DATE(td.FHRegistro) >= ?` : ''}
    ${fechaFin ? `AND DATE(td.FHRegistro) <= ?` : ''}
    ${filtros.idValidador ? 'AND disp.Id = ?' : ''}
    ${filtros.idInstalacion ? 'AND ins.Id = ?' : ''}
    GROUP BY ins.Id, disp.NumeroSerie, veh.NumeroEconomico, veh.Placa, disp.EstadoActual
) AS datos
LEFT JOIN (
    SELECT 
        p1.NumeroSerieValidador,
        p1.Latitud,
        p1.Longitud,
        p1.FechaHora
    FROM Posiciones p1
    INNER JOIN (
        SELECT 
            NumeroSerieValidador,
            MAX(FechaHora) AS MaxFechaHora
        FROM Posiciones
        GROUP BY NumeroSerieValidador
    ) p2 ON p1.NumeroSerieValidador = p2.NumeroSerieValidador 
        AND p1.FechaHora = p2.MaxFechaHora
) AS pos ON pos.NumeroSerieValidador = datos.serieDispositivo
ORDER BY datos.ingresos DESC, datos.serieDispositivo ASC;
      `;

      // Construir parámetros para la consulta principal
      // Orden: clienteIds (para ins.IdCliente), fechas (solo transacciones), idDispositivo, idInstalacion
      const parametrosCompletos = [...clienteIds];

      // Parámetros de fecha (solo para transacciones)
      if (fechaInicio) {
        parametrosCompletos.push(fechaInicio);
      }
      if (fechaFin) {
        parametrosCompletos.push(fechaFin);
      }

      // Parámetro de dispositivo si existe
      if (filtros.idValidador) {
        parametrosCompletos.push(filtros.idValidador);
      }

      // Parámetro de instalación si existe
      if (filtros.idInstalacion) {
        parametrosCompletos.push(filtros.idInstalacion);
      }

      const resultados = await this.clienteRepository.query(
        query,
        parametrosCompletos,
      );

      // Formatear resultados
      const data = resultados.map((row: any) => ({
        idInstalacion: row.idInstalacion ? Number(row.idInstalacion) : null,
        serieDispositivo: row.serieDispositivo || null,
        serieContador: row.serieContador || null,
        numeroEconomico: row.numeroEconomico || null,
        placa: row.placa || null,
        vehiculo: row.vehiculo || null,
        validaciones: Number(row.validaciones) || 0,
        ingresos: Number(parseFloat(String(row.ingresos)).toFixed(2)) || 0,
        estadoDispositivo:
          row.estadoDispositivo !== null ? Number(row.estadoDispositivo) : null,
        ultimaPosicion:
          row.ultimaPosicionLatitud && row.ultimaPosicionLongitud
            ? {
                latitud: Number(
                  parseFloat(String(row.ultimaPosicionLatitud)).toFixed(7),
                ),
                longitud: Number(
                  parseFloat(String(row.ultimaPosicionLongitud)).toFixed(7),
                ),
                fecha: row.ultimaPosicionFecha || null,
              }
            : null,
      }));

      return {
        data,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al generar el reporte de recaudación por dispositivo',
        error: error.message,
        stack: error.stack,
      });
    }
  }

  async transaccionesDebito(
    filtros: TransaccionesDebitoDto,
    cliente: number,
    rol: number,
    idUser?: number,
  ): Promise<ApiResponseCommon> {
    try {
      let query: string = '';
      let parametrosCompletos: any[] = [];

      // Convertir rol a número
      const rolNumero = Number(rol);

      // Si idCliente es null o undefined, usar el cliente del usuario autenticado y sus hijos
      // Si idCliente tiene valor, usar ese cliente y sus hijos
      const clienteFiltro =
        filtros.idCliente !== null && filtros.idCliente !== undefined
          ? filtros.idCliente
          : cliente;

      // Preparar filtros de fecha
      const fechaInicio = filtros.fechaInicio
        ? filtros.fechaInicio.split('T')[0]
        : null;
      const fechaFin = filtros.fechaFin ? filtros.fechaFin.split('T')[0] : null;

      // Construir condiciones WHERE
      const condiciones: string[] = [];
      const parametros: any[] = [];

      switch (rolNumero) {
        case 1:
          // SuperAdministrador - puede ver todo
          // No agregar filtro de cliente
          break;

        case 9:
          // Pasajero - solo sus propias transacciones
          if (!idUser) {
            return { data: [] };
          }
          // Obtener el pasajero asociado al usuario
          const pasajeroByUser = await this.clienteRepository.query(
            `SELECT Id FROM Pasajeros WHERE IdUsuario = ?`,
            [idUser],
          );

          if (!pasajeroByUser || pasajeroByUser.length === 0) {
            return { data: [] };
          }

          const idPasajero = pasajeroByUser[0].Id;
          condiciones.push(`m.IdPasajero = ?`);
          parametros.push(idPasajero);
          break;

        case 2:
        case 8:
        case 10:
        default:
          // Administrador, Reportes, Capturista y otros - usar clienteHijos
          const { ids: clienteIds, placeholders } =
            await this.clienteHijos(clienteFiltro);

          if (clienteIds.length === 0) {
            return { data: [] };
          }

          condiciones.push(`m.IdCliente IN (${placeholders})`);
          parametros.push(...clienteIds);
          break;
      }

      // Filtro de fecha
      if (fechaInicio) {
        condiciones.push(`DATE(td.FHRegistro) >= ?`);
        parametros.push(fechaInicio);
      }
      if (fechaFin) {
        condiciones.push(`DATE(td.FHRegistro) <= ?`);
        parametros.push(fechaFin);
      }

      // Filtro de zona
      if (filtros.idZona) {
        condiciones.push(`z.Id = ?`);
        parametros.push(filtros.idZona);
      }

      // Filtro de ruta
      if (filtros.idRuta) {
        condiciones.push(`r.Id = ?`);
        parametros.push(filtros.idRuta);
      }

      // Filtro de variante
      if (filtros.idVariante) {
        condiciones.push(`v.IdVariante = ?`);
        parametros.push(filtros.idVariante);
      }

      const whereClause =
        condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

      query = `
SELECT
    td.Id AS id,
    td.FechaHoraFinal AS fechaHora,
    td.Monto AS monto,
    td.NumeroSerieMonedero AS numeroSerieMonedero,
    td.NumeroSerieValidador AS numeroSerieValidador,
    td.LatitudFinal AS latitud,
    td.LongitudFinal AS longitud,
    r.Nombre AS nombreRuta,
    v.Id AS numeroViaje,
    t.Id AS numeroTurno
FROM TransaccionesDebito td
INNER JOIN Monederos m ON td.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Viajes v ON td.IdViaje = v.Id
LEFT JOIN Variantes var ON v.IdVariante = var.Id
LEFT JOIN Rutas r ON var.IdRuta = r.Id
LEFT JOIN Zonas z ON r.IdZona = z.Id
LEFT JOIN Turnos t ON v.IdTurno = t.Id
${whereClause}
ORDER BY td.FechaHoraFinal DESC, td.Id DESC;
      `;

      parametrosCompletos = [...parametros];

      const resultados = await this.clienteRepository.query(
        query,
        parametrosCompletos,
      );

      // Formatear resultados
      const data = resultados.map((row: any) => ({
        id: row.id ? Number(row.id) : null,
        fechaHora: row.fechaHora || null,
        monto: row.monto ? Number(parseFloat(String(row.monto)).toFixed(2)) : 0,
        numeroSerieMonedero: row.numeroSerieMonedero || null,
        numeroSerieValidador: row.numeroSerieValidador || null,
        latitud: row.latitud
          ? Number(parseFloat(String(row.latitud)).toFixed(7))
          : null,
        longitud: row.longitud
          ? Number(parseFloat(String(row.longitud)).toFixed(7))
          : null,
        nombreRuta: row.nombreRuta || null,
        numeroViaje: row.numeroViaje ? Number(row.numeroViaje) : null,
        numeroTurno: row.numeroTurno ? Number(row.numeroTurno) : null,
      }));

      return {
        data,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al generar el reporte de transacciones débito',
        error: error.message,
        stack: error.stack,
      });
    }
  }
}
