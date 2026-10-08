import { nowDb } from 'src/common/clock';
import { clienteHijosDesdeSp } from 'src/common/tenant/ownership-resolvers';
import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  assertDateWindow,
  assertIsoDate,
  dateTimeBounds,
} from 'src/common/sql-date';
import { KpiDto } from './dto/kpi.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Clientes } from 'src/entities/Clientes';
import { TransaccionesDebito } from 'src/entities/TransaccionesDebito';
import { Viajes } from 'src/entities/Viajes';
import { Validadores } from 'src/entities/Validadores';
import { Monederos } from 'src/entities/Monederos';
import { Rutas } from 'src/entities/Rutas';
import { Variantes } from 'src/entities/Variantes';
import { CatTiposPasajeros } from 'src/entities/CatTiposPasajeros';
import { HistoricoTransaccionesDebito } from 'src/entities/HistoricoTransaccionesDebito';
import { ConteoPasajeros } from 'src/entities/ConteoPasajeros';
import { Repository } from 'typeorm';
import { EnumFiltros } from 'src/common/estatus.enum';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    @InjectRepository(TransaccionesDebito)
    private readonly transaccionesDebitoRepository: Repository<TransaccionesDebito>,
    @InjectRepository(Viajes)
    private readonly viajesRepository: Repository<Viajes>,
    @InjectRepository(Validadores)
    private readonly validadoresRepository: Repository<Validadores>,
    @InjectRepository(Monederos)
    private readonly monederosRepository: Repository<Monederos>,
    @InjectRepository(Rutas)
    private readonly rutasRepository: Repository<Rutas>,
    @InjectRepository(Variantes)
    private readonly variantesRepository: Repository<Variantes>,
    @InjectRepository(CatTiposPasajeros)
    private readonly catTiposPasajerosRepository: Repository<CatTiposPasajeros>,
    @InjectRepository(HistoricoTransaccionesDebito)
    private readonly historicoTransaccionesDebitoRepository: Repository<HistoricoTransaccionesDebito>,
    @InjectRepository(ConteoPasajeros)
    private readonly conteoPasajerosRepository: Repository<ConteoPasajeros>,
  ) {}

  private async assertClienteEnAlcance(
    rol: number,
    clienteToken: number,
    idCliente: number,
  ) {
    if (Number(rol) === 1) return;
    if (Number(idCliente) === Number(clienteToken)) return;
    const result = await this.clienteHijos(clienteToken);
    const ids: number[] = Array.isArray(result.ids) ? result.ids : [];
    if (!ids.includes(Number(idCliente))) {
      throw new NotFoundException('Cliente no encontrado');
    }
  }

  //funcion para obtener los clientes hijos
  private async clienteHijos(cliente: number) {
    return clienteHijosDesdeSp(this.clienteRepository.manager, cliente);
  }
  // ========================================
  // 🔹 OBTENER DASHBOARD
  // ========================================
  async dashboardkpi(kpiDto: KpiDto, rol: number, cliente: number) {
    try {
      const { fechaInicio, fechaFin, filtro, idCliente } = kpiDto;
      await this.assertClienteEnAlcance(rol, cliente, Number(idCliente));
      let data;
      if (fechaInicio && fechaFin) {
        data = await this.resolverPorFecha(
          fechaInicio,
          fechaFin,
          idCliente,
          cliente,
          rol,
        );
      } else {
        const { fechaIni, fechaFinal } = await this.resolverPorFiltro(
          filtro || 1,
        );
        data = await this.resolverPorRol(
          fechaIni,
          fechaFinal,
          idCliente,
          cliente,
          rol,
        );
      }
      const {
        graficaIngresosTotales,
        graficaPasajerosPorRuta,
        graficaAscensosVsBoleto,
        dataGripTop5RutasPorIngresos,
        velocidadPromedioRuta,
      } = data;

      //Forzamos a cambiar el id a number
      const graficaIngresos = graficaIngresosTotales.map((item) => ({
        ...item,
        id: Number(item.id),
        validaciones_exitosas: Number(item.validaciones_exitosas),
        validaciones_fallidas: Number(item.validaciones_fallidas),
      }));

      const graficaPasajerosPorRutas = graficaPasajerosPorRuta.map((item) => ({
        ...item,
        idRuta: Number(item.idRuta),
        pasajeros: Number(item.pasajeros),
      }));

      const graficaAscensoBoleto = graficaAscensosVsBoleto.map((item) => ({
        ...item,
        ascensos: Number(item.ascensos),
        boletos: Number(item.boletos),
      }));

      const velocidadPromedioPorRuta = velocidadPromedioRuta.map((item) => ({
        ...item,
        idRuta: Number(item.idRuta),
      }));

      const dataGripTop5RutasPorIngreso = dataGripTop5RutasPorIngresos.map(
        (item) => ({
          ...item,
          idRuta: Number(item.idRuta),
          totalViajes: Number(item.totalViajes),
        }),
      );

      const kpi1 = data.kpi1?.[0] ?? {};
      const kpi2 = data.kpi2?.[0] ?? {};

      return {
        ingresosAlDia: Number(kpi1.ingresosDelDia ?? 0),
        totalMovimientos: Number(kpi1.totalIntentos ?? 0),
        pasajerosValidados: Number(kpi1.pasajerosValidados ?? 0),
        totalMonederosUnicos: Number(kpi1.monederosActivos ?? 0),
        ticketPromedio: Number(kpi1.ticketPromedio ?? 0),
        pasajerosAfiliados: Number(kpi1.monederosConPasajero ?? 0),
        validacionesExitosas: Number(kpi1.validacionesExitosas ?? 0),
        validacionesFallidas: Number(kpi1.validacionesFallidas ?? 0),

        // KPI 2
        unidadesEnServicio: Number(kpi2.unidadesEnServicio ?? 0),
        totalUnidades: Number(kpi2.totalUnidades ?? 0),
        cumplimientoTurnos: Number(kpi2.cumplimientoTurnosPorcentaje ?? 0),
        totalTurnos: Number(kpi2.totalTurnos ?? 0),
        totalTurnosCerrado: Number(kpi2.turnosCerrados ?? 0),
        ocupacionPromedio: Number(kpi2.ocupacionPromedioTotal ?? 0),
        capacidadTeorica: Number(kpi2.capacidadTotalTeorica ?? 0),

        graficaIngresos,
        graficaPasajerosPorRutas,
        graficaAscensoBoleto,
        velocidadPromedioPorRuta,
        dataGripTop5RutasPorIngreso,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Ocurrió un error al intentar obtener datos del kpi.`,
      });
    }
  }

  async resolverPorFecha(
    fechaInicio: string,
    fechaFin: string,
    idCliente: number,
    cliente: number,
    rol: number,
  ) {
    try {
      fechaInicio = assertIsoDate(fechaInicio.split('T')[0], 'fechaInicio');
      fechaFin = assertIsoDate(fechaFin.split('T')[0], 'fechaFin');
      assertDateWindow(fechaInicio, fechaFin);
      return await this.resolverPorRol(
        fechaInicio,
        fechaFin,
        idCliente,
        cliente,
        rol,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Ocurrió un error al intentar obtener datos del kpi.`,
      });
    }
  }

  async resolverPorFiltro(filtro: number): Promise<any> {
    try {
      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }
      const fechaDesfasada = nowDb();
      // Solo la fecha del momento
      const fechaActual = `${fechaDesfasada.getUTCFullYear()}-${pad(fechaDesfasada.getUTCMonth() + 1)}-${pad(fechaDesfasada.getUTCDate())}`;
      let fechaIni;
      let fechaFinal;
      switch (filtro) {
        case EnumFiltros.MES:
          // Restar 1 mes
          const fechaHaceUnMes = new Date(fechaDesfasada);
          fechaHaceUnMes.setUTCMonth(fechaHaceUnMes.getUTCMonth() - 1);

          // Solo fecha YYYY-MM-DD
          const fechaMesAntes = `${fechaHaceUnMes.getUTCFullYear()}-${pad(fechaHaceUnMes.getUTCMonth() + 1)}-${pad(fechaHaceUnMes.getUTCDate())}`;

          //Retornamos las fechas correspondientes
          fechaIni = fechaMesAntes;
          fechaFinal = fechaActual;
          break;
        case EnumFiltros.SEMANA:
          // Restar 7 días (7 * 24 * 60 * 60 * 1000 ms)
          const hace7Dias = new Date(
            fechaDesfasada.getTime() - 7 * 24 * 60 * 60 * 1000,
          );

          // Solo la fecha
          const fechaSemanaAntes = `${hace7Dias.getUTCFullYear()}-${pad(hace7Dias.getUTCMonth() + 1)}-${pad(hace7Dias.getUTCDate())}`;

          //Retornamos las fechas correspondientes
          fechaIni = fechaSemanaAntes;
          fechaFinal = fechaActual;
          break;

        default:
          //Retornamos las fechas correspondientes
          fechaIni = fechaActual;
          fechaFinal = fechaActual;
          break;
      }
      return { fechaIni, fechaFinal };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Ocurrió un error al intentar obtener las fechas del filtro para datos del kpi.`,
      });
    }
  }

  async resolverPorRol(
    fechaInicio: string,
    fechaFin: string,
    idCliente: number,
    cliente: number,
    rol: number,
  ) {
    try {
      let kpi1;
      let kpi2;
      let graficaIngresosTotales;
      let graficaPasajerosPorRuta;
      let graficaAscensosVsBoleto;
      let dataGripTop5RutasPorIngresos;
      let velocidadPromedioRuta;
      switch (rol) {
        case 1:
          if (idCliente === cliente) {
            kpi1 = await this.kpiParte1ClientePadre(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            kpi2 = await this.kpiParte2ClientePadre(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            graficaIngresosTotales = await this.graficaIngresosTotalesSA(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            graficaPasajerosPorRuta = await this.graficaPasajerosPorRutaSA(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            graficaAscensosVsBoleto = await this.graficaAscensosVsBoletoSA(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            velocidadPromedioRuta = await this.velocidadPromedioRutaSA(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            dataGripTop5RutasPorIngresos =
              await this.dataGripTop5RutasPorIngresosSA(
                fechaInicio,
                fechaFin,
                idCliente,
              );
          } else {
            kpi1 = await this.kpiParte1(fechaInicio, fechaFin, idCliente);
            kpi2 = await this.kpi2Parte2(fechaInicio, fechaFin, idCliente);
            graficaIngresosTotales = await this.graficaIngresosTotales(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            graficaPasajerosPorRuta = await this.graficaPasajerosPorRuta(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            graficaAscensosVsBoleto = await this.graficaAscensosVsBoleto(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            velocidadPromedioRuta = await this.velocidadPromedioRuta(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            dataGripTop5RutasPorIngresos =
              await this.dataGripTop5RutasPorIngresos(
                fechaInicio,
                fechaFin,
                idCliente,
              );
          }

          break;
        case 2:
          if (idCliente === cliente) {
            kpi1 = await this.kpiParte1ClientePadre(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            kpi2 = await this.kpiParte2ClientePadre(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            graficaIngresosTotales = await this.graficaIngresosTotalesSA(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            graficaPasajerosPorRuta = await this.graficaPasajerosPorRutaSA(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            graficaAscensosVsBoleto = await this.graficaAscensosVsBoletoSA(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            velocidadPromedioRuta = await this.velocidadPromedioRutaSA(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            dataGripTop5RutasPorIngresos =
              await this.dataGripTop5RutasPorIngresosSA(
                fechaInicio,
                fechaFin,
                idCliente,
              );
          } else {
            kpi1 = await this.kpiParte1(fechaInicio, fechaFin, idCliente);
            kpi2 = await this.kpi2Parte2(fechaInicio, fechaFin, idCliente);
            graficaIngresosTotales = await this.graficaIngresosTotales(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            graficaPasajerosPorRuta = await this.graficaPasajerosPorRuta(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            graficaAscensosVsBoleto = await this.graficaAscensosVsBoleto(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            velocidadPromedioRuta = await this.velocidadPromedioRuta(
              fechaInicio,
              fechaFin,
              idCliente,
            );
            dataGripTop5RutasPorIngresos =
              await this.dataGripTop5RutasPorIngresos(
                fechaInicio,
                fechaFin,
                idCliente,
              );
          }
          break;

        case 3:
        default:
          kpi1 = await this.kpiParte1(fechaInicio, fechaFin, idCliente);
          kpi2 = await this.kpi2Parte2(fechaInicio, fechaFin, idCliente);
          graficaIngresosTotales = await this.graficaIngresosTotales(
            fechaInicio,
            fechaFin,
            idCliente,
          );
          graficaPasajerosPorRuta = await this.graficaPasajerosPorRuta(
            fechaInicio,
            fechaFin,
            idCliente,
          );
          graficaAscensosVsBoleto = await this.graficaAscensosVsBoleto(
            fechaInicio,
            fechaFin,
            idCliente,
          );
          velocidadPromedioRuta = await this.velocidadPromedioRuta(
            fechaInicio,
            fechaFin,
            idCliente,
          );
          dataGripTop5RutasPorIngresos =
            await this.dataGripTop5RutasPorIngresos(
              fechaInicio,
              fechaFin,
              idCliente,
            );
          break;
      }
      return {
        kpi1,
        kpi2,
        graficaIngresosTotales,
        graficaPasajerosPorRuta,
        graficaAscensosVsBoleto,
        dataGripTop5RutasPorIngresos,
        velocidadPromedioRuta,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // Solo código y mensaje del driver (sin parámetros).
      this.logger.error(
        `dashboardkpi: ${error?.code ?? ''} ${error?.sqlMessage ?? error?.message ?? ''}`,
      );
      throw new InternalServerErrorException({
        message: `Ocurrió un error al intentar obtener datos por rol del kpi.`,
      });
    }
  }

  private async kpiParte1ClientePadre(
    fechaInicio: string,
    fechaFin: string,
    idCliente: number,
  ) {
    const { ids, placeholders } = await this.clienteHijos(idCliente);
    const query = `
    -- kpi parte 1 para usuarios super administrador y administrador
SELECT
    IFNULL(SUM(CASE WHEN td.IdTipoTransaccion = 2 THEN td.Monto ELSE 0 END), 0) AS ingresosDelDia,
    COUNT(DISTINCT CASE WHEN td.IdTipoTransaccion = 2 THEN td.NumeroSerieMonedero END) AS pasajerosValidados,
    ROUND(
        IFNULL(
            SUM(CASE WHEN td.IdTipoTransaccion = 2 THEN td.Monto ELSE 0 END) /
            NULLIF(COUNT(DISTINCT CASE WHEN td.IdTipoTransaccion = 2 THEN td.NumeroSerieMonedero END), 0),
        0), 2) AS ticketPromedio,
    SUM(CASE WHEN td.IdTipoTransaccion = 2 THEN 1 ELSE 0 END) AS validacionesExitosas,
    SUM(CASE WHEN td.IdTipoTransaccion = 3 THEN 1 ELSE 0 END) AS validacionesFallidas,
    COUNT(*) AS totalIntentos,
    ROUND(SUM(CASE WHEN td.IdTipoTransaccion = 2 THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0) * 100, 2) AS porcentajeExitosas,
    ROUND(SUM(CASE WHEN td.IdTipoTransaccion = 3 THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0) * 100, 2) AS porcentajeFallidas,
    (
        SELECT COUNT(*)
        FROM Monederos m
        WHERE m.IdCliente = c.Id
          AND m.Estatus = 1
          AND m.FechaCreacion <= ?
    ) AS monederosActivos,
     (
    SELECT COUNT(*)
    FROM Monederos m
    WHERE m.IdCliente = c.Id
      AND m.Estatus = 1
      AND m.FechaCreacion <= ?
      AND m.IdPasajero IS NOT NULL
) AS monederosConPasajero
FROM HistoricoTransaccionesDebito td
INNER JOIN Validadores d ON td.NumeroSerieValidador = d.NumeroSerie
INNER JOIN Clientes c ON d.IdCliente = c.Id
WHERE td.FechaHoraFinal BETWEEN ? AND ?
  AND c.Id IN (${placeholders})
  GROUP BY c.Id;`;
    const { fromZ, toZ } = dateTimeBounds(fechaInicio, fechaFin);
    return this.clienteRepository.query(query, [toZ, toZ, fromZ, toZ, ...ids]);
  }

  private async kpiParte2ClientePadre(
    fechaInicio: string,
    fechaFin: string,
    idCliente: number,
  ) {
    const { ids, placeholders } = await this.clienteHijos(idCliente);
    const query = `
    -- Kpi parte 2
WITH Ocupacion AS (
    SELECT
        t.IdCliente,
        v.Id AS idVehiculo,
        ROUND(
            SUM(cp.Entradas)
            / NULLIF((v.PasajerosSentados + v.PasajerosParados), 0) * 100,
            2
        ) AS ocupacionPromedio
    FROM Turnos t
    INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
    INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
    INNER JOIN Viajes vi ON vi.IdTurno = t.Id
    INNER JOIN ConteoPasajeros cp ON cp.IdViaje = vi.Id
    WHERE v.Estatus = 1
      AND cp.FechaHora >= ?
      AND cp.FechaHora < ?
    GROUP BY t.IdCliente, v.Id
)
SELECT
    COUNT(DISTINCT v.Id) AS totalUnidades,

    COUNT(DISTINCT CASE
        WHEN up.Id IS NOT NULL AND t.Id IS NOT NULL THEN v.Id
    END) AS unidadesEnServicio,

    ROUND(
        COUNT(DISTINCT CASE
            WHEN up.Id IS NOT NULL AND t.Id IS NOT NULL THEN v.Id
        END) / NULLIF(COUNT(DISTINCT v.Id), 0) * 100,
        2
    ) AS porcentajeEnServicio,
	COUNT(DISTINCT t.Id) AS totalTurnos,
    COUNT(DISTINCT CASE WHEN t.Fin IS NOT NULL THEN t.Id END) AS turnosCerrados,
    ROUND(
        COUNT(DISTINCT CASE
            WHEN t.Fin IS NOT NULL THEN t.Id END)
        /
        NULLIF(
            COUNT(DISTINCT t.Id),
            0
        ) * 100,
        2
    ) AS cumplimientoTurnosPorcentaje,

    ROUND(AVG(o.ocupacionPromedio), 2) AS ocupacionPromedioTotal,
    ROUND(AVG(v.PasajerosSentados + v.PasajerosParados)) AS capacidadTotalTeorica

FROM Vehiculos v
LEFT JOIN Instalaciones i ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente AND i.Estatus = 1
LEFT JOIN Validadores d ON d.Id = i.idValidador
LEFT JOIN Posiciones up ON up.NumeroSerieValidador = d.NumeroSerie

    AND up.FechaHora >= NOW() - INTERVAL 15 MINUTE
LEFT JOIN Turnos t ON t.IdCliente = v.IdCliente
    AND t.Inicio >= ?
    AND t.Inicio < ?
LEFT JOIN Ocupacion o ON o.IdCliente = v.IdCliente AND o.idVehiculo = v.Id
WHERE v.Estatus = 1
  AND v.IdCliente IN (${placeholders});
`;
    const { fromZ, toZ } = dateTimeBounds(fechaInicio, fechaFin);
    return this.clienteRepository.query(query, [fromZ, toZ, fromZ, toZ, ...ids]);
  }

  /////////*/*/*/*/*/*//*//////////////////////////////////////////******/////*/*/*/*/*/*/*/*/*/*/*/*/*/*/*//*/*/**/***/*/****
  private async kpiParte1(
    fechaInicio: string,
    fechaFin: string,
    idCliente: number,
  ) {
    const query = `
    -- kpi parte 1
SELECT
    IFNULL(SUM(CASE WHEN td.IdTipoTransaccion = 2 THEN td.Monto ELSE 0 END), 0) AS ingresosDelDia,
    COUNT(DISTINCT CASE WHEN td.IdTipoTransaccion = 2 THEN td.NumeroSerieMonedero END) AS pasajerosValidados,
    ROUND(
        IFNULL(
            SUM(CASE WHEN td.IdTipoTransaccion = 2 THEN td.Monto ELSE 0 END) /
            NULLIF(COUNT(DISTINCT CASE WHEN td.IdTipoTransaccion = 2 THEN td.NumeroSerieMonedero END), 0),
        0), 2) AS ticketPromedio,
    SUM(CASE WHEN td.IdTipoTransaccion = 2 THEN 1 ELSE 0 END) AS validacionesExitosas,
    SUM(CASE WHEN td.IdTipoTransaccion = 3 THEN 1 ELSE 0 END) AS validacionesFallidas,
    COUNT(*) AS totalIntentos,
    ROUND(SUM(CASE WHEN td.IdTipoTransaccion = 2 THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0) * 100, 2) AS porcentajeExitosas,
    ROUND(SUM(CASE WHEN td.IdTipoTransaccion = 3 THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0) * 100, 2) AS porcentajeFallidas,
    (
        SELECT COUNT(*)
        FROM Monederos m
        WHERE m.IdCliente = c.Id
          AND m.Estatus = 1
          AND m.FechaCreacion <= ?
    ) AS monederosActivos,
     (
    SELECT COUNT(*)
    FROM Monederos m
    WHERE m.IdCliente = c.Id
      AND m.Estatus = 1
      AND m.FechaCreacion <= ?
      AND m.IdPasajero IS NOT NULL
) AS monederosConPasajero
FROM HistoricoTransaccionesDebito td
INNER JOIN Validadores d ON td.NumeroSerieValidador = d.NumeroSerie
INNER JOIN Clientes c ON d.IdCliente = c.Id
WHERE td.FechaHoraFinal BETWEEN ? AND ?
  AND c.Id IN (?)
  
  GROUP BY c.Id;
`;
    const { fromZ, toZ } = dateTimeBounds(fechaInicio, fechaFin);
    return this.clienteRepository.query(query, [
      toZ,
      toZ,
      fromZ,
      toZ,
      Number(idCliente),
    ]);
  }

  private async kpi2Parte2(
    fechaInicio: string,
    fechaFin: string,
    idCliente: number,
  ) {
    const query = `

    -- Kpi parte 2
WITH Ocupacion AS (
    SELECT
        t.IdCliente,
        v.Id AS idVehiculo,
        ROUND(
            SUM(cp.Entradas)
            / NULLIF((v.PasajerosSentados + v.PasajerosParados), 0) * 100,
            2
        ) AS ocupacionPromedio
    FROM Turnos t
    INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
    INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
    INNER JOIN Viajes vi ON vi.IdTurno = t.Id
    INNER JOIN ConteoPasajeros cp ON cp.IdViaje = vi.Id
    WHERE v.Estatus = 1
      AND cp.FechaHora >= ?
      AND cp.FechaHora < ?
    GROUP BY t.IdCliente, v.Id
)
SELECT
    COUNT(DISTINCT v.Id) AS totalUnidades,

    COUNT(DISTINCT CASE
        WHEN up.Id IS NOT NULL AND t.Id IS NOT NULL THEN v.Id
    END) AS unidadesEnServicio,

    ROUND(
        COUNT(DISTINCT CASE
            WHEN up.Id IS NOT NULL AND t.Id IS NOT NULL THEN v.Id
        END) / NULLIF(COUNT(DISTINCT v.Id), 0) * 100,
        2
    ) AS porcentajeEnServicio,
	COUNT(DISTINCT t.Id) AS totalTurnos,
    COUNT(DISTINCT CASE WHEN t.Fin IS NOT NULL THEN t.Id END) AS turnosCerrados,
    ROUND(
        COUNT(DISTINCT CASE
            WHEN t.Fin IS NOT NULL THEN t.Id END)
        /
        NULLIF(
            COUNT(DISTINCT t.Id),
            0
        ) * 100,
        2
    ) AS cumplimientoTurnosPorcentaje,

    ROUND(AVG(o.ocupacionPromedio), 2) AS ocupacionPromedioTotal,
    ROUND(AVG(v.PasajerosSentados + v.PasajerosParados)) AS capacidadTotalTeorica

FROM Vehiculos v
LEFT JOIN Instalaciones i ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente AND i.Estatus = 1
LEFT JOIN Validadores d ON d.Id = i.idValidador
LEFT JOIN Posiciones up ON up.NumeroSerieValidador = d.NumeroSerie

    AND up.FechaHora >= NOW() - INTERVAL 15 MINUTE
LEFT JOIN Turnos t ON t.IdCliente = v.IdCliente
    AND t.Inicio >= ?
    AND t.Inicio < ?
LEFT JOIN Ocupacion o ON o.IdCliente = v.IdCliente AND o.idVehiculo = v.Id
WHERE v.Estatus = 1
  AND v.IdCliente IN (?);
`;
    const { fromZ, toZ } = dateTimeBounds(fechaInicio, fechaFin);
    return this.clienteRepository.query(query, [
      fromZ,
      toZ,
      fromZ,
      toZ,
      Number(idCliente),
    ]);
  }

  /////////*/*/*/*/*/*//*//////////////////////////////////////////******/////*/*/*/*/*/*/*/*/*/*/*/*/*/*/*//*/*/**/***/*/****

  private async graficaIngresosTotales(
    fechaInicio: string,
    fechaFin: string,
    idCliente: number,
  ) {
    const query = `
WITH rango AS (
    SELECT DATEDIFF(?, ?) AS dias
),
datos AS (
    SELECT 
        /* PERIODO DINÁMICO */
        CASE 
            WHEN dias = 0 THEN DATE_FORMAT(td.FechaHoraFinal, '%Y-%m-%d %H:00')     -- Por hora
            WHEN dias <= 15 THEN DATE(td.FechaHoraFinal)                            -- Por día
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(td.FechaHoraFinal, '%Y-%m'),
                                        ' Semana ', WEEK(td.FechaHoraFinal, 1))     -- Por semana
            ELSE DATE_FORMAT(td.FechaHoraFinal, '%Y-%m')                            -- Por mes
        END AS periodo,

        SUM(CASE WHEN td.IdTipoTransaccion = 2 THEN td.Monto ELSE 0 END) AS ingresos,
        COUNT(CASE WHEN td.IdTipoTransaccion = 2 THEN 1 END) AS validaciones_exitosas,
        COUNT(CASE WHEN td.IdTipoTransaccion = 3 THEN 1 END) AS validaciones_fallidas,

        ROUND(
            IFNULL(
                SUM(CASE WHEN td.IdTipoTransaccion = 2 THEN td.Monto ELSE 0 END) /
                NULLIF(COUNT(DISTINCT CASE WHEN td.IdTipoTransaccion = 2 THEN td.NumeroSerieMonedero END), 0)
            , 0), 2
        ) AS ticket_promedio,

        ROUND(
            SUM(CASE WHEN td.IdTipoTransaccion = 2 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100,
            2
        ) AS porcentaje_exitosas,

        ROUND(
            SUM(CASE WHEN td.IdTipoTransaccion = 3 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100,
            2
        ) AS porcentaje_fallidas

    FROM HistoricoTransaccionesDebito td
    INNER JOIN Validadores d ON td.NumeroSerieValidador = d.NumeroSerie
    INNER JOIN Clientes c ON d.IdCliente = c.Id
    CROSS JOIN rango
    WHERE td.FechaHoraFinal BETWEEN ? AND ?
      AND c.Id IN (?)

    GROUP BY 
        CASE 
            WHEN dias = 0 THEN DATE_FORMAT(td.FechaHoraFinal, '%Y-%m-%d %H:00')
            WHEN dias <= 15 THEN DATE(td.FechaHoraFinal)
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(td.FechaHoraFinal, '%Y-%m'),
                                        ' Semana ', WEEK(td.FechaHoraFinal, 1))
            ELSE DATE_FORMAT(td.FechaHoraFinal, '%Y-%m')
        END
)
SELECT 
    ROW_NUMBER() OVER (ORDER BY periodo) AS id,
    periodo,
    ingresos,
    validaciones_exitosas,
    validaciones_fallidas,
    ticket_promedio,
    porcentaje_exitosas,
    porcentaje_fallidas
FROM datos
ORDER BY periodo;

`;
    const { fromZ, toZ } = dateTimeBounds(fechaInicio, fechaFin);
    return this.clienteRepository.query(query, [
      toZ,
      fromZ,
      fromZ,
      toZ,
      Number(idCliente),
    ]);
  }

  private async graficaIngresosTotalesSA(
    fechaInicio: string,
    fechaFin: string,
    idCliente: number,
  ) {
    const { ids, placeholders } = await this.clienteHijos(idCliente);
    const query = `
WITH rango AS (
    SELECT DATEDIFF(?, ?) AS dias
),
datos AS (
    SELECT 
        /* PERIODO DINÁMICO */
        CASE 
            WHEN dias = 0 THEN DATE_FORMAT(td.FechaHoraFinal, '%Y-%m-%d %H:00')     -- Por hora
            WHEN dias <= 15 THEN DATE(td.FechaHoraFinal)                            -- Por día
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(td.FechaHoraFinal, '%Y-%m'),
                                        ' Semana ', WEEK(td.FechaHoraFinal, 1))     -- Por semana
            ELSE DATE_FORMAT(td.FechaHoraFinal, '%Y-%m')                            -- Por mes
        END AS periodo,

        SUM(CASE WHEN td.IdTipoTransaccion = 2 THEN td.Monto ELSE 0 END) AS ingresos,
        COUNT(CASE WHEN td.IdTipoTransaccion = 2 THEN 1 END) AS validaciones_exitosas,
        COUNT(CASE WHEN td.IdTipoTransaccion = 3 THEN 1 END) AS validaciones_fallidas,

        ROUND(
            IFNULL(
                SUM(CASE WHEN td.IdTipoTransaccion = 2 THEN td.Monto ELSE 0 END) /
                NULLIF(COUNT(DISTINCT CASE WHEN td.IdTipoTransaccion = 2 THEN td.NumeroSerieMonedero END), 0)
            , 0), 2
        ) AS ticket_promedio,

        ROUND(
            SUM(CASE WHEN td.IdTipoTransaccion = 2 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100,
            2
        ) AS porcentaje_exitosas,

        ROUND(
            SUM(CASE WHEN td.IdTipoTransaccion = 3 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100,
            2
        ) AS porcentaje_fallidas

    FROM HistoricoTransaccionesDebito td
    INNER JOIN Validadores d ON td.NumeroSerieValidador = d.NumeroSerie
    INNER JOIN Clientes c ON d.IdCliente = c.Id
    CROSS JOIN rango
    WHERE td.FechaHoraFinal BETWEEN ? AND ?
      AND c.Id IN (${placeholders})

    GROUP BY 
        CASE 
            WHEN dias = 0 THEN DATE_FORMAT(td.FechaHoraFinal, '%Y-%m-%d %H:00')
            WHEN dias <= 15 THEN DATE(td.FechaHoraFinal)
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(td.FechaHoraFinal, '%Y-%m'),
                                        ' Semana ', WEEK(td.FechaHoraFinal, 1))
            ELSE DATE_FORMAT(td.FechaHoraFinal, '%Y-%m')
        END
)
SELECT 
    ROW_NUMBER() OVER (ORDER BY periodo) AS id,
    periodo,
    ingresos,
    validaciones_exitosas,
    validaciones_fallidas,
    ticket_promedio,
    porcentaje_exitosas,
    porcentaje_fallidas
FROM datos
ORDER BY periodo;

`;
    const { fromZ, toZ } = dateTimeBounds(fechaInicio, fechaFin);
    return this.clienteRepository.query(query, [toZ, fromZ, fromZ, toZ, ...ids]);
  }

  /////////*/*/*/*/*/*//*//////////////////////////////////////////******/////*/*/*/*/*/*/*/*/*/*/*/*/*/*/*//*/*/**/***/*/****

  private async graficaPasajerosPorRuta(
    fechaInicio: string,
    fechaFin: string,
    idCliente: number,
  ) {
    const query = `
WITH rango AS (
    SELECT DATEDIFF(?, ?) AS dias
),
Pasajeros AS (
    SELECT
        r.Id AS idRuta,
        r.Nombre AS ruta,

        -- PERIODO dinámico según rango de días
        CASE
            WHEN dias = 0 THEN DATE_FORMAT(cp.FechaHora, '%Y-%m-%d %H:00')          -- Por hora
            WHEN dias <= 15 THEN DATE(cp.FechaHora)       -- Por día
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(cp.FechaHora, '%Y-%m'), ' Semana ', WEEK(cp.FechaHora, 1)) -- Por semana
            ELSE DATE_FORMAT(cp.FechaHora, '%Y-%m')       -- Por mes
        END AS periodo,

        SUM(cp.Entradas) AS pasajeros
    FROM ConteoPasajeros cp
    INNER JOIN rango ON 1=1
    INNER JOIN Viajes vi ON vi.Id = cp.IdViaje
    INNER JOIN Turnos t ON t.Id = vi.IdTurno
    INNER JOIN Instalaciones i ON i.Id = t.IdInstalacion
    INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
    INNER JOIN Variantes d ON vi.IdVariante = d.Id AND d.Estatus = 1
    INNER JOIN Rutas r ON d.IdRuta = r.Id AND r.Estatus = 1
    INNER JOIN Clientes c ON v.IdCliente = c.Id AND c.Estatus = 1
    WHERE cp.FechaHora BETWEEN ? AND ?
      AND c.Id IN (?)
      AND v.Estatus = 1
      AND i.Estatus = 1
    GROUP BY r.Id, r.Nombre,
        CASE
            WHEN dias = 0 THEN DATE_FORMAT(cp.FechaHora, '%Y-%m-%d %H:00')
            WHEN dias <= 15 THEN DATE(cp.FechaHora)
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(cp.FechaHora, '%Y-%m'), ' Semana ', WEEK(cp.FechaHora, 1))
            ELSE DATE_FORMAT(cp.FechaHora, '%Y-%m')
        END
)
SELECT *
FROM Pasajeros
ORDER BY periodo, ruta;

`;
    const { from, to } = dateTimeBounds(fechaInicio, fechaFin);
    return this.clienteRepository.query(query, [
      to,
      from,
      from,
      to,
      Number(idCliente),
    ]);
  }

  private async graficaPasajerosPorRutaSA(
    fechaInicio: string,
    fechaFin: string,
    idCliente: number,
  ) {
    const { ids, placeholders } = await this.clienteHijos(idCliente);
    const query = `
WITH rango AS (
    SELECT DATEDIFF(?, ?) AS dias
),
Pasajeros AS (
    SELECT
        r.Id AS idRuta,
        r.Nombre AS ruta,

        -- PERIODO dinámico según rango de días
        CASE
            WHEN dias = 0 THEN DATE_FORMAT(cp.FechaHora, '%Y-%m-%d %H:00')          -- Por hora
            WHEN dias <= 15 THEN DATE(cp.FechaHora)       -- Por día
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(cp.FechaHora, '%Y-%m'), ' Semana ', WEEK(cp.FechaHora, 1)) -- Por semana
            ELSE DATE_FORMAT(cp.FechaHora, '%Y-%m')       -- Por mes
        END AS periodo,

        SUM(cp.Entradas) AS pasajeros
    FROM ConteoPasajeros cp
    INNER JOIN rango ON 1=1
    INNER JOIN Viajes vi ON vi.Id = cp.IdViaje
    INNER JOIN Turnos t ON t.Id = vi.IdTurno
    INNER JOIN Instalaciones i ON i.Id = t.IdInstalacion
    INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
    INNER JOIN Variantes d ON vi.IdVariante = d.Id AND d.Estatus = 1
    INNER JOIN Rutas r ON d.IdRuta = r.Id AND r.Estatus = 1
    INNER JOIN Clientes c ON v.IdCliente = c.Id AND c.Estatus = 1
    WHERE cp.FechaHora BETWEEN ? AND ?
      AND c.Id IN (${placeholders})
      AND v.Estatus = 1
      AND i.Estatus = 1
    GROUP BY r.Id, r.Nombre,
        CASE
            WHEN dias = 0 THEN DATE_FORMAT(cp.FechaHora, '%Y-%m-%d %H:00')
            WHEN dias <= 15 THEN DATE(cp.FechaHora)
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(cp.FechaHora, '%Y-%m'), ' Semana ', WEEK(cp.FechaHora, 1))
            ELSE DATE_FORMAT(cp.FechaHora, '%Y-%m')
        END
)
SELECT *
FROM Pasajeros
ORDER BY periodo, ruta;

`;
    const { from, to } = dateTimeBounds(fechaInicio, fechaFin);
    return this.clienteRepository.query(query, [to, from, from, to, ...ids]);
  }

  /////////*/*/*/*/*/*//*//////////////////////////////////////////******/////*/*/*/*/*/*/*/*/*/*/*/*/*/*/*//*/*/**/***/*/****

  private async graficaAscensosVsBoleto(
    fechaInicio: string,
    fechaFin: string,
    idCliente: number,
  ) {
    const query = `

WITH rango AS (
    SELECT DATEDIFF(?, ?) AS dias
),

/* =====================================================
   PERIODOS DINÁMICOS
====================================================== */
periodos AS (
    SELECT DISTINCT
        CASE 
            WHEN dias = 0 THEN DATE_FORMAT(fecha, '%Y-%m-%d %H:00')
            WHEN dias <= 15 THEN DATE(fecha)
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(fecha, '%Y-%m'),
                                        ' Semana ', WEEK(fecha, 1))
            ELSE DATE_FORMAT(fecha, '%Y-%m')
        END AS periodo
    FROM (
        SELECT cp.FechaHora AS fecha
        FROM ConteoPasajeros cp
        INNER JOIN Contadores c ON cp.NumeroSerieContador = c.NumeroSerie
        WHERE c.IdCliente IN (?)
          AND cp.FechaHora BETWEEN ? 
                               AND ?
        
        UNION
        
        SELECT td.FechaHoraFinal AS fecha
        FROM HistoricoTransaccionesDebito td
        INNER JOIN Validadores d ON td.NumeroSerieValidador = d.NumeroSerie
        WHERE d.IdCliente IN (?)
          AND td.FechaHoraFinal BETWEEN ? 
                               AND ?
    ) AS fechas
    CROSS JOIN rango
),

/* =====================================================
   ASCENSOS DEL CLIENTE
====================================================== */
ascensos AS (
    SELECT
        CASE 
            WHEN dias = 0 THEN DATE_FORMAT(cp.FechaHora, '%Y-%m-%d %H:00')
            WHEN dias <= 15 THEN DATE(cp.FechaHora)
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(cp.FechaHora, '%Y-%m'),
                                        ' Semana ', WEEK(cp.FechaHora, 1))
            ELSE DATE_FORMAT(cp.FechaHora, '%Y-%m')
        END AS periodo,

        SUM(cp.Entradas) AS ascensos
    FROM ConteoPasajeros cp
    INNER JOIN Contadores c ON cp.NumeroSerieContador = c.NumeroSerie
    CROSS JOIN rango
    WHERE c.IdCliente IN (?)
      AND cp.FechaHora BETWEEN ? 
                           AND ?
    GROUP BY periodo
),

/* =====================================================
   BOLETOS (TRANSACCIONES EXITOSAS) DEL CLIENTE
====================================================== */
boletos AS (
    SELECT
        CASE 
            WHEN dias = 0 THEN DATE_FORMAT(td.FechaHoraFinal, '%Y-%m-%d %H:00')
            WHEN dias <= 15 THEN DATE(td.FechaHoraFinal)
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(td.FechaHoraFinal, '%Y-%m'),
                                        ' Semana ', WEEK(td.FechaHoraFinal, 1))
            ELSE DATE_FORMAT(td.FechaHoraFinal, '%Y-%m')
        END AS periodo,

        COUNT(CASE WHEN td.IdTipoTransaccion = 2 THEN 1 END) AS boletos
    FROM HistoricoTransaccionesDebito td
    INNER JOIN Validadores d ON td.NumeroSerieValidador = d.NumeroSerie
    CROSS JOIN rango
    WHERE d.IdCliente IN (?)
      AND td.FechaHoraFinal BETWEEN ? 
                           AND ?
    GROUP BY periodo
)

/* =====================================================
   MERGE FINAL
====================================================== */
SELECT 
    p.periodo,
    COALESCE(a.ascensos, 0) AS ascensos,
    COALESCE(b.boletos, 0) AS boletos
FROM periodos p
LEFT JOIN ascensos a ON a.periodo = p.periodo
LEFT JOIN boletos  b ON b.periodo = p.periodo
ORDER BY p.periodo;

`;
    const { fromZ, toZ } = dateTimeBounds(fechaInicio, fechaFin);
    const clienteId = Number(idCliente);
    return this.clienteRepository.query(query, [
      toZ,
      fromZ,
      clienteId,
      fromZ,
      toZ,
      clienteId,
      fromZ,
      toZ,
      clienteId,
      fromZ,
      toZ,
      clienteId,
      fromZ,
      toZ,
    ]);
  }

  private async graficaAscensosVsBoletoSA(
    fechaInicio: string,
    fechaFin: string,
    idCliente: number,
  ) {
    const { ids, placeholders } = await this.clienteHijos(idCliente);
    const query = `

WITH rango AS (
    SELECT DATEDIFF(?, ?) AS dias
),

/* =====================================================
   PERIODOS DINÁMICOS
====================================================== */
periodos AS (
    SELECT DISTINCT
        CASE 
            WHEN dias = 0 THEN DATE_FORMAT(fecha, '%Y-%m-%d %H:00')
            WHEN dias <= 15 THEN DATE(fecha)
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(fecha, '%Y-%m'),
                                        ' Semana ', WEEK(fecha, 1))
            ELSE DATE_FORMAT(fecha, '%Y-%m')
        END AS periodo
    FROM (
        SELECT cp.FechaHora AS fecha
        FROM ConteoPasajeros cp
        INNER JOIN Contadores c ON cp.NumeroSerieContador = c.NumeroSerie
        WHERE c.IdCliente IN (${placeholders})
          AND cp.FechaHora BETWEEN ? 
                               AND ?
        
        UNION
        
        SELECT td.FechaHoraFinal AS fecha
        FROM HistoricoTransaccionesDebito td
        INNER JOIN Validadores d ON td.NumeroSerieValidador = d.NumeroSerie
        WHERE d.IdCliente IN (${placeholders})  
          AND td.FechaHoraFinal BETWEEN ? 
                               AND ?
    ) AS fechas
    CROSS JOIN rango
),

/* =====================================================
   ASCENSOS DEL CLIENTE
====================================================== */
ascensos AS (
    SELECT
        CASE 
            WHEN dias = 0 THEN DATE_FORMAT(cp.FechaHora, '%Y-%m-%d %H:00')
            WHEN dias <= 15 THEN DATE(cp.FechaHora)
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(cp.FechaHora, '%Y-%m'),
                                        ' Semana ', WEEK(cp.FechaHora, 1))
            ELSE DATE_FORMAT(cp.FechaHora, '%Y-%m')
        END AS periodo,

        SUM(cp.Entradas) AS ascensos
    FROM ConteoPasajeros cp
    INNER JOIN Contadores c ON cp.NumeroSerieContador = c.NumeroSerie
    CROSS JOIN rango
    WHERE c.IdCliente IN (${placeholders})
      AND cp.FechaHora BETWEEN ? 
                           AND ?
    GROUP BY periodo
),

/* =====================================================
   BOLETOS (TRANSACCIONES EXITOSAS) DEL CLIENTE
====================================================== */
boletos AS (
    SELECT
        CASE 
            WHEN dias = 0 THEN DATE_FORMAT(td.FechaHoraFinal, '%Y-%m-%d %H:00')
            WHEN dias <= 15 THEN DATE(td.FechaHoraFinal)
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(td.FechaHoraFinal, '%Y-%m'),
                                        ' Semana ', WEEK(td.FechaHoraFinal, 1))
            ELSE DATE_FORMAT(td.FechaHoraFinal, '%Y-%m')
        END AS periodo,

        COUNT(CASE WHEN td.IdTipoTransaccion = 2 THEN 1 END) AS boletos
    FROM HistoricoTransaccionesDebito td
    INNER JOIN Validadores d ON td.NumeroSerieValidador = d.NumeroSerie
    CROSS JOIN rango
    WHERE d.IdCliente IN (${placeholders})
      AND td.FechaHoraFinal BETWEEN ? 
                           AND ?
    GROUP BY periodo
)

/* =====================================================
   MERGE FINAL
====================================================== */
SELECT 
    p.periodo,
    COALESCE(a.ascensos, 0) AS ascensos,
    COALESCE(b.boletos, 0) AS boletos
FROM periodos p
LEFT JOIN ascensos a ON a.periodo = p.periodo
LEFT JOIN boletos  b ON b.periodo = p.periodo
ORDER BY p.periodo;

`;
    const { fromZ, toZ } = dateTimeBounds(fechaInicio, fechaFin);
    return this.clienteRepository.query(query, [
      toZ,
      fromZ,
      ...ids,
      fromZ,
      toZ,
      ...ids,
      fromZ,
      toZ,
      ...ids,
      fromZ,
      toZ,
      ...ids,
      fromZ,
      toZ,
    ]);
  }

  /////////*/*/*/*/*/*//*//////////////////////////////////////////******/////*/*/*/*/*/*/*/*/*/*/*/*/*/*/*//*/*/**/***/*/****

  private async dataGripTop5RutasPorIngresos(
    fechaInicio: string,
    fechaFin: string,
    idCliente: number,
  ) {
    const query = `

WITH ingresos AS (
    SELECT 
        r.Id AS idRuta,
        r.Nombre AS ruta,
        COUNT(DISTINCT v.Id) AS totalViajes,
        SUM(td.Monto) AS ingresosTotales
    FROM HistoricoTransaccionesDebito td
    JOIN ViajesTransacciones vt 
            ON vt.IdTransaccionDebito = td.Id
    JOIN Viajes v 
            ON v.Id = vt.IdViaje
    JOIN Variantes d 
            ON d.Id = v.IdVariante
    JOIN Rutas r 
            ON r.Id = d.IdRuta
    JOIN Zonas z
            ON z.Id = r.IdZona
    WHERE td.IdTipoTransaccion = 2
      AND td.FechaHoraFinal BETWEEN ? AND ?
      AND z.IdCliente IN (?)
    GROUP BY r.Id, r.Nombre
)

SELECT *
FROM ingresos
ORDER BY ingresosTotales DESC
LIMIT 5;

`;
    const { fromSql, toSql } = dateTimeBounds(fechaInicio, fechaFin);
    return await this.clienteRepository.query(query, [
      fromSql,
      toSql,
      Number(idCliente),
    ]);
  }

  private async dataGripTop5RutasPorIngresosSA(
    fechaInicio: string,
    fechaFin: string,
    idCliente: number,
  ) {
    const { ids, placeholders } = await this.clienteHijos(idCliente);
    const query = `
WITH ingresos AS (
    SELECT 
        r.Id AS idRuta,
        r.Nombre AS ruta,
        COUNT(DISTINCT v.Id) AS totalViajes,
        SUM(td.Monto) AS ingresosTotales
    FROM HistoricoTransaccionesDebito td
    JOIN ViajesTransacciones vt 
            ON vt.IdTransaccionDebito = td.Id
    JOIN Viajes v 
            ON v.Id = vt.IdViaje
    JOIN Variantes d 
            ON d.Id = v.IdVariante
    JOIN Rutas r 
            ON r.Id = d.IdRuta
    JOIN Zonas z
            ON z.Id = r.IdZona
    WHERE td.IdTipoTransaccion = 2
      AND td.FechaHoraFinal BETWEEN ? AND ?
      AND z.IdCliente IN (${placeholders})
    GROUP BY r.Id, r.Nombre
)

SELECT *
FROM ingresos
ORDER BY ingresosTotales DESC
LIMIT 5;

`;
    const { fromSql, toSql } = dateTimeBounds(fechaInicio, fechaFin);
    return await this.clienteRepository.query(query, [fromSql, toSql, ...ids]);
  }

  /////////*/*/*/*/*/*//*//////////////////////////////////////////******/////*/*/*/*/*/*/*/*/*/*/*/*/*/*/*//*/*/**/***/*/****

  private async velocidadPromedioRuta(
    fechaInicio: string,
    fechaFin: string,
    idCliente: number,
  ) {
    const query = `

WITH rango AS (
    SELECT DATEDIFF(?, ?) AS dias
),

VelocidadRuta AS (
    SELECT
        r.Id AS idRuta,
        r.Nombre AS ruta,

        /* PERIODO DINÁMICO */
        CASE
            WHEN dias = 0 THEN DATE_FORMAT(p.FechaHora, '%Y-%m-%d %H:00')          -- Por hora
            WHEN dias <= 15 THEN DATE(p.FechaHora)                                 -- Por día
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(p.FechaHora, '%Y-%m'), ' Semana ', WEEK(p.FechaHora, 1))
            ELSE DATE_FORMAT(p.FechaHora, '%Y-%m')                                  -- Por mes
        END AS periodo,

        ROUND(AVG(p.Velocidad), 2) AS velocidad_promedio

    FROM Posiciones p
    INNER JOIN rango ON 1=1
    INNER JOIN Validadores d ON p.NumeroSerieValidador = d.NumeroSerie
    INNER JOIN Instalaciones i ON d.Id = i.idValidador AND d.IdCliente = i.IdCliente
    INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND v.IdCliente = d.IdCliente
    INNER JOIN Turnos t ON i.Id = t.IdInstalacion AND t.Estatus = 1
    INNER JOIN Viajes vi ON t.Id = vi.IdTurno AND vi.Estatus = 1
    INNER JOIN Variantes drr ON vi.IdVariante = drr.Id AND drr.Estatus = 1
    INNER JOIN Rutas r ON drr.IdRuta = r.Id AND r.Estatus = 1
    INNER JOIN Clientes c ON c.Id = d.IdCliente AND c.Estatus = 1

    WHERE p.FechaHora BETWEEN ? AND ?
      AND c.Id IN (?)
      AND v.Estatus = 1
      AND i.Estatus = 1
      AND d.Estatus = 1

    GROUP BY 
        r.Id, r.Nombre,
        CASE
            WHEN dias = 0 THEN DATE_FORMAT(p.FechaHora, '%Y-%m-%d %H:00')
            WHEN dias <= 15 THEN DATE(p.FechaHora)
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(p.FechaHora, '%Y-%m'), ' Semana ', WEEK(p.FechaHora, 1))
            ELSE DATE_FORMAT(p.FechaHora, '%Y-%m')
        END
)

SELECT *
FROM VelocidadRuta
ORDER BY periodo, ruta;

`;
    const { from, to } = dateTimeBounds(fechaInicio, fechaFin);
    return this.clienteRepository.query(query, [
      to,
      from,
      from,
      to,
      Number(idCliente),
    ]);
  }

  private async velocidadPromedioRutaSA(
    fechaInicio: string,
    fechaFin: string,
    idCliente: number,
  ) {
    const { ids, placeholders } = await this.clienteHijos(idCliente);
    const query = `

WITH rango AS (
    SELECT DATEDIFF(?, ?) AS dias
),

VelocidadRuta AS (
    SELECT
        r.Id AS idRuta,
        r.Nombre AS ruta,

        /* PERIODO DINÁMICO */
        CASE
            WHEN dias = 0 THEN DATE_FORMAT(p.FechaHora, '%Y-%m-%d %H:00')          -- Por hora
            WHEN dias <= 15 THEN DATE(p.FechaHora)                                 -- Por día
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(p.FechaHora, '%Y-%m'), ' Semana ', WEEK(p.FechaHora, 1))
            ELSE DATE_FORMAT(p.FechaHora, '%Y-%m')                                  -- Por mes
        END AS periodo,

        ROUND(AVG(p.Velocidad), 2) AS velocidad_promedio

    FROM Posiciones p
    INNER JOIN rango ON 1=1
    INNER JOIN Validadores d ON p.NumeroSerieValidador = d.NumeroSerie
    INNER JOIN Instalaciones i ON d.Id = i.idValidador AND d.IdCliente = i.IdCliente
    INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND v.IdCliente = d.IdCliente
    INNER JOIN Turnos t ON i.Id = t.IdInstalacion AND t.Estatus = 1
    INNER JOIN Viajes vi ON t.Id = vi.IdTurno AND vi.Estatus = 1
    INNER JOIN Variantes drr ON vi.IdVariante = drr.Id AND drr.Estatus = 1
    INNER JOIN Rutas r ON drr.IdRuta = r.Id AND r.Estatus = 1
    INNER JOIN Clientes c ON c.Id = d.IdCliente AND c.Estatus = 1

    WHERE p.FechaHora BETWEEN ? AND ?
      AND c.Id IN (${placeholders})
      AND v.Estatus = 1
      AND i.Estatus = 1
      AND d.Estatus = 1

    GROUP BY 
        r.Id, r.Nombre,
        CASE
            WHEN dias = 0 THEN DATE_FORMAT(p.FechaHora, '%Y-%m-%d %H:00')
            WHEN dias <= 15 THEN DATE(p.FechaHora)
            WHEN dias <= 60 THEN CONCAT(DATE_FORMAT(p.FechaHora, '%Y-%m'), ' Semana ', WEEK(p.FechaHora, 1))
            ELSE DATE_FORMAT(p.FechaHora, '%Y-%m')
        END
)

SELECT *
FROM VelocidadRuta
ORDER BY periodo, ruta;

`;
    const { from, to } = dateTimeBounds(fechaInicio, fechaFin);
    return this.clienteRepository.query(query, [to, from, from, to, ...ids]);
  }

  // ========================================
  // 🔹 OBTENER MÉTRICAS DEL DASHBOARD
  // ========================================
  async getDashboardMetrics(
    idUser: number,
    cliente: number,
    rol: number,
    filtro: number = 1,
  ) {
    try {
      // Asegurar que filtro sea número (query params llegan como string, ej. "1")
      const filtroNum = Number(filtro) || 1;

      // Calcular fechas según el filtro
      const { fechaInicio, fechaFin } = this.calcularFechasPorFiltro(filtroNum);

      let clienteFilter = '';
      let clienteFilter2 = ''; // alias c2 (consultas del endpoint /kpi)
      let clienteParams: any[] = [];

      // Para rol 2 en adelante, filtrar por idCliente
      if (rol !== 1) {
        const { ids, placeholders } = await this.clienteHijos(cliente);
        if (ids && ids.length > 0) {
          clienteFilter = `AND c.Id IN (${placeholders})`;
          clienteFilter2 = `AND c2.Id IN (${placeholders})`;
          clienteParams = [...ids];
        } else {
          // Si no hay clientes hijos, retornar datos vacíos
          return {
            ticketPromedio: { ticketPromedio: 0, totalTransacciones: 0 },
            ingresosTotales: 0,
            porcentajeMonederoVirtual: {
              totalDebitos: 0,
              debitosTarjeta: 0,
              debitosPagoElectronico: 0,
              porcentajeTarjeta: 0,
              porcentajePagoElectronico: 0,
            },
            viajesAbiertos: {
              viajesAbiertos: 0,
              totalValidadores: 0,
              porcentajeViajesActivos: 0,
            },
            top5Rutas: [],
            pasajerosPorRutaTipo: [],
            pasajerosValidados: 0,
            unidadesEnServicio: 0,
            validacionesExitosas: 0,
            validacionesFallidas: 0,
            graficaAscensosVsBoletos: [],
            alertas: [],
            cumplimientoTurnos: {
              totalTurnos: 0,
              turnosCerrados: 0,
              porcentaje: null,
            },
            ocupacion: { viajesConConteo: 0, porcentaje: null },
          };
        }
      }

      // Alertas de monitoreo (ÚltimaPosicion: inactividad ≥12 h, exceso de velocidad >90)
      const alertas = await this.getDashboardAlertas(
        clienteFilter,
        clienteParams,
      );

      // 1. Costo del ticket promedio (de TransaccionesDebito)
      const ticketPromedioData = await this.getTicketPromedio(
        clienteFilter,
        clienteFilter2,
        clienteParams,
        fechaInicio,
        fechaFin,
        filtroNum,
      );

      // Extraer ingresosTotales del ticketPromedio
      const ingresosTotales = Number(ticketPromedioData.ingresosTotales) || 0;

      // Remover ingresosTotales del objeto ticketPromedio
      const ticketPromedio = {
        ticketPromedio: ticketPromedioData.ticketPromedio,
        totalTransacciones: ticketPromedioData.totalTransacciones,
      };

      // 2. Porcentaje de débitos con monedero virtual (EsQR = 1)
      const porcentajeMonederoVirtual = await this.getPorcentajeMonederoVirtual(
        clienteFilter,
        clienteFilter2,
        clienteParams,
        fechaInicio,
        fechaFin,
        filtroNum,
      );

      // 3. Viajes abiertos en últimos 15 minutos vs posibles según número de validadores
      const viajesAbiertos = await this.getViajesAbiertos(
        clienteFilter,
        clienteParams,
      );

      // 4. Top 5 rutas con más ingresos
      const top5Rutas = await this.getTop5RutasIngresos(
        clienteFilter,
        clienteFilter2,
        clienteParams,
        fechaInicio,
        fechaFin,
        filtroNum,
      );

      // 5. Pasajeros por ruta según tipo de pasajero (gráfica apilada)
      const pasajerosPorRutaTipo = await this.getPasajerosPorRutaTipo(
        clienteFilter,
        clienteFilter2,
        clienteParams,
        fechaInicio,
        fechaFin,
        filtroNum,
      );

      // 6. Pasajeros validados (pasajeros únicos que debitaron)
      const pasajerosValidados = await this.getPasajerosValidados(
        clienteFilter,
        clienteFilter2,
        clienteParams,
        fechaInicio,
        fechaFin,
        filtroNum,
      );

      // 7. Unidades en servicio (viajes activos)
      const unidadesEnServicio = await this.getUnidadesEnServicio(
        clienteFilter,
        clienteParams,
      );

      // 8. Validaciones exitosas y fallidas
      const validaciones = await this.getValidaciones(
        clienteFilter,
        clienteFilter2,
        clienteParams,
        fechaInicio,
        fechaFin,
        filtroNum,
      );

      // 9. Gráfica Ascensos vs Boletos
      const graficaAscensosVsBoletos = await this.getGraficaAscensosVsBoletos(
        clienteFilter,
        clienteFilter2,
        clienteParams,
        fechaInicio,
        fechaFin,
        filtroNum,
      );

      // 10. Cumplimiento de turnos y ocupación
      const { cumplimientoTurnos, ocupacion } =
        await this.getCumplimientoYOcupacion(
          clienteFilter,
          clienteParams,
          fechaInicio,
          fechaFin,
        );

      // Si el filtro es "hoy" (1), calcular también los ingresos de ayer (usa CURDATE() en MySQL)
      let ingresoTotalAyer: number | null = null;
      if (filtroNum === 1) {
        ingresoTotalAyer = await this.getIngresoTotalAyer(
          clienteFilter,
          clienteParams,
          fechaInicio,
        );
      }

      const resultado: any = {
        ticketPromedio,
        ingresosTotales,
        porcentajeMonederoVirtual,
        viajesAbiertos,
        top5Rutas,
        pasajerosPorRutaTipo,
        pasajerosValidados,
        unidadesEnServicio,
        validacionesExitosas: validaciones.exitosas,
        validacionesFallidas: validaciones.fallidas,
        graficaAscensosVsBoletos,
        alertas,
        cumplimientoTurnos,
        ocupacion,
      };

      // Agregar ingresoTotalAyer solo si el filtro es "hoy" (1)
      if (filtroNum === 1 && ingresoTotalAyer !== null) {
        resultado.ingresoTotalAyer = ingresoTotalAyer;
      }

      return resultado;
    } catch (error) {
      this.logger.error(
        `getDashboardMetrics: ${error?.code ?? ''} ${error?.sqlMessage ?? error?.message ?? ''}`,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al obtener las métricas del dashboard.',
      });
    }
  }

  /**
   * Alertas de monitoreo: última fila por validador en Posiciones (MAX(Id) por NumeroSerieValidador).
   * Vehículo vía instalación (join interno, no se expone objeto instalación en la respuesta).
   * INACTIVIDAD: FechaHora con antigüedad ≥ 12 horas.
   * EXCESO_VELOCIDAD: Velocidad > 90 (km/h).
   */
  private async getDashboardAlertas(
    clienteFilter: string,
    clienteParams: any[],
  ) {
    const ultimaPosicionSubquery = `
      INNER JOIN (
        SELECT NumeroSerieValidador AS ns, MAX(Id) AS maxId
        FROM Posiciones
        GROUP BY NumeroSerieValidador
      ) ult ON p.Id = ult.maxId
    `;

    const baseFrom = `
      FROM Posiciones p
      ${ultimaPosicionSubquery}
      INNER JOIN Validadores d ON p.NumeroSerieValidador = d.NumeroSerie
      INNER JOIN Instalaciones i ON d.Id = i.IdValidador AND d.IdCliente = i.IdCliente
      INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
      INNER JOIN Clientes c ON i.IdCliente = c.Id
      WHERE i.Estatus = 1 AND d.Estatus = 1 AND v.Estatus = 1 AND c.Estatus = 1
      ${clienteFilter}
    `;

    const cols = `
        p.NumeroSerieValidador AS numeroSerieValidador,
        p.FechaHora AS fechaHoraUltimaPosicion,
        p.Velocidad AS velocidadReportada,
        p.Latitud AS latitud,
        p.Longitud AS longitud,
        p.Id AS idPosicion,
        v.Id AS idVehiculo,
        v.Placa AS placaVehiculo,
        v.Marca AS marcaVehiculo,
        v.Modelo AS modeloVehiculo,
        v.NumeroEconomico AS numeroEconomicoVehiculo,
        v.Foto AS fotoVehiculo
    `;

    const sqlInactividad = `
      SELECT
        'INACTIVIDAD' AS tipoAlerta,
        CONCAT(
          'Inactividad: la última posición tiene más de 12 horas (',
          DATE_FORMAT(p.FechaHora, '%Y-%m-%d %H:%i:%s'),
          ').'
        ) AS descripcion,
        ${cols}
      ${baseFrom}
        AND p.FechaHora <= DATE_SUB(NOW(), INTERVAL 12 HOUR)
    `;

    const sqlVelocidad = `
      SELECT
        'EXCESO_VELOCIDAD' AS tipoAlerta,
        CONCAT(
          'Exceso de velocidad: ',
          ROUND(CAST(p.Velocidad AS DECIMAL(10,2)), 1),
          ' km/h (supera 90 km/h).'
        ) AS descripcion,
        ${cols}
      ${baseFrom}
        AND p.Velocidad IS NOT NULL AND CAST(p.Velocidad AS DECIMAL(10,2)) > 90
    `;

    const [rowsInactividad, rowsVelocidad] = await Promise.all([
      this.clienteRepository.query(sqlInactividad, clienteParams),
      this.clienteRepository.query(sqlVelocidad, clienteParams),
    ]);

    const rows = [...rowsInactividad, ...rowsVelocidad].sort(
      (a: any, b: any) => {
        const t = String(a.tipoAlerta).localeCompare(String(b.tipoAlerta));
        if (t !== 0) return t;
        return String(a.numeroSerieValidador ?? '').localeCompare(
          String(b.numeroSerieValidador ?? ''),
        );
      },
    );

    return rows.map((row: any) => ({
      tipoAlerta: row.tipoAlerta,
      descripcion: row.descripcion,
      numeroSerieValidador: row.numeroSerieValidador,
      idPosicion: row.idPosicion != null ? Number(row.idPosicion) : null,
      fechaHoraUltimaPosicion: row.fechaHoraUltimaPosicion,
      velocidadReportada:
        row.velocidadReportada != null ? Number(row.velocidadReportada) : null,
      latitud: row.latitud != null ? Number(row.latitud) : null,
      longitud: row.longitud != null ? Number(row.longitud) : null,
      vehiculo: {
        idVehiculo: Number(row.idVehiculo),
        placa: row.placaVehiculo,
        marca: row.marcaVehiculo,
        modelo: row.modeloVehiculo,
        numeroEconomico: row.numeroEconomicoVehiculo,
        foto: row.fotoVehiculo,
      },
    }));
  }

  /** Zona horaria usada para "hoy" y "ayer" en el dashboard. */
  private readonly ZONA_MEXICO = 'America/Mexico_City';

  /**
   * Obtiene la fecha actual en America/Mexico_City.
   * No depende de la zona horaria del servidor.
   */
  private getFechaMexico(): { year: number; month: number; date: number } {
    const ahora = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.ZONA_MEXICO,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(ahora);
    const year = parseInt(
      parts.find((p) => p.type === 'year')?.value ?? '0',
      10,
    );
    const month = parseInt(
      parts.find((p) => p.type === 'month')?.value ?? '0',
      10,
    );
    const date = parseInt(
      parts.find((p) => p.type === 'day')?.value ?? '0',
      10,
    );
    return { year, month, date };
  }

  // Calcular fechas según el filtro (usa zona México UTC-6)
  private calcularFechasPorFiltro(filtro: number): {
    fechaInicio: string;
    fechaFin: string;
  } {
    function pad(n: number) {
      return n < 10 ? '0' + n : n;
    }

    const hoy = this.getFechaMexico();
    const hoyStr = `${hoy.year}-${pad(hoy.month)}-${pad(hoy.date)}`;

    let fechaInicio: string;
    let fechaFin: string;

    switch (filtro) {
      case 2: // Últimos 7 días
        const hace7Dias = new Date(
          Date.UTC(hoy.year, hoy.month - 1, hoy.date) - 7 * 24 * 60 * 60 * 1000,
        );
        fechaInicio = `${hace7Dias.getUTCFullYear()}-${pad(hace7Dias.getUTCMonth() + 1)}-${pad(hace7Dias.getUTCDate())}`;
        fechaFin = hoyStr;
        break;

      case 3: // Mes actual
        fechaInicio = `${hoy.year}-${pad(hoy.month)}-01`;
        fechaFin = hoyStr;
        break;

      case 4: // Año actual
        fechaInicio = `${hoy.year}-01-01`;
        fechaFin = hoyStr;
        break;

      default: // 1 - Hoy
        fechaInicio = hoyStr;
        fechaFin = hoyStr;
        break;
    }

    return { fechaInicio, fechaFin };
  }

  // Calcular fechas de ayer en zona México (UTC-6)
  private calcularFechasAyer(): {
    fechaInicioAyer: string;
    fechaFinAyer: string;
  } {
    function pad(n: number) {
      return n < 10 ? '0' + n : n;
    }

    const hoy = this.getFechaMexico();
    const ayerDate = new Date(
      Date.UTC(hoy.year, hoy.month - 1, hoy.date) - 24 * 60 * 60 * 1000,
    );
    const fechaInicioAyer = `${ayerDate.getUTCFullYear()}-${pad(ayerDate.getUTCMonth() + 1)}-${pad(ayerDate.getUTCDate())}`;
    const fechaFinAyer = fechaInicioAyer;

    return { fechaInicioAyer, fechaFinAyer };
  }

  // Obtener ingresos totales del día (hoy) usando CURDATE() de MySQL.
  private async getIngresoTotalAyer(
    clienteFilter: string,
    clienteParams: any[],
    fechaHoy: string,
  ) {
    // Mismo origen y misma fecha de México que "Hoy" (fechaHoy = YYYY-MM-DD).
    const query = `
      SELECT COALESCE(SUM(td.Monto), 0) AS ingresoTotalAyer
      FROM TransaccionesDebito td
      INNER JOIN Validadores v ON td.NumeroSerieValidador = v.NumeroSerie
      INNER JOIN Clientes c ON v.IdCliente = c.Id
      WHERE td.IdTipoTransaccion = 2
        AND DATE(td.FHRegistro) = DATE(?) - INTERVAL 1 DAY
        ${clienteFilter}
    `;
    const result = await this.clienteRepository.query(query, [
      fechaHoy,
      ...clienteParams,
    ]);
    return Number(result[0]?.ingresoTotalAyer) || 0;
  }

  // 1. Costo del ticket promedio
  private async getTicketPromedio(
    clienteFilter: string,
    clienteFilter2: string,
    clienteParams: any[],
    fechaInicio: string,
    fechaFin: string,
    filtro: number,
  ) {
    const querySolo = `
      SELECT 
        ROUND(AVG(td.Monto), 2) AS ticketPromedio,
        COUNT(*) AS totalTransacciones,
        SUM(td.Monto) AS ingresosTotales
      FROM TransaccionesDebito td
      INNER JOIN Validadores v ON td.NumeroSerieValidador = v.NumeroSerie
      INNER JOIN Clientes c ON v.IdCliente = c.Id
      WHERE td.IdTipoTransaccion = 2
        AND DATE(td.FHRegistro) BETWEEN ? AND ?
        ${clienteFilter}
    `;
    const query = querySolo;
    const params = [fechaInicio, fechaFin, ...clienteParams];
    const result = await this.clienteRepository.query(query, params);
    return (
      result[0] || {
        ticketPromedio: 0,
        totalTransacciones: 0,
        ingresosTotales: 0,
      }
    );
  }

  // 2. Porcentaje de débitos: Tarjeta (EsQR = 0) y Pago electrónico (EsQR = 1)
  // Cuando filtro es "hoy" (1) solo consulta TransaccionesDebito; para 7 días, mes o año usa UNION con histórico.
  private async getPorcentajeMonederoVirtual(
    clienteFilter: string,
    clienteFilter2: string,
    clienteParams: any[],
    fechaInicio: string,
    fechaFin: string,
    filtro: number,
  ) {
    const querySoloTransacciones = `
      SELECT 
        COUNT(*) AS totalDebitos,
        SUM(CASE WHEN td.EsQR = 0 THEN 1 ELSE 0 END) AS debitosTarjeta,
        SUM(CASE WHEN td.EsQR = 1 THEN 1 ELSE 0 END) AS debitosPagoElectronico,
        ROUND(
          SUM(CASE WHEN td.EsQR = 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100,
          2
        ) AS porcentajeTarjeta,
        ROUND(
          SUM(CASE WHEN td.EsQR = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100,
          2
        ) AS porcentajePagoElectronico
      FROM TransaccionesDebito td
      INNER JOIN Validadores v ON td.NumeroSerieValidador = v.NumeroSerie
      INNER JOIN Clientes c ON v.IdCliente = c.Id
      WHERE td.IdTipoTransaccion = 2
        AND DATE(td.FHRegistro) BETWEEN ? AND ?
        ${clienteFilter}
    `;

    const query = querySoloTransacciones;
    const params = [fechaInicio, fechaFin, ...clienteParams];

    const result = await this.clienteRepository.query(query, params);
    return (
      result[0] || {
        totalDebitos: 0,
        debitosTarjeta: 0,
        debitosPagoElectronico: 0,
        porcentajeTarjeta: 0,
        porcentajePagoElectronico: 0,
      }
    );
  }

  // 3. Viajes abiertos vs posibles según número de validadores
  private async getViajesAbiertos(clienteFilter: string, clienteParams: any[]) {
    // Primero obtener el total de validadores
    const validadoresQuery = `
      SELECT COUNT(DISTINCT val.Id) AS total
      FROM Validadores val
      INNER JOIN Clientes c ON val.IdCliente = c.Id
      WHERE val.Estatus = 1
        ${clienteFilter}
    `;
    const validadoresResult = await this.clienteRepository.query(
      validadoresQuery,
      clienteParams,
    );
    const totalValidadores = Number(validadoresResult[0]?.total) || 0;

    // Luego obtener los viajes abiertos (estatus = 1 y Fin IS NULL)
    const viajesQuery = `
      SELECT COUNT(DISTINCT v.Id) AS total
      FROM Viajes v
      INNER JOIN Clientes c ON v.IdCliente = c.Id
      WHERE v.Estatus = 1
        AND v.Fin IS NULL
        ${clienteFilter}
    `;
    const viajesResult = await this.clienteRepository.query(
      viajesQuery,
      clienteParams,
    );
    const viajesAbiertos = Number(viajesResult[0]?.total) || 0;

    return {
      viajesAbiertos,
      totalValidadores,
      porcentajeViajesActivos:
        totalValidadores > 0
          ? Number(((viajesAbiertos / totalValidadores) * 100).toFixed(2))
          : 0,
    };
  }

  // 4. Top 5 rutas con más ingresos
  private async getTop5RutasIngresos(
    clienteFilter: string,
    clienteFilter2: string,
    clienteParams: any[],
    fechaInicio: string,
    fechaFin: string,
    filtro: number,
  ) {
    const querySolo = `
      SELECT 
        r.Id AS idRuta,
        r.Nombre AS nombreRuta,
        SUM(td.Monto) AS ingresosTotales,
        COUNT(DISTINCT td.IdViaje) AS totalViajes,
        COUNT(*) AS totalTransacciones,
        ROUND(SUM(td.Monto) / NULLIF(COUNT(*), 0), 2) AS ticketPromedio
      FROM TransaccionesDebito td
      INNER JOIN Validadores val ON td.NumeroSerieValidador = val.NumeroSerie
      INNER JOIN Clientes c ON val.IdCliente = c.Id
      INNER JOIN Viajes v ON td.IdViaje = v.Id
      INNER JOIN Variantes var ON v.IdVariante = var.Id
      INNER JOIN Rutas r ON var.IdRuta = r.Id
      WHERE td.IdTipoTransaccion = 2
        AND td.IdViaje IS NOT NULL
        AND DATE(td.FHRegistro) BETWEEN ? AND ?
        ${clienteFilter}
      GROUP BY r.Id, r.Nombre
      ORDER BY ingresosTotales DESC
      LIMIT 5
    `;
    const query = querySolo;
    const params = [fechaInicio, fechaFin, ...clienteParams];
    return await this.clienteRepository.query(query, params);
  }

  // 5. Pasajeros por ruta según tipo de pasajero (gráfica apilada)
  private async getPasajerosPorRutaTipo(
    clienteFilter: string,
    clienteFilter2: string,
    clienteParams: any[],
    fechaInicio: string,
    fechaFin: string,
    filtro: number,
  ) {
    const querySolo = `
      SELECT 
        r.Id AS idRuta,
        r.Nombre AS nombreRuta,
        ctp.Id AS idTipoPasajero,
        ctp.Nombre AS tipoPasajero,
        COUNT(DISTINCT td.NumeroSerieMonedero) AS cantidadPasajeros
      FROM TransaccionesDebito td
      INNER JOIN Monederos m ON td.NumeroSerieMonedero = m.NumeroSerie
      INNER JOIN Clientes c ON m.IdCliente = c.Id
      INNER JOIN Viajes v ON td.IdViaje = v.Id
      INNER JOIN Variantes var ON v.IdVariante = var.Id
      INNER JOIN Rutas r ON var.IdRuta = r.Id
      INNER JOIN CatTiposPasajeros ctp ON m.IdTipoPasajero = ctp.Id
      WHERE td.IdTipoTransaccion = 2
        AND td.IdViaje IS NOT NULL
        AND DATE(td.FHRegistro) BETWEEN ? AND ?
        ${clienteFilter}
      GROUP BY r.Id, r.Nombre, ctp.Id, ctp.Nombre
      ORDER BY r.Nombre, ctp.Nombre
    `;
    const query = querySolo;
    const params = [fechaInicio, fechaFin, ...clienteParams];
    return await this.clienteRepository.query(query, params);
  }

  // 6. Pasajeros validados (transacciones de débito exitosas - ControlTransaccion = PAGADO (0); 1 es ABIERTA)
  private async getPasajerosValidados(
    clienteFilter: string,
    clienteFilter2: string,
    clienteParams: any[],
    fechaInicio: string,
    fechaFin: string,
    filtro: number,
  ) {
    const querySolo = `
      SELECT COUNT(DISTINCT td.NumeroSerieMonedero) AS pasajerosValidados
      FROM TransaccionesDebito td
      INNER JOIN Validadores v ON td.NumeroSerieValidador = v.NumeroSerie
      INNER JOIN Clientes c ON v.IdCliente = c.Id
      WHERE td.IdTipoTransaccion = 2
        AND td.ControlTransaccion = 0
        AND DATE(td.FHRegistro) BETWEEN ? AND ?
        ${clienteFilter}
    `;
    const query = querySolo;
    const params = [fechaInicio, fechaFin, ...clienteParams];
    const result = await this.clienteRepository.query(query, params);
    return Number(result[0]?.pasajerosValidados) || 0;
  }

  // 7. Unidades en servicio (viajes activos con estatus = 1)
  private async getUnidadesEnServicio(
    clienteFilter: string,
    clienteParams: any[],
  ) {
    const query = `
      SELECT COUNT(DISTINCT v.Id) AS unidadesEnServicio
      FROM Viajes v
      INNER JOIN Clientes c ON v.IdCliente = c.Id
      WHERE v.Estatus = 1
        ${clienteFilter}
    `;
    const result = await this.clienteRepository.query(query, clienteParams);
    return Number(result[0]?.unidadesEnServicio) || 0;
  }

  // 8. Validaciones exitosas (débito PAGADO) y fallidas (RECHAZO por saldo, IdTipoTransaccion = 3)
  private async getValidaciones(
    clienteFilter: string,
    clienteFilter2: string,
    clienteParams: any[],
    fechaInicio: string,
    fechaFin: string,
    filtro: number,
  ) {
    const querySolo = `
      SELECT 
        SUM(CASE WHEN td.IdTipoTransaccion = 2 AND td.ControlTransaccion = 0 THEN 1 ELSE 0 END) AS exitosas,
        SUM(CASE WHEN td.IdTipoTransaccion = 3 THEN 1 ELSE 0 END) AS fallidas
      FROM TransaccionesDebito td
      INNER JOIN Validadores v ON td.NumeroSerieValidador = v.NumeroSerie
      INNER JOIN Clientes c ON v.IdCliente = c.Id
      WHERE td.IdTipoTransaccion IN (2, 3)
        AND DATE(td.FHRegistro) BETWEEN ? AND ?
        ${clienteFilter}
    `;
    const query = querySolo;
    const params = [fechaInicio, fechaFin, ...clienteParams];
    const result = await this.clienteRepository.query(query, params);
    return {
      exitosas: Number(result[0]?.exitosas) || 0,
      fallidas: Number(result[0]?.fallidas) || 0,
    };
  }

  // 10. Cumplimiento de turnos y ocupación promedio
  // Cumplimiento: turnos iniciados en el período que ya se cerraron (Fin no
  // nulo; al cerrar, el turno queda en Estatus 0, así que no se filtra por él).
  // Ocupación: por viaje, abordajes del contador (Entradas) entre la capacidad
  // del vehículo, con tope de 100 %, promediado entre los viajes con conteo.
  // El contador guarda una fila acumulada por viaje, así que el pico a bordo no
  // se puede calcular. null si no hay conteos.
  private async getCumplimientoYOcupacion(
    clienteFilter: string,
    clienteParams: any[],
    fechaInicio: string,
    fechaFin: string,
  ) {
    const [turnos] = await this.clienteRepository.query(
      `
      SELECT COUNT(*) AS totalTurnos,
             COALESCE(SUM(t.Fin IS NOT NULL), 0) AS turnosCerrados
      FROM Turnos t
      INNER JOIN Clientes c ON c.Id = t.IdCliente
      WHERE DATE(t.Inicio) BETWEEN ? AND ?
        ${clienteFilter}
    `,
      [fechaInicio, fechaFin, ...clienteParams],
    );
    const [ocupacion] = await this.clienteRepository.query(
      `
      WITH abordajes AS (
        SELECT cp.IdViaje, SUM(COALESCE(cp.Entradas, 0)) AS entradas
        FROM ConteoPasajeros cp
        INNER JOIN Viajes vi ON vi.Id = cp.IdViaje
        INNER JOIN Clientes c ON c.Id = vi.IdCliente
        WHERE DATE(cp.FechaHora) BETWEEN ? AND ?
          ${clienteFilter}
        GROUP BY cp.IdViaje
      )
      SELECT COUNT(*) AS viajesConConteo,
             ROUND(AVG(LEAST(
               p.entradas / (veh.PasajerosSentados + veh.PasajerosParados),
               1
             )) * 100, 2) AS porcentaje
      FROM abordajes p
      INNER JOIN Viajes vi ON vi.Id = p.IdViaje
      INNER JOIN Turnos t ON t.Id = vi.IdTurno
      INNER JOIN Instalaciones i ON i.Id = t.IdInstalacion
      INNER JOIN Vehiculos veh ON veh.Id = i.IdVehiculo
      WHERE COALESCE(veh.PasajerosSentados, 0) + COALESCE(veh.PasajerosParados, 0) > 0
    `,
      [fechaInicio, fechaFin, ...clienteParams],
    );
    const totalTurnos = Number(turnos?.totalTurnos) || 0;
    const turnosCerrados = Number(turnos?.turnosCerrados) || 0;
    const viajesConConteo = Number(ocupacion?.viajesConConteo) || 0;
    return {
      cumplimientoTurnos: {
        totalTurnos,
        turnosCerrados,
        porcentaje: totalTurnos
          ? Math.round((turnosCerrados / totalTurnos) * 10000) / 100
          : null,
      },
      ocupacion: {
        viajesConConteo,
        porcentaje: viajesConConteo ? Number(ocupacion.porcentaje) : null,
      },
    };
  }

  // 9. Gráfica Ascensos vs Boletos (por viaje)
  private async getGraficaAscensosVsBoletos(
    clienteFilter: string,
    clienteFilter2: string,
    clienteParams: any[],
    fechaInicio: string,
    fechaFin: string,
    filtro: number,
  ) {
    // Boletos desde TransaccionesDebito (el histórico es su espejo)
    const queryBoletosSolo = `
      SELECT 
        td.IdViaje AS idViaje,
        COUNT(DISTINCT CASE WHEN td.ControlTransaccion = 0 THEN td.Id END) AS boletos
      FROM TransaccionesDebito td
      INNER JOIN Validadores v ON td.NumeroSerieValidador = v.NumeroSerie
      INNER JOIN Clientes c ON v.IdCliente = c.Id
      WHERE td.IdTipoTransaccion = 2
        AND td.IdViaje IS NOT NULL
        AND DATE(td.FHRegistro) BETWEEN ? AND ?
        ${clienteFilter}
      GROUP BY td.IdViaje
    `;
    const queryBoletos = queryBoletosSolo;
    const paramsBoletos = [fechaInicio, fechaFin, ...clienteParams];

    // Ascensos por viaje desde ConteoPasajeros (sin cambio por filtro)
    const queryAscensos = `
      SELECT 
        cp.IdViaje AS idViaje,
        SUM(cp.Entradas) AS ascensos
      FROM ConteoPasajeros cp
      INNER JOIN Viajes v ON cp.IdViaje = v.Id
      INNER JOIN Clientes c ON v.IdCliente = c.Id
      WHERE cp.IdViaje IS NOT NULL
        AND DATE(cp.FHRegistro) BETWEEN ? AND ?
        ${clienteFilter}
      GROUP BY cp.IdViaje
    `;

    const paramsAscensos =
      clienteParams.length > 0
        ? [fechaInicio, fechaFin, ...clienteParams]
        : [fechaInicio, fechaFin];

    const [boletosResult, ascensosResult] = await Promise.all([
      this.clienteRepository.query(queryBoletos, paramsBoletos),
      this.clienteRepository.query(queryAscensos, paramsAscensos),
    ]);

    // Crear mapas para facilitar la combinación
    const boletosMap = new Map<number, number>();
    boletosResult.forEach((item: any) => {
      boletosMap.set(Number(item.idViaje), Number(item.boletos) || 0);
    });

    const ascensosMap = new Map<number, number>();
    ascensosResult.forEach((item: any) => {
      ascensosMap.set(Number(item.idViaje), Number(item.ascensos) || 0);
    });

    // Combinar ambos resultados
    const allViajes = new Set([...boletosMap.keys(), ...ascensosMap.keys()]);
    const resultado = Array.from(allViajes).map((idViaje) => ({
      idViaje,
      boletos: boletosMap.get(idViaje) || 0,
      ascensos: ascensosMap.get(idViaje) || 0,
    }));

    return resultado.sort((a, b) => b.idViaje - a.idViaje);
  }
}
