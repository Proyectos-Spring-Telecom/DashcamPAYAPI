import { formatFechaDb, nowDb } from 'src/common/clock';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  clientesPermitidos,
  clienteHijosDesdeSp,
  tieneIdsTenant,
} from 'src/common/tenant/ownership-resolvers';
import { SecurityFlags } from 'src/common/security-flags';
import { assertDateWindow, assertIsoDate } from 'src/common/sql-date';
import { CreateTransaccioneRecargaDto } from './dto/create-transaccione-recarga.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull } from 'typeorm';
import { TransaccionesRecarga } from 'src/entities/TransaccionesRecarga';
import { TransaccionesDebito } from 'src/entities/TransaccionesDebito';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { Validadores } from 'src/entities/Validadores';
import { MonederosService } from 'src/monederos/monederos.service';
import { PasajerosService } from 'src/pasajeros/pasajeros.service';
import { NetpayService } from 'src/netpay/netpay.service';
import { Clientes } from 'src/entities/Clientes';
import { CreateTransaccioneDebitoDto } from './dto/create-transaccione-debito.dto';
import {
  EnumControlTransacciones,
  EnumModulos,
  EnumTipoDescuento,
  EnumTipoTransaccion,
  EnumTipoTarifa,
  EnumTipoDescuentoTransbordo,
  EnumMetodoPago,
  EstatusEnum,
} from 'src/common/estatus.enum';
import {
  transicionarEstado,
  EstadoTransaccion,
  EventoTransaccion,
} from '../utils/transaccion.util';
import { Monederos } from 'src/entities/Monederos';
import { CatTiposPasajeros } from 'src/entities/CatTiposPasajeros';

import { TransbordosPermitidos } from 'src/entities/TransbordosPermitidos';
import { DetalleTransbordos } from 'src/entities/DetalleTransbordos';
import { HistoricoTransaccionesDebito } from 'src/entities/HistoricoTransaccionesDebito';
import { HistoricoTransaccionesRecarga } from 'src/entities/HistoricoTransaccionesRecarga';
import { Viajes } from 'src/entities/Viajes';
import { Tarifas } from 'src/entities/Tarifas';
import { Variantes } from 'src/entities/Variantes';
import { Turnos } from 'src/entities/Turnos';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Pasajeros } from 'src/entities/Pasajeros';
import { DireccionesTarjeta } from 'src/entities/DireccionesTarjeta';
import { DatosTarjeta } from 'src/entities/DatosTarjeta';
import { QRCodes } from 'src/entities/QRCodes';
import { GetTransaccioneDto } from './dto/get-transacciones.dto';
import { GetHistoricoRecargasDto } from './dto/get-historico-recargas.dto';
import haversine from 'haversine-distance';
import { KeyedMutex } from 'src/common/keyed-mutex';

class IdempotenciaDuplicadaError extends Error {
  constructor(public readonly clave: string) {
    super('IDEMPOTENTE');
    this.name = 'IdempotenciaDuplicadaError';
  }
}

class SaldoInsuficienteTxError extends Error {
  constructor() {
    super('SALDO_INSUFICIENTE_TX');
    this.name = 'SaldoInsuficienteTxError';
  }
}

/** Reserva de claveIdempotencia de una recarga (tabla ReservasRecarga). */
interface ReservaRecarga {
  clave: string;
  estado: 'EN_PROCESO' | 'PENDIENTE_CONCILIAR';
  tokenId?: string;
}

@Injectable()
export class TransaccionesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TransaccionesService.name);
  private abiertaSweepTimer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectRepository(TransaccionesRecarga)
    private readonly transaccionesrecargaRepository: Repository<TransaccionesRecarga>,
    @InjectRepository(TransaccionesDebito)
    private readonly transaccionesdebitoRepository: Repository<TransaccionesDebito>,

    @InjectRepository(Validadores)
    private readonly validadorRepository: Repository<Validadores>,

    @InjectRepository(HistoricoTransaccionesDebito)
    private readonly historicoTransaccionesDebitoRepository: Repository<HistoricoTransaccionesDebito>,

    @InjectRepository(HistoricoTransaccionesRecarga)
    private readonly historicoTransaccionesRecargaRepository: Repository<HistoricoTransaccionesRecarga>,

    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    @InjectRepository(CatTiposPasajeros)
    private readonly CatTiposPasajerosRepository: Repository<CatTiposPasajeros>,
    @InjectRepository(Pasajeros)
    private readonly pasajeroRepository: Repository<Pasajeros>,
    @InjectRepository(Monederos)
    private readonly monederoRepository: Repository<Monederos>,
    @InjectRepository(TransbordosPermitidos)
    private readonly transbordosPermitidosRepository: Repository<TransbordosPermitidos>,
    @InjectRepository(DetalleTransbordos)
    private readonly detalleTransbordosRepository: Repository<DetalleTransbordos>,
    @InjectRepository(Viajes)
    private readonly viajesRepository: Repository<Viajes>,
    @InjectRepository(Tarifas)
    private readonly tarifasRepository: Repository<Tarifas>,
    @InjectRepository(Variantes)
    private readonly variantesRepository: Repository<Variantes>,
    @InjectRepository(Turnos)
    private readonly turnosRepository: Repository<Turnos>,
    @InjectRepository(Instalaciones)
    private readonly instalacionesRepository: Repository<Instalaciones>,
    @InjectRepository(DireccionesTarjeta)
    private readonly direccionesTarjetaRepository: Repository<DireccionesTarjeta>,
    @InjectRepository(DatosTarjeta)
    private readonly datosTarjetaRepository: Repository<DatosTarjeta>,
    @InjectRepository(QRCodes)
    private readonly qrCodesRepository: Repository<QRCodes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly monederosService: MonederosService,
    private readonly pasajeroService: PasajerosService,
    private readonly netpayService: NetpayService,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    const ttlHours = Number(process.env.ABIERTA_TTL_HOURS ?? 4);
    if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
      this.logger.log('Barrido de ABIERTAS desactivado (ABIERTA_TTL_HOURS<=0)');
      return;
    }
    const minutes = Number(process.env.ABIERTA_SWEEP_MINUTES ?? 15);
    const ms = Math.max(1, Number.isFinite(minutes) ? minutes : 15) * 60 * 1000;
    this.abiertaSweepTimer = setInterval(() => {
      this.cerrarAbiertasVencidas().catch((error) => {
        this.logger.error('Error en barrido de ABIERTAS vencidas');
      });
    }, ms);
    this.logger.log(
      `Barrido de ABIERTAS cada ${Math.max(1, Number.isFinite(minutes) ? minutes : 15)} min (TTL ${ttlHours}h)`,
    );
  }

  onModuleDestroy(): void {
    if (this.abiertaSweepTimer) {
      clearInterval(this.abiertaSweepTimer);
      this.abiertaSweepTimer = undefined;
    }
  }

  async cerrarAbiertasVencidas(): Promise<number> {
    const ttlHours = Number(process.env.ABIERTA_TTL_HOURS ?? 4);
    if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
      return 0;
    }

    const limite = new Date(nowDb().getTime() - ttlHours * 60 * 60 * 1000);
    const vencidas = await this.transaccionesdebitoRepository
      .createQueryBuilder('t')
      .where('t.controlTransaccion = :abierta', {
        abierta: EnumControlTransacciones.ABIERTA,
      })
      .andWhere('t.fechaHoraInicio IS NOT NULL')
      .andWhere('t.fechaHoraInicio <= :limite', {
        limite: formatFechaDb(limite),
      })
      .orderBy('t.id', 'ASC')
      .take(50)
      .getMany();

    let cerradas = 0;
    const sweepUserId = await this.resolveSweepUserId();

    for (const tx of vencidas) {
      try {
        await this.dataSource.transaction(async (manager) => {
          const monedero = await manager.getRepository(Monederos).findOne({
            where: { numeroSerie: tx.numeroSerieMonedero },
          });
          const cobro = Number(tx.cobroMaximo ?? tx.monto ?? 0);
          let cargo = Math.min(Math.max(cobro, 0), Math.max(Number(monedero?.saldo ?? 0), 0));

          const monederoActivo =
            monedero &&
            Number(monedero.estatus) === 1;

          if (cargo > 0 && monederoActivo) {
            let descontado = await this.monederosService.descontarSaldoAtomico(
              monedero.numeroSerie,
              cargo,
              sweepUserId,
              manager,
            );
            if (!descontado) {
              const fresco = await manager.getRepository(Monederos).findOne({
                where: { numeroSerie: tx.numeroSerieMonedero },
              });
              cargo = Math.min(
                Math.max(cobro, 0),
                Math.max(Number(fresco?.saldo ?? 0), 0),
              );
              if (cargo > 0) {
                descontado = await this.monederosService.descontarSaldoAtomico(
                  monedero.numeroSerie,
                  cargo,
                  sweepUserId,
                  manager,
                );
                if (!descontado) {
                  throw new Error('ABIERTA_SWEEP_SALDO');
                }
              }
            }
          } else {
            cargo = 0;
          }

          const cierre = await manager.getRepository(TransaccionesDebito).update(
            {
              id: tx.id,
              controlTransaccion: EnumControlTransacciones.ABIERTA,
            },
            {
              monto: parseFloat(cargo.toFixed(2)),
              controlTransaccion: EnumControlTransacciones.PAGADO,
              fechaHoraFinal: nowDb(),
            },
          );
          if (!cierre.affected) {
            throw new Error('ABIERTA_YA_CERRADA');
          }

          const actualizada = await manager
            .getRepository(TransaccionesDebito)
            .findOne({ where: { id: tx.id } });
          if (actualizada) {
            const { id: liveId, ...body } = actualizada;
            await manager.getRepository(HistoricoTransaccionesDebito).save({
              ...body,
              idTransaccionOrigen: Number(liveId),
            });
          }
        });
        cerradas += 1;
      } catch (error) {
        if (error instanceof Error && error.message === 'ABIERTA_YA_CERRADA') {
          continue;
        }
        if (error instanceof Error && error.message === 'ABIERTA_SWEEP_SALDO') {
          this.logger.warn(
            `ABIERTA ${tx.id}: saldo cambió; se reintenta en el siguiente barrido`,
          );
          continue;
        }
        this.logger.error(`Error cerrando ABIERTA ${tx.id}`);
      }
    }

    if (cerradas > 0) {
      this.logger.log(`Barrido ABIERTAS: ${cerradas} cerradas por vencimiento`);
    }
    return cerradas;
  }

  private async resolveSweepUserId(): Promise<number> {
    const rows = await this.dataSource.query(
      'SELECT Id AS id FROM Usuarios ORDER BY Id ASC LIMIT 1',
    );
    const id = Number(rows?.[0]?.id);
    return Number.isFinite(id) && id > 0 ? id : 1;
  }

  private async assertMonederoEnTenant(
    idClienteMonedero: number,
    clienteActor: number,
  ): Promise<void> {
    const permitidos = await clientesPermitidos(this.dataSource, clienteActor);
    if (!permitidos.includes(Number(idClienteMonedero))) {
      throw new NotFoundException('El monedero no fue encontrado.');
    }
  }

  private async assertDireccionDelTenant(
    idDireccion: number,
    monedero: {
      idPasajero?: number | null;
      customerId?: string | null;
      correoUsuario?: string | null;
      idCliente: number;
    },
    clienteActor: number,
  ): Promise<{
    direccion: DireccionesTarjeta;
    datosTarjeta: DatosTarjeta;
  }> {
    const direccion = await this.direccionesTarjetaRepository.findOne({
      where: { id: idDireccion },
      relations: ['idDatosTarjeta2'],
    });
    if (!direccion || !direccion.idDatosTarjeta) {
      throw new NotFoundException(
        `No se encontró la dirección con ID: ${idDireccion}`,
      );
    }
    const datosTarjeta = await this.datosTarjetaRepository.findOne({
      where: { id: direccion.idDatosTarjeta },
    });
    if (!datosTarjeta) {
      throw new NotFoundException(
        `No se encontraron los datos de tarjeta asociados a la dirección ${idDireccion}`,
      );
    }

    const customerId = datosTarjeta.customerIdNetPay || null;
    const email = (datosTarjeta.email || '').toLowerCase();
    const mismoCustomer =
      !!customerId &&
      !!monedero.customerId &&
      customerId === monedero.customerId;
    const mismoCorreo =
      !!email &&
      !!monedero.correoUsuario &&
      email === monedero.correoUsuario.toLowerCase();

    if (mismoCustomer || mismoCorreo) {
      return { direccion, datosTarjeta };
    }

    let pasajeroDueño: Pasajeros | null = null;
    if (customerId) {
      pasajeroDueño = await this.pasajeroRepository.findOne({
        where: { customerIdNetPay: customerId },
      });
    }
    if (!pasajeroDueño && email) {
      pasajeroDueño = await this.pasajeroRepository.findOne({
        where: { correo: email },
      });
    }
    if (!pasajeroDueño) {
      throw new NotFoundException(
        `No se encontró la dirección con ID: ${idDireccion}`,
      );
    }
    if (
      monedero.idPasajero != null &&
      Number(pasajeroDueño.id) !== Number(monedero.idPasajero)
    ) {
      throw new NotFoundException(
        `No se encontró la dirección con ID: ${idDireccion}`,
      );
    }
    const monederoDueño = await this.monederoRepository.findOne({
      where: { idPasajero: pasajeroDueño.id },
    });
    if (!monederoDueño) {
      throw new NotFoundException(
        `No se encontró la dirección con ID: ${idDireccion}`,
      );
    }
    await this.assertMonederoEnTenant(
      Number(monederoDueño.idCliente),
      clienteActor,
    );
    return { direccion, datosTarjeta };
  }

  /**
   * Transforma el valor de EsQR (0/1) a texto descriptivo
   * @param esQR Valor numérico (0 o 1) o null
   * @returns "Monedero Físico" si es 0, "Monedero QR" si es 1, null si es null
   */
  private transformarEsQR(esQR: number | null | undefined): string | null {
    if (esQR === null || esQR === undefined) {
      return null;
    }
    return esQR === 1 ? 'Monedero QR' : 'Monedero Físico';
  }

  /**
   * Calcula la distancia en kil?metros desde el punto inicial de la variante hasta el último punto de la variante,
   * sumando punto a punto a lo largo del recorridoDetallado
   * @param variante Variante con recorridoDetallado y puntoInicio
   * @param latitud Latitud del punto de la transacci?n
   * @param longitud Longitud del punto de la transacci?n
   * @param tarifaInfo Información de la tarifa (opcional) para calcular el extra potencial
   * @returns Distancia en kil?metros desde el punto inicial hasta el último punto de la variante, o 0 si no se puede calcular
   */
  private calcularDistanciaInicialKm(
    variante: Variantes | null,
    latitud: number,
    longitud: number,
    tarifaInfo?: {
      tarifaBase?: number;
      costoAdicional?: number;
      distanciaBaseKm?: number;
      incrementoCadaMetros?: number;
      tipoTarifa?: number;
    } | null,
  ): number {
    if (!variante?.recorridoDetallado) {
      return 0;
    }

    try {
      const recorrido = this.parsearRecorridoDetallado(
        variante.recorridoDetallado,
      );
      if (!recorrido || recorrido.length === 0) {
        return 0;
      }

      // Encontrar el punto más cercano del recorrido al punto de transacción
      const puntoTransaccion = { lat: latitud, lng: longitud };
      const puntoMasCercanoIndex = this.encontrarPuntoMasCercano(
        recorrido,
        puntoTransaccion,
      );

      let puntoMasCercano: { lat: number; lng: number } | null = null;
      let distanciaAlPuntoMasCercano = Infinity;

      if (
        puntoMasCercanoIndex !== -1 &&
        puntoMasCercanoIndex < recorrido.length
      ) {
        puntoMasCercano = recorrido[puntoMasCercanoIndex];
        if (puntoMasCercano) {
          distanciaAlPuntoMasCercano = haversine(
            puntoMasCercano,
            puntoTransaccion,
          );
        }
      }

      // Calcular distancia desde puntoInicio hasta el primer punto del recorrido (si son diferentes)
      const distanciaDesdePuntoInicio = this.calcularDistanciaDesdePuntoInicio(
        variante,
        recorrido[0],
      );

      // Calcular el tamaño total del recorridoDetallado (sumando punto por punto desde el primero hasta el último)
      const tamañoTotalRecorrido = this.calcularDistanciaAcumuladaRecorrido(
        recorrido,
        recorrido.length - 1, // Hasta el último punto
      );
      const tamañoTotalRecorridoKm = parseFloat(
        (tamañoTotalRecorrido / 1000).toFixed(2),
      );

      // Calcular distancia desde el punto de transacción hasta el punto 1 del recorrido
      // Esto incluye: distancia al punto más cercano + distancia desde ese punto hasta el punto 1
      let distanciaDesdeTransaccionHastaPunto1 = 0;

      if (puntoMasCercanoIndex !== -1 && puntoMasCercano) {
        // Distancia desde punto de transacción al punto más cercano
        const distanciaAlPuntoMasCercano = haversine(
          puntoTransaccion,
          puntoMasCercano,
        );

        // Si el punto más cercano es el punto 1, solo usamos la distancia directa
        if (puntoMasCercanoIndex === 0) {
          distanciaDesdeTransaccionHastaPunto1 = distanciaAlPuntoMasCercano;
        } else {
          // Calcular distancia desde el punto más cercano hasta el punto 1 (sumando punto por punto hacia atrás)
          const distanciaDesdePuntoMasCercanoHastaPunto1 =
            this.calcularDistanciaAcumuladaRecorrido(
              recorrido,
              puntoMasCercanoIndex,
            );

          // La distancia total es: distancia al punto más cercano + distancia desde ese punto hasta el punto 1
          distanciaDesdeTransaccionHastaPunto1 =
            distanciaAlPuntoMasCercano +
            distanciaDesdePuntoMasCercanoHastaPunto1;
        }
      } else {
        // Si no se encuentra punto cercano, calcular distancia directa al punto 1
        distanciaDesdeTransaccionHastaPunto1 = haversine(
          puntoTransaccion,
          recorrido[0],
        );
      }

      const distanciaEnKm = parseFloat(
        (distanciaDesdeTransaccionHastaPunto1 / 1000).toFixed(2),
      );

      // Imprimir en consola el cálculo detallado

      if (puntoMasCercanoIndex !== -1 && puntoMasCercano) {

        if (puntoMasCercanoIndex === 0) {
        } else {
          // Calcular distancia desde el punto más cercano hasta el punto 1
          const distanciaDesdePuntoMasCercanoHastaPunto1 =
            this.calcularDistanciaAcumuladaRecorrido(
              recorrido,
              puntoMasCercanoIndex,
            );

          // Imprimir detalle punto por punto desde punto más cercano hasta punto 1
          let distanciaAcumuladaHaciaPunto1 = 0;
          for (let i = puntoMasCercanoIndex; i > 0; i--) {
            const puntoActual = recorrido[i];
            const puntoAnterior = recorrido[i - 1];

            if (
              typeof puntoActual.lat === 'number' &&
              typeof puntoActual.lng === 'number' &&
              typeof puntoAnterior.lat === 'number' &&
              typeof puntoAnterior.lng === 'number'
            ) {
              const distanciaSegmento = haversine(puntoActual, puntoAnterior);
              distanciaAcumuladaHaciaPunto1 += distanciaSegmento;
            }
          }
        }
      } else {
      }


      // Imprimir detalle punto por punto del recorrido completo para mostrar el tamaño total
      let distanciaAcumuladaRecorridoCompleto = 0;
      for (let i = 0; i < recorrido.length - 1; i++) {
        const puntoActual = recorrido[i];
        const puntoSiguiente = recorrido[i + 1];

        if (
          typeof puntoActual.lat === 'number' &&
          typeof puntoActual.lng === 'number' &&
          typeof puntoSiguiente.lat === 'number' &&
          typeof puntoSiguiente.lng === 'number'
        ) {
          const distanciaSegmento = haversine(puntoActual, puntoSiguiente);
          distanciaAcumuladaRecorridoCompleto += distanciaSegmento;
        }
      }

      // Calcular y mostrar información de tarifa y extra potencial
      if (tarifaInfo) {
        const tarifaBase = tarifaInfo.tarifaBase || 0;
        const costoAdicional = tarifaInfo.costoAdicional || 0;
        const distanciaBaseKm = tarifaInfo.distanciaBaseKm || 0;
        const incrementoCadaMetros = tarifaInfo.incrementoCadaMetros || 0;
        const tipoTarifa = tarifaInfo.tipoTarifa;

        // INCREMENTAL = 2 según el usuario
        const esTarifaIncremental = tipoTarifa === 2; // Valor 2 corresponde a INCREMENTAL
        const nombreTipoTarifa =
          tipoTarifa === 1
            ? 'FIJA'
            : tipoTarifa === 2
              ? 'INCREMENTAL'
              : 'DESCONOCIDO';

        // Solo calcular el extra potencial si la tarifa es INCREMENTAL (valor 2) y tiene configuración de costo adicional
        if (
          esTarifaIncremental &&
          costoAdicional > 0 &&
          incrementoCadaMetros > 0
        ) {
          const distanciaTotalMetros = distanciaAcumuladaRecorridoCompleto;
          const distanciaBaseMetros = distanciaBaseKm * 1000;

          // Calcular cuántos incrementos se aplicarían si hace el recorrido completo
          let extraPotencial = 0;
          if (distanciaTotalMetros > distanciaBaseMetros) {
            const distanciaExcedente =
              distanciaTotalMetros - distanciaBaseMetros;
            const numeroIncrementos = Math.ceil(
              distanciaExcedente / incrementoCadaMetros,
            );
            extraPotencial = numeroIncrementos * costoAdicional;

          } else {
          }
        } else {
          if (!esTarifaIncremental) {
          } else {
          }
        }
      } else {
      }


      return isNaN(distanciaEnKm) || distanciaEnKm < 0 ? 0 : distanciaEnKm;
    } catch (error) {
      this.logger.error('Error al calcular distancia inicial');
      return 0;
    }
  }

  /**
   * Calcula el cobro máximo potencial basado en la tarifa y la distancia restante desde el punto inicial hasta el último punto del recorrido
   * Solo se calcula para tarifas INCREMENTAL (tipoTarifa === 2)
   * @param variante Variante con recorridoDetallado
   * @param tarifaInfo Información de la tarifa
   * @param latitudInicial Latitud del punto inicial de la transacción
   * @param longitudInicial Longitud del punto inicial de la transacción
   * @returns Cobro máximo potencial o null si no aplica
   */
  private calcularCobroMaximo(
    variante: Variantes | null,
    tarifaInfo?: {
      tarifaBase?: number;
      costoAdicional?: number;
      distanciaBaseKm?: number;
      incrementoCadaMetros?: number;
      tipoTarifa?: number;
    } | null,
    latitudInicial?: number,
    longitudInicial?: number,
  ): number | null {
    if (!variante?.recorridoDetallado || !tarifaInfo) {
      return null;
    }

    const tipoTarifa = tarifaInfo.tipoTarifa;
    // Solo calcular para tarifas INCREMENTAL (tipoTarifa === 2)
    if (tipoTarifa !== 2) {
      return null;
    }

    const tarifaBase = tarifaInfo.tarifaBase || 0;
    const costoAdicional = tarifaInfo.costoAdicional || 0;
    const distanciaBaseKm = tarifaInfo.distanciaBaseKm || 0;
    const incrementoCadaMetros = tarifaInfo.incrementoCadaMetros || 0;

    // Si no hay configuración de costo adicional, el cobro máximo es solo la tarifa base
    if (costoAdicional <= 0 || incrementoCadaMetros <= 0) {
      return tarifaBase;
    }

    try {
      const recorrido = this.parsearRecorridoDetallado(
        variante.recorridoDetallado,
      );
      if (!recorrido || recorrido.length === 0) {
        return tarifaBase;
      }

      let distanciaRestanteMetros = 0;

      // Si se proporcionan coordenadas iniciales, calcular distancia desde ese punto hasta el último punto del recorrido
      if (latitudInicial !== undefined && longitudInicial !== undefined) {
        const puntoInicial = { lat: latitudInicial, lng: longitudInicial };
        const ultimoPunto = recorrido[recorrido.length - 1];

        // Encontrar el punto más cercano del recorrido al punto inicial
        const puntoMasCercanoIndex = this.encontrarPuntoMasCercano(
          recorrido,
          puntoInicial,
        );

        if (
          puntoMasCercanoIndex !== -1 &&
          puntoMasCercanoIndex < recorrido.length
        ) {
          const puntoMasCercano = recorrido[puntoMasCercanoIndex];

          // Distancia desde punto inicial hasta el punto más cercano
          const distanciaAlPuntoMasCercano = haversine(
            puntoInicial,
            puntoMasCercano,
          );

          // Distancia desde el punto más cercano hasta el último punto del recorrido
          // Calcular distancia acumulada desde el punto más cercano hasta el último punto
          let distanciaDesdePuntoMasCercanoHastaUltimo = 0;
          if (puntoMasCercanoIndex < recorrido.length - 1) {
            // Sumar punto por punto desde el punto más cercano hasta el último
            for (let i = puntoMasCercanoIndex; i < recorrido.length - 1; i++) {
              const puntoActual = recorrido[i];
              const puntoSiguiente = recorrido[i + 1];
              if (
                typeof puntoActual.lat === 'number' &&
                typeof puntoActual.lng === 'number' &&
                typeof puntoSiguiente.lat === 'number' &&
                typeof puntoSiguiente.lng === 'number'
              ) {
                distanciaDesdePuntoMasCercanoHastaUltimo += haversine(
                  puntoActual,
                  puntoSiguiente,
                );
              }
            }
          }

          // Distancia total restante = distancia al punto más cercano + distancia desde ese punto hasta el último
          distanciaRestanteMetros =
            distanciaAlPuntoMasCercano +
            distanciaDesdePuntoMasCercanoHastaUltimo;

        } else {
          // Si no se encuentra punto cercano, calcular distancia directa al último punto
          distanciaRestanteMetros = haversine(puntoInicial, ultimoPunto);
        }
      } else {
        // Si no se proporcionan coordenadas iniciales, usar la distancia total del recorrido (comportamiento anterior)
        distanciaRestanteMetros = this.calcularDistanciaAcumuladaRecorrido(
          recorrido,
          recorrido.length - 1,
        );
      }

      const distanciaBaseMetros = distanciaBaseKm * 1000;

      // Si la distancia restante está dentro de la distancia base, el cobro máximo es solo la tarifa base
      if (distanciaRestanteMetros <= distanciaBaseMetros) {
        return tarifaBase;
      }

      // Calcular cuántos incrementos se aplicarían con la distancia restante
      const distanciaExcedente = distanciaRestanteMetros - distanciaBaseMetros;
      const numeroIncrementos = Math.ceil(
        distanciaExcedente / incrementoCadaMetros,
      );
      const extraMaximo = numeroIncrementos * costoAdicional;
      const cobroMaximo = tarifaBase + extraMaximo;


      return parseFloat(cobroMaximo.toFixed(2));
    } catch (error) {
      this.logger.error('Error al calcular cobro máximo');
      return tarifaBase; // En caso de error, retornar al menos la tarifa base
    }
  }

  /**
   * Parsea el recorridoDetallado que puede venir como string JSON o como objeto
   * @param recorridoDetallado Recorrido detallado en formato string o array
   * @returns Array de puntos con lat y lng, o null si no se puede parsear
   */
  private parsearRecorridoDetallado(
    recorridoDetallado: object | null,
  ): Array<{ lat: number; lng: number }> | null {
    if (!recorridoDetallado) {
      return null;
    }

    try {
      if (typeof recorridoDetallado === 'string') {
        return JSON.parse(recorridoDetallado);
      }

      return recorridoDetallado as Array<{ lat: number; lng: number }>;
    } catch {
      return null;
    }
  }

  /**
   * Extrae las coordenadas del puntoInicio de la variante
   * Soporta dos formatos: { lat, lng } o { direccion, coordenadas: { lat, lng } }
   * @param puntoInicio Punto de inicio de la variante
   * @returns Coordenadas { lat, lng } o null si no se pueden extraer
   */
  private extraerCoordenadasPuntoInicio(
    puntoInicio: object | null,
  ): { lat: number; lng: number } | null {
    if (!puntoInicio) {
      return null;
    }

    const puntoInicioRaw = puntoInicio as any;
    let lat: number | undefined;
    let lng: number | undefined;

    if (puntoInicioRaw.coordenadas) {
      lat = puntoInicioRaw.coordenadas.lat;
      lng = puntoInicioRaw.coordenadas.lng;
    } else if (
      puntoInicioRaw.lat !== undefined &&
      puntoInicioRaw.lng !== undefined
    ) {
      lat = puntoInicioRaw.lat;
      lng = puntoInicioRaw.lng;
    }

    if (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      !isNaN(lat) &&
      !isNaN(lng)
    ) {
      return { lat, lng };
    }

    return null;
  }

  /**
   * Encuentra el ?ndice del punto m?s cercano en el recorrido al punto de transacci?n
   * @param recorrido Array de puntos del recorrido
   * @param puntoTransaccion Punto de la transacci?n
   * @returns ?ndice del punto m?s cercano, o -1 si no se encuentra
   */
  private encontrarPuntoMasCercano(
    recorrido: Array<{ lat: number; lng: number }>,
    puntoTransaccion: { lat: number; lng: number },
  ): number {
    let puntoMasCercanoIndex = -1;
    let distanciaMinima = Infinity;

    for (let i = 0; i < recorrido.length; i++) {
      const punto = recorrido[i];

      if (typeof punto.lat !== 'number' || typeof punto.lng !== 'number') {
        continue;
      }

      const distancia = haversine(punto, puntoTransaccion);

      if (distancia < distanciaMinima) {
        distanciaMinima = distancia;
        puntoMasCercanoIndex = i;
      }
    }

    return puntoMasCercanoIndex;
  }

  /**
   * Calcula la distancia desde el puntoInicio de la variante hasta el primer punto del recorrido
   * @param variante Variante con puntoInicio
   * @param primerPuntoRecorrido Primer punto del recorridoDetallado
   * @returns Distancia en metros, o 0 si no se puede calcular o si son el mismo punto
   */
  private calcularDistanciaDesdePuntoInicio(
    variante: Variantes,
    primerPuntoRecorrido: { lat: number; lng: number },
  ): number {
    if (
      !variante.puntoInicio ||
      typeof primerPuntoRecorrido.lat !== 'number' ||
      typeof primerPuntoRecorrido.lng !== 'number'
    ) {
      return 0;
    }

    const coordenadasPuntoInicio = this.extraerCoordenadasPuntoInicio(
      variante.puntoInicio,
    );
    if (!coordenadasPuntoInicio) {
      return 0;
    }

    const distancia = haversine(coordenadasPuntoInicio, primerPuntoRecorrido);

    // Si la distancia es menor a 10 metros, consideramos que son el mismo punto
    return distancia > 10 ? distancia : 0;
  }

  /**
   * Calcula la distancia acumulada sumando punto a punto a lo largo del recorrido
   * desde el ?ndice 0 hasta el ?ndice del punto m?s cercano
   * @param recorrido Array de puntos del recorrido
   * @param puntoMasCercanoIndex ?ndice del punto m?s cercano
   * @returns Distancia acumulada en metros
   */
  private calcularDistanciaAcumuladaRecorrido(
    recorrido: Array<{ lat: number; lng: number }>,
    puntoMasCercanoIndex: number,
  ): number {
    if (puntoMasCercanoIndex <= 0) {
      return 0;
    }

    let distanciaAcumulada = 0;

    for (let i = 0; i < puntoMasCercanoIndex; i++) {
      const puntoActual = recorrido[i];
      const puntoSiguiente = recorrido[i + 1];

      if (
        typeof puntoActual.lat === 'number' &&
        typeof puntoActual.lng === 'number' &&
        typeof puntoSiguiente.lat === 'number' &&
        typeof puntoSiguiente.lng === 'number'
      ) {
        const distanciaSegmento = haversine(puntoActual, puntoSiguiente);
        distanciaAcumulada += distanciaSegmento;
      }
    }

    return distanciaAcumulada;
  }

  // ========================================
  // Recarga con la claveIdempotencia reservada antes de cobrar (R3 / V2-15)
  // ========================================
  async createTransaccionRecarga(
    createTransaccioneRecargaDto: CreateTransaccioneRecargaDto,
    idUser: number,
    rol = 0,
    cliente = 0,
  ): Promise<ApiCrudResponse> {
    const clave = createTransaccioneRecargaDto.claveIdempotencia?.trim() || null;
    if (!clave) {
      return this.procesarRecarga(createTransaccioneRecargaDto, idUser, rol, cliente, null);
    }

    const previa = await this.recargaPorClave(clave, createTransaccioneRecargaDto);
    if (previa) return previa;

    // INSERT IGNORE sobre la PK: solo una petición con esta clave llega a NetPay.
    const insert: { affectedRows?: number } =
      await this.transaccionesrecargaRepository.query(
        `INSERT IGNORE INTO ReservasRecarga
           (ClaveIdempotencia, NumeroSerieMonedero, Monto, IdUsuario, Estado)
         VALUES (?, ?, ?, ?, 'EN_PROCESO')`,
        [
          clave,
          createTransaccioneRecargaDto.numeroSerieMonedero,
          Number(createTransaccioneRecargaDto.monto),
          idUser,
        ],
      );
    if (Number(insert?.affectedRows ?? 0) !== 1) {
      const ganadora = await this.recargaPorClave(clave, createTransaccioneRecargaDto);
      if (ganadora) return ganadora;
      throw new ConflictException(
        'Ya hay una recarga en proceso con esa claveIdempotencia.',
      );
    }

    const reserva: ReservaRecarga = { clave, estado: 'EN_PROCESO' };
    try {
      const result = await this.procesarRecarga(
        createTransaccioneRecargaDto,
        idUser,
        rol,
        cliente,
        reserva,
      );
      await this.transaccionesrecargaRepository.query(
        `UPDATE ReservasRecarga SET Estado = 'COMPLETADA', IdTransaccionRecarga = ?
          WHERE ClaveIdempotencia = ?`,
        [Number(result.data?.id) || null, clave],
      );
      return result;
    } catch (error) {
      if (reserva.estado === 'PENDIENTE_CONCILIAR') {
        // NetPay cobró, no hubo recarga ni reembolso: la clave queda tomada
        // para que un reintento no cobre otra vez, y la fila queda por conciliar.
        await this.transaccionesrecargaRepository.query(
          `UPDATE ReservasRecarga SET Estado = 'PENDIENTE_CONCILIAR', TransactionTokenIdNetPay = ?
            WHERE ClaveIdempotencia = ?`,
          [reserva.tokenId ?? null, clave],
        );
      } else {
        // No se cobró, o se cobró y se reembolsó: el cliente puede reintentar.
        await this.transaccionesrecargaRepository.query(
          'DELETE FROM ReservasRecarga WHERE ClaveIdempotencia = ? AND Estado = ?',
          [clave, 'EN_PROCESO'],
        );
      }
      throw error;
    }
  }

  /**
   * Respuesta idempotente si la clave ya produjo una recarga. Una clave usada
   * para otro monedero u otro monto es un error del cliente, no un reintento:
   * antes se devolvía la recarga ajena como si fuera la propia (V2-15).
   */
  private async recargaPorClave(
    clave: string,
    dto: CreateTransaccioneRecargaDto,
  ): Promise<ApiCrudResponse | null> {
    const previa = await this.transaccionesrecargaRepository.findOne({
      where: { claveIdempotencia: clave },
      order: { id: 'ASC' },
    });
    if (!previa) return null;
    if (
      previa.numeroSerieMonedero !== dto.numeroSerieMonedero ||
      Number(previa.monto) !== Number(dto.monto)
    ) {
      throw new ConflictException(
        'La claveIdempotencia ya se usó para otra recarga.',
      );
    }
    return {
      status: 'success',
      message: 'Transacción ya procesada (idempotencia)',
      data: {
        id: Number(previa.id),
        nombre: previa.numeroSerieMonedero || '',
      },
    };
  }

  private async procesarRecarga(
    createTransaccioneRecargaDto: CreateTransaccioneRecargaDto,
    idUser: number,
    rol: number,
    cliente: number,
    reserva: ReservaRecarga | null,
  ): Promise<ApiCrudResponse> {
    try {
      // Validar que idMetodoPago sea obligatorio
      if (!createTransaccioneRecargaDto.idMetodoPago) {
        throw new BadRequestException(
          'El campo idMetodoPago es obligatorio para crear una recarga.',
        );
      }

      if (
        createTransaccioneRecargaDto.monto == null ||
        Number(createTransaccioneRecargaDto.monto) <= 0
      ) {
        throw new BadRequestException('El monto debe ser mayor a 0');
      }
      const tope = Number(process.env.RECARGA_MONTO_MAX ?? 10000);
      if (Number(createTransaccioneRecargaDto.monto) > tope) {
        throw new BadRequestException(
          `El monto excede el tope permitido (${tope})`,
        );
      }

      const esEfectivoOTransferencia =
        createTransaccioneRecargaDto.idMetodoPago ===
          EnumMetodoPago.EFECTIVO ||
        createTransaccioneRecargaDto.idMetodoPago ===
          EnumMetodoPago.TRANSFERENCIA;
      // Regla de negocio: la tarjeta solo la usa el pasajero desde su propia
      // sesión; caja, administración y operadores recargan en efectivo.
      if (!esEfectivoOTransferencia && Number(rol) !== 9) {
        throw new ForbiddenException(
          'Las recargas con tarjeta solo las hace el pasajero desde su sesión.',
        );
      }
      if (esEfectivoOTransferencia && Number(rol) === 9) {
        throw new ForbiddenException(
          'El rol de pasajero no puede recargar en efectivo.',
        );
      }
      if (
        esEfectivoOTransferencia &&
        SecurityFlags.cashRechargeRoles() &&
        ![1, 2, 3, 11].includes(Number(rol))
      ) {
        throw new ForbiddenException(
          'Solo caja, administración o validador pueden recargar en efectivo.',
        );
      }

      const claveIdempotencia =
        createTransaccioneRecargaDto.claveIdempotencia?.trim() || null;
      if (SecurityFlags.idempotencyKey() && !claveIdempotencia) {
        throw new BadRequestException(
          'El campo claveIdempotencia es obligatorio',
        );
      }
      if (claveIdempotencia && !reserva) {
        const previa = await this.recargaPorClave(
          claveIdempotencia,
          createTransaccioneRecargaDto,
        );
        if (previa) return previa;
      }

      const monedero = await this.monederosService.findOneMonederoBySerie(
        createTransaccioneRecargaDto.numeroSerieMonedero,
      );
      await this.assertMonederoEnTenant(
        Number(monedero.data.idCliente),
        cliente,
      );

      // ✅ Si el método de pago es Tarjeta (3 o 4), primero procesar el pago con Netpay
      let pagoNetpayResponse: any = null;
      if (
        createTransaccioneRecargaDto.idMetodoPago ===
          EnumMetodoPago.TARJETA_CREDITO ||
        createTransaccioneRecargaDto.idMetodoPago ===
          EnumMetodoPago.TARJETA_DEBITO
      ) {

        // Validar que se hayan proporcionado todos los datos necesarios
        if (!createTransaccioneRecargaDto.tokenCardNetPay) {
          throw new BadRequestException(
            'El tokenCardNetPay es obligatorio cuando el método de pago es Tarjeta',
          );
        }
        if (!createTransaccioneRecargaDto.referenceIdNetPay) {
          throw new BadRequestException(
            'El referenceIdNetPay es obligatorio cuando el método de pago es Tarjeta',
          );
        }
        if (!createTransaccioneRecargaDto.sessionId) {
          throw new BadRequestException(
            'El sessionId es obligatorio cuando el método de pago es Tarjeta',
          );
        }
        if (!createTransaccioneRecargaDto.deviceFingerPrint) {
          throw new BadRequestException(
            'El deviceFingerPrint es obligatorio cuando el método de pago es Tarjeta',
          );
        }
        if (!createTransaccioneRecargaDto.idDireccion) {
          throw new BadRequestException(
            'El idDireccion es obligatorio cuando el método de pago es Tarjeta',
          );
        }

        const { datosTarjeta, direccion } = await this.assertDireccionDelTenant(
          createTransaccioneRecargaDto.idDireccion,
          monedero.data,
          cliente,
        );

        // Construir el objeto billing con los datos de la BD
        const billing = {
          firstName: datosTarjeta.nombre || '',
          lastName: datosTarjeta.apellidoMaterno ?? undefined,
          email: 'accept@netpay.com.mx',
          phone: datosTarjeta.telefono || '',
          address: {
            city: direccion.ciudad || '',
            country: direccion.pais || 'MX',
            postalCode: direccion.cp || '',
            state: direccion.estado || '',
            street1: direccion.calle || '',
            street2: direccion.calleEsquina || '',
          },
          merchantReferenceCode: createTransaccioneRecargaDto.referenceIdNetPay,
        };

        // Construir el payload para Netpay
        const paymentPayload = {
          amount: createTransaccioneRecargaDto.monto,
          description: `Recarga monedero ${createTransaccioneRecargaDto.numeroSerieMonedero}`,
          currency: 'MXN',
          referenceId: createTransaccioneRecargaDto.referenceIdNetPay,
          token: createTransaccioneRecargaDto.tokenCardNetPay,
          sessionId: createTransaccioneRecargaDto.deviceFingerPrint,
          deviceFingerPrint: createTransaccioneRecargaDto.deviceFingerPrint,
          saveCard: 'false',
          billing: billing,
          deviceInformation: createTransaccioneRecargaDto.deviceInformation || {
            deviceChannel: 'Browser',
            httpBrowserColorDepth: '24',
            httpBrowserJavaEnabled: 'FALSE',
            httpBrowserJavaScriptEnabled: 'TRUE',
            httpBrowserLanguage: 'es',
            httpBrowserScreenHeight: '687',
            httpBrowserScreenWidth: '1718',
            httpBrowserTimeDifference: '360',
          },
        };
        // No loguear el payload de pago (token de tarjeta / PCI).
        try {
          // Procesar el pago con Netpay
          pagoNetpayResponse =
            await this.netpayService.processPaymentWithSavedCard(
              paymentPayload,
              { userId: idUser, cliente, rol },
            );

          // Verificar si el pago fue exitoso
          // Solo se realiza la recarga si el status es 'success'
          if (!pagoNetpayResponse) {
            throw new BadRequestException('No se recibió respuesta de Netpay');
          }

          const status = pagoNetpayResponse.status;

          // Solo proceder con la recarga si el status es 'success'
          if (status !== 'success') {
            throw new BadRequestException(
              `El pago con tarjeta no fue exitoso. Status: ${status}. ` +
                `Mensaje: ${pagoNetpayResponse?.message || 'Sin mensaje'}. ` +
                `La recarga no se realizará.`,
            );
          }
        } catch (error) {
          this.logger.error('Error al procesar pago con Netpay');

          // Registrar en bitácora el error de pago
          await this.bitacoraLogger.logToBitacora(
            'Transacciones',
            `Error al procesar pago con Netpay para recarga de ${createTransaccioneRecargaDto.numeroSerieMonedero}`,
            'CREATE',
            {
              numeroSerieMonedero:
                createTransaccioneRecargaDto.numeroSerieMonedero,
              idMetodoPago: createTransaccioneRecargaDto.idMetodoPago,
            },
            idUser,
            EnumModulos.TRANSACCIONES,
            EstatusEnumBitcora.ERROR,
          );

          throw new BadRequestException(
            'No se pudo procesar el pago con tarjeta. La recarga no se realizó.',
          );
        }
      }

      const montoFinal = Number(createTransaccioneRecargaDto.monto);

      let transaccionSave;
      try {
        transaccionSave = await this.dataSource.transaction(
        async (manager) => {
          const incrementado =
            await this.monederosService.incrementarSaldoAtomico(
              createTransaccioneRecargaDto.numeroSerieMonedero,
              montoFinal,
              idUser,
              manager,
            );
          if (!incrementado) {
            throw new NotFoundException('El monedero no fue encontrado.');
          }
          const newTransaccion = manager.create(TransaccionesRecarga, {
            monto: createTransaccioneRecargaDto.monto,
            latitudFinal: createTransaccioneRecargaDto.latitudInicial,
            longitudFinal: createTransaccioneRecargaDto.longitudInicial,
            numeroSerieMonedero:
              createTransaccioneRecargaDto.numeroSerieMonedero,
            numeroSerieValidador:
              createTransaccioneRecargaDto.numeroSerieValidador,
            idUsuario: idUser,
            idMetodoPago: createTransaccioneRecargaDto.idMetodoPago,
            idTipoTransaccion: EnumTipoTransaccion.RECARGA,
            controlTransaccion: EnumControlTransacciones.PAGADO,
            claveIdempotencia,
            tokenCardNetPay:
              createTransaccioneRecargaDto.idMetodoPago ===
                EnumMetodoPago.TARJETA_CREDITO ||
              createTransaccioneRecargaDto.idMetodoPago ===
                EnumMetodoPago.TARJETA_DEBITO
                ? createTransaccioneRecargaDto.tokenCardNetPay || null
                : null,
            transactionTokenIdNetPay:
              createTransaccioneRecargaDto.idMetodoPago ===
                EnumMetodoPago.TARJETA_CREDITO ||
              createTransaccioneRecargaDto.idMetodoPago ===
                EnumMetodoPago.TARJETA_DEBITO
                ? pagoNetpayResponse?.transactionTokenId || null
                : null,
            referenceIdNetPay:
              createTransaccioneRecargaDto.idMetodoPago ===
                EnumMetodoPago.TARJETA_CREDITO ||
              createTransaccioneRecargaDto.idMetodoPago ===
                EnumMetodoPago.TARJETA_DEBITO
                ? createTransaccioneRecargaDto.referenceIdNetPay || null
                : null,
          });
          return manager.save(newTransaccion);
        },
        );
      } catch (commitError) {
        const tokenId = pagoNetpayResponse?.transactionTokenId;
        if (tokenId) {
          try {
            // Llamada de sistema: cancelOrRefund exige actor y lanzaba Forbidden (R3).
            await this.netpayService.reembolsarCompensacion(tokenId);
          } catch (refundError) {
            this.logger.error(
              `Cobro NetPay ${tokenId} sin recarga ni reembolso: queda PENDIENTE_CONCILIAR (${(refundError as Error)?.message})`,
            );
            if (reserva) {
              reserva.estado = 'PENDIENTE_CONCILIAR';
              reserva.tokenId = tokenId;
            } else {
              await this.transaccionesrecargaRepository.query(
                `INSERT INTO ReservasRecarga
                   (ClaveIdempotencia, NumeroSerieMonedero, Monto, IdUsuario, Estado, TransactionTokenIdNetPay)
                 VALUES (?, ?, ?, ?, 'PENDIENTE_CONCILIAR', ?)`,
                [
                  `sin-clave:${tokenId}`.slice(0, 100),
                  createTransaccioneRecargaDto.numeroSerieMonedero,
                  Number(createTransaccioneRecargaDto.monto),
                  idUser,
                  tokenId,
                ],
              );
            }
            this.bitacoraLogger.registrar([
              'Transacciones',
              'Compensación NetPay fallida tras error al persistir recarga: PENDIENTE_CONCILIAR',
              'CREATE',
              {
                numeroSerieMonedero:
                  createTransaccioneRecargaDto.numeroSerieMonedero,
                transactionTokenIdNetPay: tokenId,
              },
              idUser,
              EnumModulos.TRANSACCIONES,
              EstatusEnumBitcora.ERROR,
            ]);
          }
        }
        throw commitError;
      }

      const querylogger = {
        id: Number(transaccionSave.id),
        numeroSerieMonedero: createTransaccioneRecargaDto.numeroSerieMonedero,
        idMetodoPago: createTransaccioneRecargaDto.idMetodoPago,
      };
      await this.bitacoraLogger.logToBitacora(
        'Transacciones',
        `Se realizo una transaccion de tipo RECARGA`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.TRANSACCIONES,
        EstatusEnumBitcora.SUCCESS,
      );

      //API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Transaccion creado correctamente',
        data: {
          id: Number(transaccionSave.id),
          nombre:
            `${createTransaccioneRecargaDto.numeroSerieMonedero} ${montoFinal} ` ||
            '',
        },
      };
      return result;
    } catch (error) {
      // --- Registro en la bitácora --- ERROR
      const querylogger = {
        numeroSerieMonedero: createTransaccioneRecargaDto.numeroSerieMonedero,
        idMetodoPago: createTransaccioneRecargaDto.idMetodoPago,
      };
      await this.bitacoraLogger.logToBitacora(
        'Transacciones',
        `Error al realizar una transaccion de tipo RECARGA`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.TRANSACCIONES,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Error generar la transaccion de tipo RECARGA`,
      );
    }
  }

  /**
   * Respuesta idempotente de un débito. Si la clave pertenece a otro monedero
   * es 409: antes se devolvía la transacción ajena como propia (V2-15).
   */
  private async debitoPorClave(
    clave: string,
    numeroSerieMonedero: string,
  ): Promise<ApiCrudResponse | null> {
    const previa = await this.transaccionesdebitoRepository.findOne({
      where: { claveIdempotencia: clave },
      order: { id: 'ASC' },
    });
    if (!previa) return null;
    if (previa.numeroSerieMonedero !== numeroSerieMonedero) {
      throw new ConflictException(
        'La claveIdempotencia ya se usó para otro monedero.',
      );
    }
    return {
      status: 'success',
      message: 'Transacción ya procesada (idempotencia)',
      data: {
        id: Number(previa.id),
        nombre: previa.numeroSerieMonedero || '',
      },
    };
  }

  private readonly lockMonedero = new KeyedMutex();

  /** Un débito a la vez por monedero (H-08): dos lecturas de la misma tarjeta no se cruzan. */
  async createTransaccionDebitoPrueba(
    createTransaccioneDebitoDto: CreateTransaccioneDebitoDto,
    idUser: number,
    cliente: number,
  ): Promise<ApiCrudResponse> {
    const llave =
      createTransaccioneDebitoDto.esQR === true
        ? `serie:${createTransaccioneDebitoDto.numeroSerieMonedero ?? ''}`
        : `card:${createTransaccioneDebitoDto.idCard ?? ''}`;
    return this.lockMonedero.run(llave, () =>
      this.procesarDebito(createTransaccioneDebitoDto, idUser, cliente),
    );
  }

  private async procesarDebito(
    createTransaccioneDebitoDto: CreateTransaccioneDebitoDto,
    idUser: number,
    cliente: number,
  ): Promise<ApiCrudResponse> {
    let estado: EstadoTransaccion = EstadoTransaccion.INICIADA;

    try {
      // 1?? Cambiamos estado a VALIDANDO_SALDO
      estado = transicionarEstado(estado, EventoTransaccion.CREAR);

      // 1.1?? Idempotencia: si el dispositivo reintenta el mismo cobro con la
      // misma claveIdempotencia, devolvemos la transacción ya registrada en
      // lugar de volver a cobrar. Cubre el reintento del dispositivo (secuencial).
      const claveIdempotencia =
        createTransaccioneDebitoDto.claveIdempotencia?.trim() || null;
      if (SecurityFlags.idempotencyKey() && !claveIdempotencia) {
        throw new BadRequestException(
          'El campo claveIdempotencia es obligatorio',
        );
      }
      // 2?? Buscamos el monedero
      let monedero;
      if (createTransaccioneDebitoDto.esQR === true) {
        // Si esQR es true, buscar por numeroSerieMonedero
        monedero = await this.monederoRepository.findOne({
          where: {
            numeroSerie: createTransaccioneDebitoDto.numeroSerieMonedero,
            estatus: 1,
          },
        });
      } else {
        // Si esQR es false, buscar por idCard
        monedero = await this.monederoRepository.findOne({
          where: {
            idCard: createTransaccioneDebitoDto.idCard,
            estatus: 1,
          },
        });
      }
      if (!monedero) {
        estado = EstadoTransaccion.ERROR;
        throw new BadRequestException('Monedero no encontrado');
      }
      await this.assertMonederoEnTenant(Number(monedero.idCliente), cliente);
      // Pasajero desactivado: no se cobra (el monedero sigue en Estatus 1
      // porque ahí 0 significa "sin asignar").
      if (monedero.idPasajero) {
        const pasajero = await this.pasajeroRepository.findOne({
          where: { id: monedero.idPasajero },
          select: { id: true, estatus: true },
        });
        if (pasajero && Number(pasajero.estatus) !== 1) {
          estado = EstadoTransaccion.ERROR;
          throw new BadRequestException('Pasajero desactivado');
        }
      }
      if (createTransaccioneDebitoDto.numeroSerieValidador) {
        const validador = await this.validadorRepository.findOne({
          where: {
            numeroSerie: createTransaccioneDebitoDto.numeroSerieValidador,
          },
        });
        if (
          !validador ||
          Number(validador.idCliente) !== Number(monedero.idCliente)
        ) {
          estado = EstadoTransaccion.ERROR;
          throw new BadRequestException('Monedero no encontrado');
        }
        await this.assertMonederoEnTenant(Number(validador.idCliente), cliente);
      }

      // Idempotencia ya con el monedero resuelto, para comparar contra él (V2-15).
      if (claveIdempotencia) {
        const previa = await this.debitoPorClave(
          claveIdempotencia,
          monedero.numeroSerie,
        );
        if (previa) return previa;
      }

      // ===== NUEVA LÓGICA: Detectar y cerrar transacciones abiertas con esMultiple = true =====
      // Buscar transacciones abiertas (controlTransaccion = 1) con esMultiple = true para este monedero
      const transaccionesAbiertasMultiple =
        await this.transaccionesdebitoRepository.find({
          where: {
            numeroSerieMonedero: monedero.numeroSerie,
            controlTransaccion: EnumControlTransacciones.ABIERTA,
            esMultiple: 1, // esMultiple = true
            latitudFinal: IsNull(),
            longitudFinal: IsNull(),
          },
          order: {
            id: 'ASC', // Ordenar por ID ascendente para procesar consecutivamente
          },
        });

      let qrActualizado = false; // Flag para saber si se actualizó el QR

      // Si hay transacciones abiertas con esMultiple = true, cerrarlas
      if (
        transaccionesAbiertasMultiple &&
        transaccionesAbiertasMultiple.length > 0
      ) {

        // Usar las coordenadas iniciales de la nueva transacción como coordenadas finales
        const latitudFinal = createTransaccioneDebitoDto.latitud;
        const longitudFinal = createTransaccioneDebitoDto.longitud;

        // Procesar cada transacción abierta
        for (const transaccionAbierta of transaccionesAbiertasMultiple) {

          // Obtener variante y tarifa de la transacción existente usando idViaje
          let varianteUpdate: Variantes | null = null;
          let tarifaInfoUpdate: any = null;

          if (transaccionAbierta.idViaje) {
            const viaje = await this.viajesRepository.findOne({
              where: { id: transaccionAbierta.idViaje },
              relations: ['idVariante2'],
            });

            if (viaje && viaje.idVariante) {
              varianteUpdate = await this.variantesRepository.findOne({
                where: { id: viaje.idVariante },
              });

              if (varianteUpdate) {
                const tarifa = await this.tarifasRepository.findOne({
                  where: { idVariante: viaje.idVariante, estatus: 1 },
                });

                if (tarifa) {
                  tarifaInfoUpdate = {
                    TarifaBase: tarifa.tarifaBase,
                    CostoAdicional: tarifa.costoAdicional,
                    DistanciaBaseKm: tarifa.distanciaBaseKm,
                    IncrementoCadaMetros: tarifa.incrementoCadaMetros,
                    TipoTarifa: tarifa.tipoTarifa,
                    CostoPorEstacion: tarifa.costoPorEstacion,
                    CantidadEstacionesBase: tarifa.cantidadEstacionesBase,
                  };
                }
              }
            }
          }

          // Calcular distancia desde punto inicial hasta punto final usando haversine
          if (
            transaccionAbierta.latitudInicial &&
            transaccionAbierta.longitudInicial
          ) {
            const puntoInicial = {
              latitude: transaccionAbierta.latitudInicial,
              longitude: transaccionAbierta.longitudInicial,
            };
            const puntoFinal = {
              latitude: latitudFinal,
              longitude: longitudFinal,
            };

            // Calcular distancia en metros usando haversine
            const distanciaMetros = haversine(puntoInicial, puntoFinal);
            const distanciaKm = distanciaMetros / 1000; // Convertir a kilómetros

            // Calcular monto basado en la distancia
            const tarifaBase =
              Number(transaccionAbierta.monto) ||
              Number(tarifaInfoUpdate?.TarifaBase) ||
              0;
            let montoCalculado = tarifaBase;

            // Tarifa por estaciones (TipoTarifa=3): calcular por número de estaciones recorridas
            if (
              tarifaInfoUpdate &&
              Number(tarifaInfoUpdate.TipoTarifa) === EnumTipoTarifa.ESTACIONES
            ) {
              const estaciones =
                this.obtenerEstacionesDeVariante(varianteUpdate);
              const idxInicio = this.encontrarIndiceEstacionMasCercana(
                estaciones,
                Number(transaccionAbierta.latitudInicial),
                Number(transaccionAbierta.longitudInicial),
              );
              const idxFin = this.encontrarIndiceEstacionMasCercana(
                estaciones,
                Number(latitudFinal),
                Number(longitudFinal),
              );

              const costoPorEstacion = tarifaInfoUpdate.CostoPorEstacion
                ? Number(tarifaInfoUpdate.CostoPorEstacion)
                : 0;
              const cantidadBase = tarifaInfoUpdate.CantidadEstacionesBase
                ? Number(tarifaInfoUpdate.CantidadEstacionesBase)
                : 0;
              const estacionesRecorridas =
                idxInicio !== -1 && idxFin !== -1
                  ? Math.abs(idxFin - idxInicio)
                  : 0;
              const extras = Math.max(
                0,
                estacionesRecorridas - Math.max(0, cantidadBase),
              );
              montoCalculado = parseFloat(
                (tarifaBase + extras * Math.max(0, costoPorEstacion)).toFixed(
                  2,
                ),
              );
            }
            // Si es tarifa INCREMENTAL (tipoTarifa === 2) y hay configuración de costo adicional
            else if (tarifaInfoUpdate && tarifaInfoUpdate.TipoTarifa === 2) {
              const costoAdicional = tarifaInfoUpdate.CostoAdicional
                ? Number(tarifaInfoUpdate.CostoAdicional)
                : 0;
              const distanciaBaseKm = tarifaInfoUpdate.DistanciaBaseKm
                ? Number(tarifaInfoUpdate.DistanciaBaseKm)
                : 0;
              const incrementoCadaMetros = tarifaInfoUpdate.IncrementoCadaMetros
                ? Number(tarifaInfoUpdate.IncrementoCadaMetros)
                : 0;

              if (costoAdicional > 0 && incrementoCadaMetros > 0) {
                const distanciaBaseMetros = distanciaBaseKm * 1000;

                // Si la distancia recorrida excede la distancia base, calcular el extra
                if (distanciaMetros > distanciaBaseMetros) {
                  const distanciaExcedente =
                    distanciaMetros - distanciaBaseMetros;
                  const numeroIncrementos = Math.ceil(
                    distanciaExcedente / incrementoCadaMetros,
                  );
                  const extraPorDistancia = numeroIncrementos * costoAdicional;
                  montoCalculado = tarifaBase + extraPorDistancia;
                }
              }
            }

            // Validar que el monto calculado no exceda el cobro máximo
            if (transaccionAbierta.cobroMaximo) {
              const cobroMaximoNum = Number(transaccionAbierta.cobroMaximo);
              if (montoCalculado > cobroMaximoNum) {
                montoCalculado = cobroMaximoNum;
              }
            }

            // Aplicar descuentos (igual que en el PATCH)
            let montoConDescuento = montoCalculado;

            // PASO 1: Aplicar descuento por tipo de pasajero SOLO cuando la tarifa es ABIERTA o ESTACIONES
            const tipoTarifaUpdate =
              tarifaInfoUpdate && tarifaInfoUpdate.TipoTarifa
                ? Number(tarifaInfoUpdate.TipoTarifa)
                : null;

            if (
              (tipoTarifaUpdate === EnumTipoTarifa.ABIERTA ||
                tipoTarifaUpdate === EnumTipoTarifa.ESTACIONES) &&
              monedero.idTipoPasajero
            ) {
              const tipoPasajero =
                await this.CatTiposPasajerosRepository.findOne({
                  where: { id: monedero.idTipoPasajero },
                  relations: ['CatTipoDescuento'],
                });

              if (
                tipoPasajero &&
                tipoPasajero.cantidad &&
                tipoPasajero.cantidad > 0 &&
                tipoPasajero.idCatTipoDescuento
              ) {
                const tipoDescuento = Number(tipoPasajero.idCatTipoDescuento);
                const cantidad = Number(tipoPasajero.cantidad);

                // idCatTipoDescuento: 1 = PORCENTAJE, 2 = MONETARIO
                if (tipoDescuento === 1) {
                  const descuentoPorcentual =
                    (montoConDescuento * cantidad) / 100;
                  montoConDescuento = montoConDescuento - descuentoPorcentual;
                } else if (tipoDescuento === 2) {
                  montoConDescuento = montoConDescuento - cantidad;
                }

                if (montoConDescuento < 0) {
                  montoConDescuento = 0;
                }
              }
            }

            // PASO 2: Aplicar descuento de transbordo
            if (
              transaccionAbierta.descuentoTransbordo !== null &&
              transaccionAbierta.descuentoTransbordo !== undefined &&
              transaccionAbierta.tipoDescuentoTransbordo !== null
            ) {
              const descuentoTransbordo = Number(
                transaccionAbierta.descuentoTransbordo,
              );
              const tipoDescuentoTransbordo = Number(
                transaccionAbierta.tipoDescuentoTransbordo,
              );

              if (descuentoTransbordo > 0) {
                if (
                  tipoDescuentoTransbordo ===
                  EnumTipoDescuentoTransbordo.MONETARIO
                ) {
                  montoConDescuento = montoConDescuento - descuentoTransbordo;
                } else if (
                  tipoDescuentoTransbordo ===
                  EnumTipoDescuentoTransbordo.PORCENTAJE
                ) {
                  const descuentoPorcentual =
                    (montoConDescuento * descuentoTransbordo) / 100;
                  montoConDescuento = montoConDescuento - descuentoPorcentual;
                }

                if (montoConDescuento < 0) {
                  montoConDescuento = 0;
                }
              }
            }

            // Cierre + descuento en la misma TX: si otra petición ya cerró
            // (affected=0) se revierte el descuento al hacer rollback.
            // Date, no texto: un string se reinterpreta con la zona del equipo.
            const fechaHoraFinal = nowDb();

            try {
              await this.dataSource.transaction(async (manager) => {
                const descontado =
                  await this.monederosService.descontarSaldoAtomico(
                    monedero.numeroSerie,
                    montoConDescuento,
                    idUser,
                    manager,
                  );
                if (!descontado) {
                  throw new BadRequestException(
                    `Saldo insuficiente para cerrar transacción abierta ID: ${transaccionAbierta.id}`,
                  );
                }

                const cierre = await manager
                  .getRepository(TransaccionesDebito)
                  .update(
                    {
                      id: transaccionAbierta.id,
                      controlTransaccion: EnumControlTransacciones.ABIERTA,
                    },
                    {
                      idTipoTransaccion: EnumTipoTransaccion.DEBITO,
                      monto: montoConDescuento,
                      controlTransaccion: EnumControlTransacciones.PAGADO,
                      latitudFinal: latitudFinal,
                      longitudFinal: longitudFinal,
                      fechaHoraFinal: fechaHoraFinal,
                      distanciaRecorrida: parseFloat(distanciaKm.toFixed(2)),
                    },
                  );
                if (!cierre.affected) {
                  throw new Error('ABIERTA_YA_CERRADA');
                }

                const transaccionActualizada = await manager
                  .getRepository(TransaccionesDebito)
                  .findOne({ where: { id: transaccionAbierta.id } });
                if (transaccionActualizada) {
                  const { id: liveId, ...transaccionBody } =
                    transaccionActualizada;
                  await manager
                    .getRepository(HistoricoTransaccionesDebito)
                    .save({
                      ...transaccionBody,
                      idTransaccionOrigen: Number(liveId),
                    });
                }
              });
              monedero.saldo = Number(monedero.saldo) - montoConDescuento;
            } catch (cierreError) {
              if (
                cierreError instanceof Error &&
                cierreError.message === 'ABIERTA_YA_CERRADA'
              ) {
                continue;
              }
              throw cierreError;
            }

          }
        }

        // Actualizar estatus del QR a 0 después de cerrar las transacciones
        if (monedero.idPasajero) {
          const qrActivo = await this.qrCodesRepository.findOne({
            where: {
              idPasajero: monedero.idPasajero,
              estatus: 1, // ACTIVO
            },
            order: {
              id: 'DESC', // Más reciente
            },
          });

          if (qrActivo) {
            await this.qrCodesRepository.update(qrActivo.id, {
              estatus: 0, // INACTIVO
            });
            qrActualizado = true;
          }
        }
      }

      // 2.1?? Validar que no exista una transacción abierta (controlTransaccion = 1) para este monedero
      const transaccionAbierta =
        await this.transaccionesdebitoRepository.findOne({
          where: {
            numeroSerieMonedero: monedero.numeroSerie,
            controlTransaccion: EnumControlTransacciones.ABIERTA,
            latitudFinal: IsNull(),
            longitudFinal: IsNull(),
          },
          order: {
            id: 'DESC', // Obtener la más reciente
          },
        });

      // 2.3?? Consulta de informaci?n de instalaci?n, validador, turno, viaje, variante y tarifa usando idViaje
      let infoValidadorViaje: any = null;
      let variante: Variantes | null = null; // Guardar la variante para calcular distancia

      if (createTransaccioneDebitoDto.idViaje) {
        // Buscar el viaje con sus relaciones
        const viaje = await this.viajesRepository.findOne({
          where: { id: createTransaccioneDebitoDto.idViaje },
          relations: ['idVariante2', 'idTurno2'],
        });

        if (!viaje) {
          throw new NotFoundException(
            `El viaje con ID ${createTransaccioneDebitoDto.idViaje} no existe`,
          );
        }
        if (Number(viaje.idCliente) !== Number(monedero.idCliente)) {
          throw new NotFoundException(
            `El viaje con ID ${createTransaccioneDebitoDto.idViaje} no existe`,
          );
        }
        // No se cobra en un viaje cerrado (al cerrarse queda con Fin y Estatus 0).
        if (viaje.fin || Number(viaje.estatus) !== 1) {
          throw new BadRequestException('El viaje está cerrado');
        }

        // Guardar la variante para calcular la distancia
        // Asegurarnos de obtener la variante completa con todos sus campos
        if (viaje.idVariante) {
          variante = await this.variantesRepository.findOne({
            where: { id: viaje.idVariante },
          });
        } else {
          variante = viaje.idVariante2;
        }

        // Obtener el turno con la instalaci?n
        const turno = await this.turnosRepository.findOne({
          where: { id: viaje.idTurno },
          relations: ['idInstalacion2'],
        });

        if (!turno) {
          throw new NotFoundException(
            `El turno con ID ${viaje.idTurno} no existe`,
          );
        }

        // Obtener la instalaci?n con el validador
        const instalacion = await this.instalacionesRepository.findOne({
          where: { id: turno.idInstalacion },
          relations: ['validadores'],
        });

        if (!instalacion) {
          throw new NotFoundException(
            `La instalaci?n con ID ${turno.idInstalacion} no existe`,
          );
        }

        // Obtener la tarifa de la variante
        const tarifa = await this.tarifasRepository.findOne({
          where: { idVariante: viaje.idVariante, estatus: 1 },
        });

        // Construir el objeto con la misma estructura que el query anterior
        infoValidadorViaje = [
          {
            id: instalacion.id,
            NumeroSerie: instalacion.validadores?.numeroSerie || null,
            Estatus: turno.estatus,
            turno: turno.id,
            inicioTurno: turno.inicio,
            idViaje: viaje.id,
            idVariante: viaje.idVariante,
            nombreVariante: viaje.idVariante2?.nombre || null,
            TarifaBase: tarifa?.tarifaBase || null,
            CostoAdicional: tarifa?.costoAdicional || null,
            DistanciaBaseKm: tarifa?.distanciaBaseKm || null,
            IncrementoCadaMetros: tarifa?.incrementoCadaMetros || null,
            TipoTarifa: tarifa?.tipoTarifa || null,
            CostoPorEstacion: tarifa?.costoPorEstacion || null,
            CantidadEstacionesBase: tarifa?.cantidadEstacionesBase || null,
          },
        ];
      } else {
        // Si no se proporciona idViaje, mantener la l?gica anterior con el query SQL
        infoValidadorViaje = await this.transaccionesdebitoRepository.query(
          `
          SELECT 
            i.Id AS id,
            v.NumeroSerie,
            t.Estatus,
            t.Id AS turno,
            t.Inicio AS inicioTurno,
            vi.Id AS idViaje,
            vi.IdVariante AS idVariante,
            va.Nombre AS nombreVariante,
            ta.TarifaBase,
            ta.CostoAdicional,
            ta.DistanciaBaseKm,
            ta.IncrementoCadaMetros,
            ta.TipoTarifa,
            ta.CostoPorEstacion,
            ta.CantidadEstacionesBase
          FROM Instalaciones i
          JOIN Validadores v ON i.IdValidador = v.Id
          JOIN Turnos t ON t.IdInstalacion = i.Id
          JOIN Viajes vi ON vi.IdTurno = t.Id
          JOIN Variantes va ON va.Id = vi.IdVariante
          JOIN Tarifas ta ON ta.IdVariante = va.Id AND ta.Estatus = 1
          WHERE v.NumeroSerie = ?
            AND DATE(vi.Inicio) = CURDATE()
            AND vi.Inicio <= NOW()
            AND t.Estatus = 1
            AND vi.EstadoActual = 1
            AND vi.Estatus = 1
            AND vi.Fin IS NULL
          LIMIT 1
          `,
          [createTransaccioneDebitoDto.numeroSerieValidador],
        );

        // Obtener la variante para calcular la distancia
        if (
          infoValidadorViaje &&
          infoValidadorViaje.length > 0 &&
          infoValidadorViaje[0].idVariante
        ) {
          variante = await this.variantesRepository.findOne({
            where: { id: infoValidadorViaje[0].idVariante },
          });
        }
      }

      // 2.4?? Validar que tenemos informaci?n de tarifa
      if (
        !infoValidadorViaje ||
        infoValidadorViaje.length === 0 ||
        !infoValidadorViaje[0].TipoTarifa
      ) {
        throw new BadRequestException(
          'La variante del viaje no tiene una tarifa activa',
        );
      }

      const tarifaInfo = infoValidadorViaje[0];
      const tipoTarifa = Number(tarifaInfo.TipoTarifa);
      const tarifaBase = Number(tarifaInfo.TarifaBase) || 0;
      const idViaje = tarifaInfo.idViaje ? Number(tarifaInfo.idViaje) : null;


      const esTarifaPorEstaciones = tipoTarifa === EnumTipoTarifa.ESTACIONES;

      // D-15: con tarifa abierta o por estaciones el pasajero valida al subir y
      // al bajar, con tarjeta o con QR. Si tiene viajes abiertos (no múltiples),
      // esta validación los cierra en este punto. Si alguno es del mismo viaje
      // (mismo camión) es la bajada: se cobra y no se abre otro. Si es de otro
      // viaje, olvidó validar al bajar: se cierra y se abre el nuevo.
      const abiertasIndividuales =
        await this.transaccionesdebitoRepository.find({
          where: {
            numeroSerieMonedero: monedero.numeroSerie,
            controlTransaccion: EnumControlTransacciones.ABIERTA,
            esMultiple: 0,
            latitudFinal: IsNull(),
            longitudFinal: IsNull(),
          },
          order: { id: 'ASC' },
        });
      if (abiertasIndividuales.length > 0) {
        const fechaHoraActual = nowDb();
        const ultima = abiertasIndividuales[abiertasIndividuales.length - 1];
        const inicioUltima = new Date(
          ultima.fechaHoraInicio ?? ultima.fhRegistro,
        );
        const minutos =
          (fechaHoraActual.getTime() - inicioUltima.getTime()) / 60000;
        const mismoViaje = (t: TransaccionesDebito) =>
          idViaje !== null && Number(t.idViaje) === idViaje;

        // Validación repetida al subir (menos de 1 minuto, mismo viaje): no se cobra ni se abre otro.
        if (mismoViaje(ultima) && minutos < 1) {
          return {
            status: 'success',
            message: 'Viaje ya iniciado',
            data: {
              id: Number(ultima.id),
              cantidadPasajes: 1,
              nombre: monedero?.numeroSerie || '',
            },
          };
        }

        let cobradoBajada = 0;
        let idBajada: number | null = null;
        for (const abierta of abiertasIndividuales) {
          const cobrado = await this.cerrarTransaccionAbierta(
            abierta,
            monedero,
            createTransaccioneDebitoDto.latitud,
            createTransaccioneDebitoDto.longitud,
            fechaHoraActual,
            idUser,
          );
          if (cobrado !== null && mismoViaje(abierta)) {
            cobradoBajada += cobrado;
            idBajada = Number(abierta.id);
          }
        }

        // El QR del pasajero queda inactivo al cerrar sus viajes.
        if (monedero.idPasajero) {
          const qrActivo = await this.qrCodesRepository.findOne({
            where: { idPasajero: monedero.idPasajero, estatus: 1 },
            order: { id: 'DESC' },
          });
          if (qrActivo) {
            await this.qrCodesRepository.update(qrActivo.id, { estatus: 0 });
            qrActualizado = true;
          }
        }

        if (idBajada !== null) {
          return {
            status: 'success',
            message: `Viaje cerrado: $${cobradoBajada.toFixed(2)}`,
            data: {
              id: idBajada,
              cantidadPasajes: 1,
              nombre: monedero?.numeroSerie || '',
            },
          };
        }
      }

      // 2.5?? Determinamos controlTransaccion seg?n el tipo de tarifa
      // Si TipoTarifa = 1 (Fija), controlTransaccion = PAGADO
      // Si TipoTarifa = 2 (Abierta), controlTransaccion = ABIERTA
      let controlTransaccion: EnumControlTransacciones;
      if (tipoTarifa === EnumTipoTarifa.FIJA) {
        controlTransaccion = EnumControlTransacciones.PAGADO;
      } else if (
        tipoTarifa === EnumTipoTarifa.ABIERTA ||
        tipoTarifa === EnumTipoTarifa.ESTACIONES
      ) {
        controlTransaccion = EnumControlTransacciones.ABIERTA;
      } else {
        // Por defecto, si no se puede determinar, usar PAGADO
        controlTransaccion = EnumControlTransacciones.PAGADO;
      }


      // 2.6?? Calculamos el monto seg?n el tipo de tarifa
      // Si TipoTarifa = 1 (Fija), usar TarifaBase
      // Si TipoTarifa = 2 (Abierta), tambi?n usar TarifaBase (o se puede extender la l?gica)
      let montoCalculado = tarifaBase;

      if (tipoTarifa === EnumTipoTarifa.FIJA) {
        montoCalculado = tarifaBase;
      } else if (
        tipoTarifa === EnumTipoTarifa.ABIERTA ||
        esTarifaPorEstaciones
      ) {
        // Para tarifa abierta, usar TarifaBase (puede extenderse con l?gica adicional)
        montoCalculado = tarifaBase;
      }

      // 2.6?? Calculamos el numeroTransbordo y aplicamos el descuento del transbordo (opcional)
      // Si no existe un transbordo para el cliente, continuamos con la l?gica normal
      let numeroTransbordo: number | null = null;
      let costoTransbordo: number | null = null; // Guardar el costo del transbordo para almacenarlo en la transacción
      let tipoDescuentoTransbordo: number | null = null; // Guardar el tipo de descuento del transbordo

      // Buscar el transbordo que pertenezca al cliente y esté activo
      const transbordoPermitido =
        await this.transbordosPermitidosRepository.findOne({
          where: {
            idCliente: Number(monedero.idCliente),
            estatus: 1,
          },
          relations: ['tipoDescuento'],
        });
      // Solo aplicamos la l?gica de transbordos si existe configuraci?n para el cliente
      if (
        transbordoPermitido &&
        transbordoPermitido.tiempo &&
        transbordoPermitido.numeroTransbordos
      ) {
        // Calculamos la fecha l?mite hacia atr?s (tiempo en minutos)
        // Aplicar desfase de -6 horas para la zona horaria
        const fechaHoraTransaccion = nowDb();
        const tiempoEnMs = transbordoPermitido.tiempo * 60 * 1000; // Convertir minutos a milisegundos
        const fechaLimite = new Date(
          fechaHoraTransaccion.getTime() - tiempoEnMs,
        );

        // Buscar la última transacción finalizada (controlTransaccion = 0 = PAGADO) del monedero
        const ultimaTransaccionFinalizada =
          await this.transaccionesdebitoRepository.findOne({
            where: {
              numeroSerieMonedero: monedero.numeroSerie,
              controlTransaccion: EnumControlTransacciones.PAGADO,
            },
            order: {
              id: 'DESC', // La más reciente
            },
          });

        if (!ultimaTransaccionFinalizada) {
          // No hay transacciones finalizadas, es la primera (cobro inicial)
          numeroTransbordo = 0;
        } else {
          // Verificar si la última transacción está dentro del rango de tiempo permitido
          // Usamos fechaHoraInicio porque el tiempo de transbordo se cuenta desde el inicio
          const fechaUltimaTransaccion = new Date(
            ultimaTransaccionFinalizada.fechaHoraInicio ||
              ultimaTransaccionFinalizada.fhRegistro,
          );

          // Si la última transacción está fuera del rango de tiempo, reiniciamos a 0
          if (fechaUltimaTransaccion < fechaLimite) {
            numeroTransbordo = 0;
          } else {
            // La última transacción está dentro del rango de tiempo
            // Buscar todas las transacciones finalizadas del monedero
            const transaccionesEnRango =
              await this.transaccionesdebitoRepository.find({
                where: {
                  numeroSerieMonedero: monedero.numeroSerie,
                  controlTransaccion: EnumControlTransacciones.PAGADO,
                },
                order: {
                  fechaHoraInicio: 'ASC',
                },
              });

            // Filtrar las transacciones que están en el rango de tiempo usando fechaHoraInicio
            const transaccionesFiltradas = transaccionesEnRango.filter((t) => {
              const fechaInicio = t.fechaHoraInicio || t.fhRegistro;
              if (!fechaInicio) return false;
              const fecha = new Date(fechaInicio);
              return fecha >= fechaLimite && fecha < fechaHoraTransaccion;
            });


            // Buscar el cobro inicial (numeroTransbordo = 0) MÁS RECIENTE dentro del rango
            // Ordenar por fecha descendente para encontrar el más reciente
            const cobrosIniciales = transaccionesFiltradas
              .filter((t) => t.numeroTransbordo === 0)
              .sort((a, b) => {
                const fechaA = new Date(
                  a.fechaHoraInicio || a.fhRegistro,
                ).getTime();
                const fechaB = new Date(
                  b.fechaHoraInicio || b.fhRegistro,
                ).getTime();
                return fechaB - fechaA; // Más reciente primero
              });

            const cobroInicial = cobrosIniciales[0]; // El más reciente

            if (cobroInicial) {
              // Calcular si el tiempo desde el cobro inicial ya pasó usando fechaHoraInicio
              const fechaCobroInicial = new Date(
                cobroInicial.fechaHoraInicio || cobroInicial.fhRegistro,
              );
              const fechaExpiracionCobroInicial = new Date(
                fechaCobroInicial.getTime() + tiempoEnMs,
              );

              // Si el tiempo desde el cobro inicial ya pasó, reiniciamos el contador a 0
              if (fechaHoraTransaccion > fechaExpiracionCobroInicial) {
                numeroTransbordo = 0;
              } else {
                // El cobro inicial todavía está vigente
                // Contar solo las transacciones desde el cobro inicial más reciente hasta ahora
                const transaccionesDesdeCobroInicial =
                  transaccionesFiltradas.filter((t) => {
                    const fechaTransaccion = new Date(
                      t.fechaHoraInicio || t.fhRegistro,
                    );
                    return (
                      fechaTransaccion >= fechaCobroInicial &&
                      fechaTransaccion < fechaHoraTransaccion
                    );
                  });

                // Obtener los números de transbordo de las transacciones desde el cobro inicial
                const numerosTransbordo = transaccionesDesdeCobroInicial
                  .map((t) => t.numeroTransbordo)
                  .filter((n) => n !== null && n !== undefined);


                if (numerosTransbordo.length > 0) {
                  const maxNumeroTransbordo = Math.max(...numerosTransbordo);
                  const siguienteTransbordo = maxNumeroTransbordo + 1;

                  // Si el siguiente número excede el máximo, reiniciamos a 0 (nuevo cobro inicial que reinicia el tiempo)
                  if (
                    siguienteTransbordo > transbordoPermitido.numeroTransbordos
                  ) {
                    numeroTransbordo = 0;
                  } else {
                    numeroTransbordo = siguienteTransbordo;
                  }
                } else {
                  // Solo existe el cobro inicial, el siguiente es 1
                  numeroTransbordo = 1;
                }
              }
            } else {
              // No hay cobro inicial en el rango, empezamos en 0
              numeroTransbordo = 0;
            }
          }
        }

        // Buscamos el costo del transbordo en DetalleTransbordos (solo guardamos el valor, no aplicamos el descuento todavía)
        // Si numeroTransbordo es 0, el descuentoTransbordo debe ser 0
        if (numeroTransbordo === 0) {
          costoTransbordo = 0; // Cuando el transbordo es 0, no hay descuento
          tipoDescuentoTransbordo = transbordoPermitido.idTipoDescuento
            ? Number(transbordoPermitido.idTipoDescuento)
            : null;
        } else if (
          numeroTransbordo !== null &&
          transbordoPermitido.id &&
          transbordoPermitido.idTipoDescuento
        ) {
          tipoDescuentoTransbordo = Number(transbordoPermitido.idTipoDescuento);

          const detalleTransbordo =
            await this.detalleTransbordosRepository.findOne({
              where: {
                idTransbordo: transbordoPermitido.id,
                nroTransbordo: numeroTransbordo,
              },
            });

          // Si encontramos el detalle, guardamos el costo (aplicaremos el descuento después del descuento por tipo de pasajero)
          if (detalleTransbordo && detalleTransbordo.costo !== null) {
            costoTransbordo = Number(detalleTransbordo.costo); // Guardar el costo para almacenarlo en la transacción
          }
        }
      }

      // 3?? Calculamos monto final (aqu? se pueden aplicar descuentos si existen)
      // ORDEN DE APLICACIÓN: 1) Descuento por tipo de pasajero, 2) Descuento por transbordo
      let montoConDescuento = montoCalculado;

      // PASO 1: Aplicar descuento por tipo de pasajero SOLO cuando tipoTarifa es FIJA (tipoTarifa === 1)
      if (tipoTarifa === EnumTipoTarifa.FIJA && monedero.idTipoPasajero) {
        const tipoPasajero = await this.CatTiposPasajerosRepository.findOne({
          where: { id: monedero.idTipoPasajero },
          relations: ['CatTipoDescuento'],
        });

        if (
          tipoPasajero &&
          tipoPasajero.cantidad &&
          tipoPasajero.cantidad > 0 &&
          tipoPasajero.idCatTipoDescuento
        ) {
          const tipoDescuento = Number(tipoPasajero.idCatTipoDescuento);
          const cantidad = Number(tipoPasajero.cantidad);


          // idCatTipoDescuento: 1 = PORCENTAJE, 2 = MONETARIO
          if (tipoDescuento === 1) {
            // Tipo 1: PORCENTAJE - cantidad es el porcentaje a descontar
            const descuentoPorcentual = (montoConDescuento * cantidad) / 100;
            montoConDescuento = montoConDescuento - descuentoPorcentual;
          } else if (tipoDescuento === 2) {
            // Tipo 2: MONETARIO - cantidad es el monto a restar directamente
            montoConDescuento = montoConDescuento - cantidad;
          }

          // Asegurar que el monto no sea negativo
          if (montoConDescuento < 0) {
            montoConDescuento = 0;
          }

        } else {
        }
      } else if (tipoTarifa !== EnumTipoTarifa.FIJA) {
      }

      // PASO 2: Aplicar descuento por transbordo sobre el monto ya descontado por tipo de pasajero
      if (
        costoTransbordo !== null &&
        costoTransbordo !== undefined &&
        tipoDescuentoTransbordo !== null &&
        costoTransbordo > 0
      ) {

        // Evaluar el tipo de descuento: 1 = PESOS (resta directa), 2 = PORCENTAJE
        if (tipoDescuentoTransbordo === EnumTipoDescuentoTransbordo.MONETARIO) {
          // Tipo 1: PESOS - resta directa sobre el monto ya descontado por tipo de pasajero
          montoConDescuento = montoConDescuento - costoTransbordo;
        } else if (
          tipoDescuentoTransbordo === EnumTipoDescuentoTransbordo.PORCENTAJE
        ) {
          // Tipo 2: PORCENTAJE - calcular porcentaje del monto ya descontado por tipo de pasajero
          // costoTransbordo contiene el porcentaje (ej: 10 = 10%)
          const descuentoPorcentual =
            (montoConDescuento * costoTransbordo) / 100;
          montoConDescuento = montoConDescuento - descuentoPorcentual;
        }

        // Asegurar que el monto no sea negativo
        if (montoConDescuento < 0) {
          montoConDescuento = 0;
        }

      }

      // Determinar cantidad de pasajes a procesar
      let cantidadPasajes = 1;
      if (createTransaccioneDebitoDto.esMultiple) {
        if (
          !createTransaccioneDebitoDto.cantidadPasajes ||
          createTransaccioneDebitoDto.cantidadPasajes < 1
        ) {
          throw new BadRequestException(
            'Si esMultiple es true, cantidadPasajes es obligatorio y debe ser mayor a 0',
          );
        }
        cantidadPasajes = createTransaccioneDebitoDto.cantidadPasajes;
      }

      // Calcular distancia inicial y cobro máximo ANTES de la validación de saldo
      // Aplicar desfase de -6 horas para la zona horaria
      const fechaHoraInicio = nowDb();

      // Calcular distancia inicial desde el punto inicial de la variante
      const distanciaInicialKm = this.calcularDistanciaInicialKm(
        variante,
        createTransaccioneDebitoDto.latitud,
        createTransaccioneDebitoDto.longitud,
        {
          tarifaBase: tarifaInfo.TarifaBase
            ? Number(tarifaInfo.TarifaBase)
            : undefined,
          costoAdicional: tarifaInfo.CostoAdicional
            ? Number(tarifaInfo.CostoAdicional)
            : undefined,
          distanciaBaseKm: tarifaInfo.DistanciaBaseKm
            ? Number(tarifaInfo.DistanciaBaseKm)
            : undefined,
          incrementoCadaMetros: tarifaInfo.IncrementoCadaMetros
            ? Number(tarifaInfo.IncrementoCadaMetros)
            : undefined,
          tipoTarifa: tarifaInfo.TipoTarifa
            ? Number(tarifaInfo.TipoTarifa)
            : undefined,
        },
      );

      // Asegurar que el valor sea un n?mero v?lido
      const distanciaInicialKmFinal =
        typeof distanciaInicialKm === 'number' && !isNaN(distanciaInicialKm)
          ? parseFloat(distanciaInicialKm.toFixed(2))
          : 0;

      // Calcular cobro máximo (necesario para validación de tarifas ABIERTA)
      const cobroMaximo = this.calcularCobroMaximo(
        variante,
        {
          tarifaBase: tarifaInfo.TarifaBase
            ? Number(tarifaInfo.TarifaBase)
            : undefined,
          costoAdicional: tarifaInfo.CostoAdicional
            ? Number(tarifaInfo.CostoAdicional)
            : undefined,
          distanciaBaseKm: tarifaInfo.DistanciaBaseKm
            ? Number(tarifaInfo.DistanciaBaseKm)
            : undefined,
          incrementoCadaMetros: tarifaInfo.IncrementoCadaMetros
            ? Number(tarifaInfo.IncrementoCadaMetros)
            : undefined,
          tipoTarifa: tarifaInfo.TipoTarifa
            ? Number(tarifaInfo.TipoTarifa)
            : undefined,
        },
        createTransaccioneDebitoDto.latitud,
        createTransaccioneDebitoDto.longitud,
      );

      // Cobro máximo para tarifa por estaciones (TipoTarifa=3)
      // Máximo teórico: TarifaBase + (TotalEstaciones - CantidadEstacionesBase) * CostoPorEstacion
      let cobroMaximoEstaciones: number | null = null;
      if (esTarifaPorEstaciones) {
        const costoPorEstacion = tarifaInfo.CostoPorEstacion
          ? Number(tarifaInfo.CostoPorEstacion)
          : 0;
        const cantidadEstacionesBase = tarifaInfo.CantidadEstacionesBase
          ? Number(tarifaInfo.CantidadEstacionesBase)
          : 0;

        // Para tipo 3, el recorridoDetallado se interpreta como lista de estaciones (puntos con nombre)
        const estaciones = this.parsearRecorridoDetallado(
          variante?.recorridoDetallado ?? null,
        )?.filter(
          (p: any) =>
            p && typeof p.nombre === 'string' && p.nombre.trim() !== '',
        );
        const totalEstaciones = Array.isArray(estaciones)
          ? estaciones.length
          : 0;

        const extrasMax = Math.max(
          0,
          totalEstaciones - Math.max(0, cantidadEstacionesBase),
        );
        cobroMaximoEstaciones = parseFloat(
          (tarifaBase + extrasMax * Math.max(0, costoPorEstacion)).toFixed(2),
        );
      }

      // Calcular monto total a validar según el tipo de tarifa
      // Para tarifa FIJA: usar montoConDescuento
      // Para tarifa ABIERTA: usar cobroMaximo
      let montoTotalAValidar: number;
      if (tipoTarifa === EnumTipoTarifa.FIJA) {
        montoTotalAValidar = montoConDescuento * cantidadPasajes;
      } else if (tipoTarifa === EnumTipoTarifa.ABIERTA) {
        // Para tarifas ABIERTA, validar usando el monto máximo a cobrar
        montoTotalAValidar = (cobroMaximo || 0) * cantidadPasajes;
      } else if (esTarifaPorEstaciones) {
        montoTotalAValidar = (cobroMaximoEstaciones || 0) * cantidadPasajes;
      } else {
        // Por defecto, usar montoConDescuento
        montoTotalAValidar = montoConDescuento * cantidadPasajes;
      }

      const montoFinal = Number(monedero.saldo) - montoTotalAValidar;

      if (tipoTarifa === EnumTipoTarifa.FIJA) {
      } else if (tipoTarifa === EnumTipoTarifa.ABIERTA) {
      } else if (esTarifaPorEstaciones) {
      }

      // 4?? Validaci?n de saldo - Aplica para ambos tipos de tarifa
      // Para tarifa FIJA: valida con montoConDescuento
      // Para tarifa ABIERTA: valida con cobroMaximo
      if (montoFinal < 0) {
        estado = transicionarEstado(
          estado,
          EventoTransaccion.SALDO_INSUFICIENTE,
        );

        // Rechazo temprano (saldo claramente insuficiente según el saldo leído).
        await this.registrarRechazoSaldoInsuficiente({
          dto: createTransaccioneDebitoDto,
          idUser,
          monedero,
          montoTotalAValidar,
          montoConDescuento,
          cantidadPasajes,
          tipoTarifa,
          cobroMaximo,
          distanciaInicialKmFinal,
          fechaHoraInicio,
          numeroTransbordo,
          idViaje,
          costoTransbordo,
          tipoDescuentoTransbordo,
        });
      }

      // 5?? Si saldo OK, actualizamos el monedero y estado
      estado = transicionarEstado(estado, EventoTransaccion.SALDO_OK);

      // Calcular monto total a descontar para actualización del saldo (solo para tarifas PAGADAS)
      // Para tarifas FIJA: usar montoConDescuento
      // Para tarifas ABIERTA: no se descuenta el saldo todavía
      const montoTotalADescontar = montoConDescuento * cantidadPasajes;

      // Insert primero, descuento después, todo en una TX (H-09 / H-10 / V2-03).
      // Si la clave ya existe, el UNIQUE aborta sin mover saldo. Si el
      // descuento falla, el rollback deshace los inserts.
      let montoAGuardar = 0;
      if (controlTransaccion === EnumControlTransacciones.PAGADO) {
        if (
          tipoTarifa === EnumTipoTarifa.ABIERTA ||
          tipoTarifa === EnumTipoTarifa.ESTACIONES
        ) {
          montoAGuardar = tarifaBase;
        } else {
          montoAGuardar = montoConDescuento;
        }
      } else if (
        tipoTarifa === EnumTipoTarifa.ABIERTA ||
        tipoTarifa === EnumTipoTarifa.ESTACIONES
      ) {
        montoAGuardar = tarifaBase;
      }

      const transaccionesCreadas: number[] = [];

      try {
        await this.dataSource.transaction(async (manager) => {
          const debitoRepo = manager.getRepository(TransaccionesDebito);
          const historicoRepo = manager.getRepository(
            HistoricoTransaccionesDebito,
          );

          for (let i = 0; i < cantidadPasajes; i++) {
            const newTransaccion = debitoRepo.create({
              idTipoTransaccion: EnumTipoTransaccion.DEBITO,
              monto: montoAGuardar,
              controlTransaccion: controlTransaccion,
              latitudInicial: createTransaccioneDebitoDto.latitud,
              longitudInicial: createTransaccioneDebitoDto.longitud,
              distanciaInicialKm: distanciaInicialKmFinal,
              fechaHoraInicio: fechaHoraInicio,
              numeroSerieMonedero: monedero.numeroSerie,
              numeroSerieValidador:
                createTransaccioneDebitoDto.numeroSerieValidador,
              numeroTransbordo,
              idViaje: idViaje,
              esQR: createTransaccioneDebitoDto.esQR ? 1 : 0,
              cobroMaximo: esTarifaPorEstaciones
                ? cobroMaximoEstaciones
                : cobroMaximo,
              descuentoTransbordo:
                costoTransbordo !== null && costoTransbordo !== undefined
                  ? parseFloat(costoTransbordo.toFixed(2))
                  : null,
              tipoDescuentoTransbordo:
                tipoDescuentoTransbordo !== null &&
                tipoDescuentoTransbordo !== undefined
                  ? Number(tipoDescuentoTransbordo)
                  : null,
              esMultiple: createTransaccioneDebitoDto.esMultiple ? 1 : 0,
              claveIdempotencia: i === 0 ? claveIdempotencia : null,
            });

            let transaccionSave: TransaccionesDebito;
            try {
              transaccionSave = await debitoRepo.save(newTransaccion);
            } catch (error) {
              if (
                claveIdempotencia &&
                i === 0 &&
                (error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062)
              ) {
                throw new IdempotenciaDuplicadaError(claveIdempotencia);
              }
              throw error;
            }
            transaccionesCreadas.push(Number(transaccionSave.id));

            if (controlTransaccion === EnumControlTransacciones.PAGADO) {
              const { id: liveId, ...historicoBody } = transaccionSave;
              await historicoRepo.save({
                ...historicoBody,
                idTransaccionOrigen: Number(liveId),
              });
            }
          }

          if (controlTransaccion === EnumControlTransacciones.PAGADO) {
            const descontado =
              await this.monederosService.descontarSaldoAtomico(
                monedero.numeroSerie,
                montoTotalADescontar,
                idUser,
                manager,
              );
            if (!descontado) {
              throw new SaldoInsuficienteTxError();
            }
            monedero.saldo = Number(monedero.saldo) - montoTotalADescontar;
          }
        });
      } catch (error) {
        if (error instanceof IdempotenciaDuplicadaError) {
          const previa = await this.debitoPorClave(
            error.clave,
            monedero.numeroSerie,
          );
          if (previa) return previa;
        }
        if (error instanceof SaldoInsuficienteTxError) {
          estado = transicionarEstado(
            estado,
            EventoTransaccion.SALDO_INSUFICIENTE,
          );
          await this.registrarRechazoSaldoInsuficiente({
            dto: createTransaccioneDebitoDto,
            idUser,
            monedero,
            montoTotalAValidar,
            montoConDescuento,
            cantidadPasajes,
            tipoTarifa,
            cobroMaximo,
            distanciaInicialKmFinal,
            fechaHoraInicio,
            numeroTransbordo,
            idViaje,
            costoTransbordo,
            tipoDescuentoTransbordo,
          });
        }
        throw error;
      }

      // 7?? Bit?cora de ?xito
      const mensajeBitacora =
        cantidadPasajes > 1
          ? `${cantidadPasajes} transacciones de débito APROBADAS`
          : `Transacción de débito APROBADA${controlTransaccion === EnumControlTransacciones.ABIERTA ? ' (ABIERTA)' : ''}`;

      await this.bitacoraLogger.logToBitacora(
        'Transacciones',
        mensajeBitacora,
        'CREATE',
        {
          ids: transaccionesCreadas,
          cantidadPasajes,
          claveIdempotencia,
        },
        idUser,
        EnumModulos.TRANSACCIONES,
        EstatusEnumBitcora.SUCCESS,
      );

      // 8?? Actualizar estatus del QR según las condiciones
      // Si el pago es con QR y la tarifa es ABIERTA o ESTACIONES, NO cambiar el estatus del QR a 0, dejarlo en 1
      // Si no se cumplen esas condiciones y no se actualizó el QR anteriormente, cambiar el QR a estatus 0
      if (monedero.idPasajero && !qrActualizado) {
        const qrActivo = await this.qrCodesRepository.findOne({
          where: {
            idPasajero: monedero.idPasajero,
            estatus: EstatusEnum.ACTIVO, // 1 = ACTIVO
          },
          order: {
            id: 'DESC', // Más reciente
          },
        });

        if (qrActivo) {
          // Si el pago es con QR (esQR = true) y la tarifa es ABIERTA o ESTACIONES, mantener el QR en estatus 1
          const esPagoConQR = createTransaccioneDebitoDto.esQR === true;
          const esTarifaAbierta =
            tipoTarifa === EnumTipoTarifa.ABIERTA ||
            tipoTarifa === EnumTipoTarifa.ESTACIONES;

          if (esPagoConQR && esTarifaAbierta) {
          } else {
            // Cambiar el QR a estatus 0 (INACTIVO)
            await this.qrCodesRepository.update(qrActivo.id, {
              estatus: EstatusEnum.INACTIVO, // 0 = INACTIVO
            });
          }
        }
      }

      // 9?? Finalizamos la transacci?n
      void transicionarEstado(estado, EventoTransaccion.FINALIZAR);

      const mensajeRespuesta =
        cantidadPasajes > 1
          ? `${cantidadPasajes} transacciones creadas correctamente`
          : 'Transacción creada correctamente';

      return {
        status: 'success',
        message: mensajeRespuesta,
        data: {
          id: transaccionesCreadas[0], // ID de la primera transacción
          ids: cantidadPasajes > 1 ? transaccionesCreadas : undefined, // IDs de todas las transacciones si hay múltiples
          cantidadPasajes: cantidadPasajes,
          nombre: monedero?.numeroSerie || '',
        },
      };
    } catch (error) {
      estado = EstadoTransaccion.ERROR;
      if (error instanceof HttpException) {
        throw error;
      }

      // Bit?cora de error
      const querylogger = {
        claveIdempotencia:
          createTransaccioneDebitoDto.claveIdempotencia ?? null,
        numeroSerieValidador:
          createTransaccioneDebitoDto.numeroSerieValidador ?? null,
      };
      await this.bitacoraLogger.logToBitacora(
        'Transacciones',
        `Error en transacción de débito`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.TRANSACCIONES,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) throw error;

      throw new InternalServerErrorException(
        `Error al generar la transacción de débito`,
      );
    }
  }

  /**
   * Registra una transacción de RECHAZO por saldo insuficiente (en la tabla de
   * transacciones, en el histórico y en la bitácora) y lanza una
   * BadRequestException con el mensaje correspondiente.
   *
   * Se usa tanto en la validación temprana (saldo leído insuficiente) como
   * cuando el descuento atómico falla por una carrera con otra petición.
   */
  private async registrarRechazoSaldoInsuficiente(params: {
    dto: CreateTransaccioneDebitoDto;
    idUser: number;
    monedero: Monederos;
    montoTotalAValidar: number;
    montoConDescuento: number;
    cantidadPasajes: number;
    tipoTarifa: number;
    cobroMaximo: number | null;
    distanciaInicialKmFinal: number;
    fechaHoraInicio: Date;
    numeroTransbordo: number | null;
    idViaje: number | null;
    costoTransbordo: number | null;
    tipoDescuentoTransbordo: number | null;
  }): Promise<never> {
    const {
      dto,
      idUser,
      monedero,
      montoTotalAValidar,
      montoConDescuento,
      cantidadPasajes,
      tipoTarifa,
      cobroMaximo,
      distanciaInicialKmFinal,
      fechaHoraInicio,
      numeroTransbordo,
      idViaje,
      costoTransbordo,
      tipoDescuentoTransbordo,
    } = params;

    // Guardar transacción rechazada
    const newTransaccion = this.transaccionesdebitoRepository.create({
      idTipoTransaccion: EnumTipoTransaccion.RECHAZO,
      monto: montoTotalAValidar, // Monto total que se intentó validar
      controlTransaccion: EnumControlTransacciones.PAGADO,
      latitudInicial: dto.latitud,
      longitudInicial: dto.longitud,
      distanciaInicialKm: distanciaInicialKmFinal,
      fechaHoraInicio: fechaHoraInicio,
      numeroSerieMonedero: monedero.numeroSerie,
      numeroSerieValidador: dto.numeroSerieValidador,
      numeroTransbordo,
      idViaje: idViaje,
      esQR: dto.esQR ? 1 : 0,
      cobroMaximo: cobroMaximo,
      descuentoTransbordo:
        costoTransbordo !== null && costoTransbordo !== undefined
          ? parseFloat(costoTransbordo.toFixed(2))
          : null,
      tipoDescuentoTransbordo:
        tipoDescuentoTransbordo !== null &&
        tipoDescuentoTransbordo !== undefined
          ? Number(tipoDescuentoTransbordo)
          : null,
      esMultiple: dto.esMultiple ? 1 : 0,
    });
    await this.transaccionesdebitoRepository.save(newTransaccion);

    // Histórico como fila nueva (V2-16): guardar la misma entidad llevaba el Id
    // de TransaccionesDebito y save() sobrescribía el histórico con ese Id.
    const { id: liveId, ...rechazoBody } = newTransaccion;
    await this.historicoTransaccionesDebitoRepository.insert({
      ...rechazoBody,
      idTransaccionOrigen: Number(liveId),
    });

    // Registrar en bitácora
    const tipoTarifaTexto =
      tipoTarifa === EnumTipoTarifa.FIJA
        ? 'FIJA'
        : tipoTarifa === EnumTipoTarifa.ABIERTA
          ? 'ABIERTA'
          : 'OTRO';
    const mensajeRechazo =
      cantidadPasajes > 1
        ? `${cantidadPasajes} transacciones de débito RECHAZADAS por saldo insuficiente (Tarifa ${tipoTarifaTexto})`
        : `Transacción de débito RECHAZADA por saldo insuficiente (Tarifa ${tipoTarifaTexto})`;

    const detalleMonto =
      tipoTarifa === EnumTipoTarifa.ABIERTA
        ? `cobro máximo de $${(cobroMaximo || 0).toFixed(2)} por pasaje`
        : `monto de $${montoConDescuento.toFixed(2)} por pasaje`;

    await this.bitacoraLogger.logToBitacora(
      'Transacciones',
      mensajeRechazo,
      'CREATE',
      {
        numeroSerieMonedero: dto.numeroSerieMonedero ?? null,
        numeroSerieValidador: dto.numeroSerieValidador ?? null,
        cantidadPasajes,
      },
      idUser,
      EnumModulos.TRANSACCIONES,
      EstatusEnumBitcora.ERROR,
      `Saldo insuficiente. Se intentó validar $${montoTotalAValidar.toFixed(2)} (${cantidadPasajes} pasaje${cantidadPasajes > 1 ? 's' : ''} con ${detalleMonto})`,
    );

    const mensajeError =
      tipoTarifa === EnumTipoTarifa.ABIERTA
        ? `Saldo insuficiente. Se requiere $${montoTotalAValidar.toFixed(2)} para ${cantidadPasajes} pasaje${cantidadPasajes > 1 ? 's' : ''} (cobro máximo: $${(cobroMaximo || 0).toFixed(2)} por pasaje)`
        : `Saldo insuficiente. Se requiere $${montoTotalAValidar.toFixed(2)} para ${cantidadPasajes} pasaje${cantidadPasajes > 1 ? 's' : ''} (monto: $${montoConDescuento.toFixed(2)} por pasaje)`;

    throw new BadRequestException(mensajeError);
  }

  //funcion para obtener los clientes hijos
  private async clienteHijos(cliente: number) {
    return clienteHijosDesdeSp(this.clienteRepository.manager, cliente);
  }

  /**
   * Cierra una transacción ABIERTA (tarifa abierta o por estaciones) en el punto
   * de la validación actual: calcula el monto con la tarifa de su viaje, aplica
   * descuentos, descuenta el saldo y la pasa a PAGADO (todo en una TX).
   * Devuelve el monto cobrado, o null si otra lectura ya la había cerrado.
   */
  private async cerrarTransaccionAbierta(
    transaccionAbiertaFisica: TransaccionesDebito,
    monedero: Monederos,
    latitudFinal: number,
    longitudFinal: number,
    fechaHoraActual: Date,
    idUser: number,
  ): Promise<number | null> {
    // Obtener variante y tarifa de la transacción existente usando idViaje
    let varianteUpdate: Variantes | null = null;
    let tarifaInfoUpdate: any = null;

    if (transaccionAbiertaFisica.idViaje) {
      const viaje = await this.viajesRepository.findOne({
        where: { id: transaccionAbiertaFisica.idViaje },
        relations: ['idVariante2'],
      });

      if (viaje && viaje.idVariante) {
        varianteUpdate = await this.variantesRepository.findOne({
          where: { id: viaje.idVariante },
        });

        if (varianteUpdate) {
          const tarifa = await this.tarifasRepository.findOne({
            where: { idVariante: viaje.idVariante, estatus: 1 },
          });

          if (tarifa) {
            tarifaInfoUpdate = {
              TarifaBase: tarifa.tarifaBase,
              CostoAdicional: tarifa.costoAdicional,
              DistanciaBaseKm: tarifa.distanciaBaseKm,
              IncrementoCadaMetros: tarifa.incrementoCadaMetros,
              TipoTarifa: tarifa.tipoTarifa,
              CostoPorEstacion: tarifa.costoPorEstacion,
              CantidadEstacionesBase: tarifa.cantidadEstacionesBase,
            };
          }
        }
      }
    }

    // Calcular distancia desde punto inicial hasta punto final usando haversine
    if (
      transaccionAbiertaFisica.latitudInicial &&
      transaccionAbiertaFisica.longitudInicial
    ) {
      const puntoInicial = {
        latitude: transaccionAbiertaFisica.latitudInicial,
        longitude: transaccionAbiertaFisica.longitudInicial,
      };
      const puntoFinal = {
        latitude: latitudFinal,
        longitude: longitudFinal,
      };

      // Calcular distancia en metros usando haversine
      const distanciaMetros = haversine(puntoInicial, puntoFinal);
      const distanciaKm = distanciaMetros / 1000; // Convertir a kilómetros

      // Calcular monto basado en la distancia
      const tarifaBaseUpdate =
        Number(transaccionAbiertaFisica.monto) ||
        Number(tarifaInfoUpdate?.TarifaBase) ||
        0;
      let montoCalculado = tarifaBaseUpdate;

      // Tarifa por estaciones (TipoTarifa=3): calcular por número de estaciones recorridas
      if (
        tarifaInfoUpdate &&
        Number(tarifaInfoUpdate.TipoTarifa) === EnumTipoTarifa.ESTACIONES
      ) {
        const estaciones = this.obtenerEstacionesDeVariante(varianteUpdate);
        const idxInicio = this.encontrarIndiceEstacionMasCercana(
          estaciones,
          Number(transaccionAbiertaFisica.latitudInicial),
          Number(transaccionAbiertaFisica.longitudInicial),
        );
        const idxFin = this.encontrarIndiceEstacionMasCercana(
          estaciones,
          Number(latitudFinal),
          Number(longitudFinal),
        );

        const costoPorEstacion = tarifaInfoUpdate.CostoPorEstacion
          ? Number(tarifaInfoUpdate.CostoPorEstacion)
          : 0;
        const cantidadBase = tarifaInfoUpdate.CantidadEstacionesBase
          ? Number(tarifaInfoUpdate.CantidadEstacionesBase)
          : 0;
        const estacionesRecorridas =
          idxInicio !== -1 && idxFin !== -1 ? Math.abs(idxFin - idxInicio) : 0;
        const extras = Math.max(
          0,
          estacionesRecorridas - Math.max(0, cantidadBase),
        );
        montoCalculado = parseFloat(
          (tarifaBaseUpdate + extras * Math.max(0, costoPorEstacion)).toFixed(
            2,
          ),
        );
      }
      // Si es tarifa INCREMENTAL (tipoTarifa === 2) y hay configuración de costo adicional
      else if (tarifaInfoUpdate && tarifaInfoUpdate.TipoTarifa === 2) {
        const costoAdicional = tarifaInfoUpdate.CostoAdicional
          ? Number(tarifaInfoUpdate.CostoAdicional)
          : 0;
        const distanciaBaseKm = tarifaInfoUpdate.DistanciaBaseKm
          ? Number(tarifaInfoUpdate.DistanciaBaseKm)
          : 0;
        const incrementoCadaMetros = tarifaInfoUpdate.IncrementoCadaMetros
          ? Number(tarifaInfoUpdate.IncrementoCadaMetros)
          : 0;

        if (costoAdicional > 0 && incrementoCadaMetros > 0) {
          const distanciaBaseMetros = distanciaBaseKm * 1000;

          // Si la distancia recorrida excede la distancia base, calcular el extra
          if (distanciaMetros > distanciaBaseMetros) {
            const distanciaExcedente = distanciaMetros - distanciaBaseMetros;
            const numeroIncrementos = Math.ceil(
              distanciaExcedente / incrementoCadaMetros,
            );
            const extraPorDistancia = numeroIncrementos * costoAdicional;
            montoCalculado = tarifaBaseUpdate + extraPorDistancia;
          }
        }
      }

      // Validar que el monto calculado no exceda el cobro máximo
      if (transaccionAbiertaFisica.cobroMaximo) {
        const cobroMaximoNum = Number(transaccionAbiertaFisica.cobroMaximo);
        if (montoCalculado > cobroMaximoNum) {
          montoCalculado = cobroMaximoNum;
        }
      }

      // Aplicar descuentos (igual que en el PATCH)
      let montoConDescuento = montoCalculado;

      // PASO 1: Aplicar descuento por tipo de pasajero SOLO cuando la tarifa es ABIERTA o ESTACIONES
      const tipoTarifaUpdate =
        tarifaInfoUpdate && tarifaInfoUpdate.TipoTarifa
          ? Number(tarifaInfoUpdate.TipoTarifa)
          : null;

      if (
        (tipoTarifaUpdate === EnumTipoTarifa.ABIERTA ||
          tipoTarifaUpdate === EnumTipoTarifa.ESTACIONES) &&
        monedero.idTipoPasajero
      ) {
        const tipoPasajero = await this.CatTiposPasajerosRepository.findOne({
          where: { id: monedero.idTipoPasajero },
          relations: ['CatTipoDescuento'],
        });

        if (
          tipoPasajero &&
          tipoPasajero.cantidad &&
          tipoPasajero.cantidad > 0 &&
          tipoPasajero.idCatTipoDescuento
        ) {
          const tipoDescuento = Number(tipoPasajero.idCatTipoDescuento);
          const cantidad = Number(tipoPasajero.cantidad);

          // idCatTipoDescuento: 1 = PORCENTAJE, 2 = MONETARIO
          if (tipoDescuento === 1) {
            const descuentoPorcentual = (montoConDescuento * cantidad) / 100;
            montoConDescuento = montoConDescuento - descuentoPorcentual;
          } else if (tipoDescuento === 2) {
            montoConDescuento = montoConDescuento - cantidad;
          }

          if (montoConDescuento < 0) {
            montoConDescuento = 0;
          }
        }
      }

      // PASO 2: Aplicar descuento de transbordo
      if (
        transaccionAbiertaFisica.descuentoTransbordo !== null &&
        transaccionAbiertaFisica.descuentoTransbordo !== undefined &&
        transaccionAbiertaFisica.tipoDescuentoTransbordo !== null
      ) {
        const descuentoTransbordo = Number(
          transaccionAbiertaFisica.descuentoTransbordo,
        );
        const tipoDescuentoTransbordo = Number(
          transaccionAbiertaFisica.tipoDescuentoTransbordo,
        );

        if (descuentoTransbordo > 0) {
          if (
            tipoDescuentoTransbordo === EnumTipoDescuentoTransbordo.MONETARIO
          ) {
            montoConDescuento = montoConDescuento - descuentoTransbordo;
          } else if (
            tipoDescuentoTransbordo === EnumTipoDescuentoTransbordo.PORCENTAJE
          ) {
            const descuentoPorcentual =
              (montoConDescuento * descuentoTransbordo) / 100;
            montoConDescuento = montoConDescuento - descuentoPorcentual;
          }

          if (montoConDescuento < 0) {
            montoConDescuento = 0;
          }
        }
      }

      // Date, no texto: un string se reinterpreta con la zona del equipo.
      const fechaHoraFinal = fechaHoraActual;

      // Descuento, cierre condicionado e histórico en una sola TX
      // (H-08 / V2-06): si otra lectura de la misma tarjeta ya cerró
      // esta ABIERTA (affected = 0), se revierte el descuento y no
      // se cobra dos veces.
      try {
        await this.dataSource.transaction(async (manager) => {
          const descontado = await this.monederosService.descontarSaldoAtomico(
            monedero.numeroSerie,
            montoConDescuento,
            idUser,
            manager,
          );
          if (!descontado) {
            throw new BadRequestException(
              `Saldo insuficiente para cerrar transacción abierta física ID: ${transaccionAbiertaFisica.id}`,
            );
          }

          const cierre = await manager
            .getRepository(TransaccionesDebito)
            .update(
              {
                id: transaccionAbiertaFisica.id,
                controlTransaccion: EnumControlTransacciones.ABIERTA,
              },
              {
                idTipoTransaccion: EnumTipoTransaccion.DEBITO,
                monto: montoConDescuento,
                controlTransaccion: EnumControlTransacciones.PAGADO,
                latitudFinal: latitudFinal,
                longitudFinal: longitudFinal,
                fechaHoraFinal: fechaHoraFinal,
                distanciaRecorrida: parseFloat(distanciaKm.toFixed(2)),
              },
            );
          if (!cierre.affected) {
            throw new Error('ABIERTA_YA_CERRADA');
          }

          const transaccionActualizada = await manager
            .getRepository(TransaccionesDebito)
            .findOne({ where: { id: transaccionAbiertaFisica.id } });
          if (transaccionActualizada) {
            const { id: liveId, ...transaccionBody } = transaccionActualizada;
            await manager.getRepository(HistoricoTransaccionesDebito).save({
              ...transaccionBody,
              idTransaccionOrigen: Number(liveId),
            });
          }
        });
        monedero.saldo = Number(monedero.saldo) - montoConDescuento;
      } catch (cierreError) {
        if (
          cierreError instanceof Error &&
          cierreError.message === 'ABIERTA_YA_CERRADA'
        ) {
          return null;
        }
        throw cierreError;
      }
      return montoConDescuento;
    }

    return null;
  }

  private obtenerEstacionesDeVariante(
    variante: Variantes | null,
  ): Array<{ lat: number; lng: number; nombre: string }> {
    const recorrido = this.parsearRecorridoDetallado(
      variante?.recorridoDetallado ?? null,
    );
    if (!Array.isArray(recorrido)) return [];
    return recorrido
      .filter(
        (p: any) =>
          p &&
          typeof p.lat === 'number' &&
          typeof p.lng === 'number' &&
          typeof p.nombre === 'string' &&
          p.nombre.trim() !== '',
      )
      .map((p: any) => ({
        lat: p.lat,
        lng: p.lng,
        nombre: String(p.nombre).trim(),
      }));
  }

  private encontrarIndiceEstacionMasCercana(
    estaciones: Array<{ lat: number; lng: number; nombre: string }>,
    lat: number,
    lng: number,
  ): number {
    if (!Array.isArray(estaciones) || estaciones.length === 0) return -1;
    let bestIdx = -1;
    let bestDist = Infinity;
    const target = { latitude: lat, longitude: lng };
    for (let i = 0; i < estaciones.length; i++) {
      const e = estaciones[i];
      const dist = haversine(target, { latitude: e.lat, longitude: e.lng });
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  async paginado(
    idUser: number,
    email: string,
    cliente: number,
    rol: number,
    page: number,
    limit: number,
    fechaInicio?: string,
    fechaFin?: string,
  ): Promise<ApiResponseCommon> {
    try {
      //Declaramos las variables para el consumo del api
      let entidadRecarga;
      let entidadDebito;
      let transacciones;
      //Generamos la fecha actual
      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }
      const fechaDesfasada = nowDb();
      // Solo la fecha del momento
      const fechaActual = `${fechaDesfasada.getUTCFullYear()}-${pad(fechaDesfasada.getUTCMonth() + 1)}-${pad(fechaDesfasada.getUTCDate())}`;

      //Si fechaInicio y fechaFin son null arroja las transacciones del dia de la tabla TransaccionesRecarga y TransaccionesDebito
      if (!fechaInicio && !fechaFin) {
        fechaInicio = fechaActual;
        fechaFin = fechaActual;
        // Rol 11 (Cajero): solo recargas por IdUsuario (disponible en histórico)
        entidadRecarga =
          rol === 11 ? 'HistoricoTransaccionesRecarga' : 'TransaccionesRecarga';
        entidadDebito = 'TransaccionesDebito';
        transacciones = await this.resolverPorRolDefault(
          idUser,
          fechaInicio,
          fechaFin,
          email,
          cliente,
          rol,
          page,
          limit,
          entidadDebito,
          entidadRecarga,
        );
      } else {
        //Si fechaInicio y fechaFin no son null arroja las transacciones del dia de la tabla HistoricoTransaccionesRecarga y HistoricoTransaccionesDebito
        //asigna fechaActual solo si el valor de la izquierda es null o undefined
        fechaInicio = assertIsoDate(
          fechaInicio?.split('T')[0] ?? fechaActual,
          'fechaInicio',
        );
        fechaFin = assertIsoDate(
          fechaFin?.split('T')[0] ?? fechaActual,
          'fechaFin',
        );
        assertDateWindow(fechaInicio, fechaFin);
        // Rol 11 (Cajero): solo recargas por IdUsuario (histórico)
        entidadRecarga =
          rol === 11
            ? 'HistoricoTransaccionesRecarga'
            : 'HistoricoTransaccionesRecarga';
        entidadDebito = 'HistoricoTransaccionesDebito';
        transacciones = await this.resolverPorRolDefault(
          idUser,
          fechaInicio,
          fechaFin,
          email,
          cliente,
          rol,
          page,
          limit,
          entidadDebito,
          entidadRecarga,
        );
      }

      const { data, total } = transacciones;

      //API Response
      const result: ApiResponseCommon = {
        data: data,
        paginated: {
          total: total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException({
        message: 'Error al obtener transacciones paginado.',
      });
    }
  }

  async paginadoDebitoQR(
    idUser: number,
    email: string,
    cliente: number,
    rol: number,
    page: number,
    limit: number,
    fechaInicio?: string,
    fechaFin?: string,
  ): Promise<ApiResponseCommon> {
    try {
      //Declaramos las variables para el consumo del api
      let entidadDebito;
      let transacciones;
      //Generamos la fecha actual
      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }
      const fechaDesfasada = nowDb();
      // Solo la fecha del momento
      const fechaActual = `${fechaDesfasada.getUTCFullYear()}-${pad(fechaDesfasada.getUTCMonth() + 1)}-${pad(fechaDesfasada.getUTCDate())}`;

      //Si fechaInicio y fechaFin son null arroja las transacciones del dia de la tabla TransaccionesDebito
      if (!fechaInicio && !fechaFin) {
        fechaInicio = fechaActual;
        fechaFin = fechaActual;
        entidadDebito = 'TransaccionesDebito';
        transacciones = await this.resolverPorRolDebitoQR(
          fechaInicio,
          fechaFin,
          email,
          cliente,
          rol,
          page,
          limit,
          entidadDebito,
        );
      } else {
        //Si fechaInicio y fechaFin no son null arroja las transacciones del dia de la tabla HistoricoTransaccionesDebito
        //asigna fechaActual solo si el valor de la izquierda es null o undefined
        fechaInicio = assertIsoDate(
          fechaInicio?.split('T')[0] ?? fechaActual,
          'fechaInicio',
        );
        fechaFin = assertIsoDate(
          fechaFin?.split('T')[0] ?? fechaActual,
          'fechaFin',
        );
        assertDateWindow(fechaInicio, fechaFin);
        entidadDebito = 'HistoricoTransaccionesDebito';
        transacciones = await this.resolverPorRolDebitoQR(
          fechaInicio,
          fechaFin,
          email,
          cliente,
          rol,
          page,
          limit,
          entidadDebito,
        );
      }

      const { data, total } = transacciones;

      //API Response
      const result: ApiResponseCommon = {
        data: data,
        paginated: {
          total: total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException({
        message: 'Error al obtener transacciones débito QR paginado.',
      });
    }
  }

  async resolverPorRolDebitoQR(
    fechaInicio: string,
    fechaFin: string,
    email: string,
    cliente: number,
    rol: number,
    page: number,
    limit: number,
    entidadDebito: string,
  ) {
    try {
      let totalResult;
      let transacciones;
      const offset = (page - 1) * limit;

      switch (Number(rol)) {
        case 1:
          transacciones = await this.transaccionesrecargaRepository.query(
            `
SELECT 
    'DEBITO' AS origenTabla,
    td.Id AS id,
    ctt.Nombre AS tipoTransaccion,
    td.Monto AS monto,
    td.LatitudInicial AS latitudInicial,
    td.LongitudInicial AS longitudInicial,
    COALESCE(td.LatitudFinal, td.LatitudInicial) AS latitudFinal,
    COALESCE(td.LongitudFinal, td.LongitudInicial) AS longitudFinal,
    td.FechaHoraInicio AS fechaHoraInicio,
    td.FechaHoraFinal AS fechaHoraFinal,
    td.FHRegistro AS fhRegistro,
    td.NumeroSerieMonedero AS numeroSerieMonedero,
    td.NumeroSerieValidador AS numeroSerieValidador,
    td.EsQR AS esQR,
    NULL AS nombreMetodoPago,
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    d.Marca AS marcaDispositivo,
    d.Modelo AS modeloDispositivo,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero
FROM ${entidadDebito} td
LEFT JOIN CatTiposTransacciones ctt 
    ON td.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON td.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON td.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
    ON m.IdCliente = c.Id
WHERE DATE(td.FHRegistro) BETWEEN ? AND ?
AND td.EsQR = 1
ORDER BY td.FHRegistro DESC
LIMIT ? OFFSET ?;
        `,
            [fechaInicio, fechaFin, Number(limit), Number(offset)],
          );

          // Query para total (sin paginación)
          totalResult = await this.transaccionesrecargaRepository.query(
            `
SELECT COUNT(*) AS total
FROM ${entidadDebito} td
LEFT JOIN CatTiposTransacciones ctt 
    ON td.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON td.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON td.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
    ON m.IdCliente = c.Id
WHERE DATE(td.FHRegistro) BETWEEN ? AND ?
AND td.EsQR = 1;
  `,
            [fechaInicio, fechaFin],
          );
          break;

        case 9:
          //Datos por usuario
          const pasajero =
            await this.pasajeroService.findOnePasajeroCorreo(email);

          if (!pasajero || !pasajero.id) {
            throw new NotFoundException(
              'Pasajero no encontrado para el usuario',
            );
          }

          // Validar parámetros
          if (!fechaInicio || !fechaFin) {
            throw new BadRequestException(
              'Las fechas de inicio y fin son requeridas',
            );
          }
          if (!entidadDebito) {
            throw new BadRequestException('La entidad de débito es requerida');
          }

          const pasajeroId = Number(pasajero.id);
          const limitNum = Number(limit);
          const offsetNum = Number(offset);

          transacciones = await this.transaccionesrecargaRepository.query(
            `
SELECT 
    'DEBITO' AS origenTabla,
    td.Id AS id,
    ctt.Nombre AS tipoTransaccion,
    td.Monto AS monto,
    td.LatitudInicial AS latitudInicial,
    td.LongitudInicial AS longitudInicial,
    COALESCE(td.LatitudFinal, td.LatitudInicial) AS latitudFinal,
    COALESCE(td.LongitudFinal, td.LongitudInicial) AS longitudFinal,
    td.FechaHoraInicio AS fechaHoraInicio,
    td.FechaHoraFinal AS fechaHoraFinal,
    td.FHRegistro AS fhRegistro,
    td.NumeroSerieMonedero AS numeroSerieMonedero,
    td.NumeroSerieValidador AS numeroSerieValidador,
    td.EsQR AS esQR,
    NULL AS nombreMetodoPago,
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    d.Marca AS marcaDispositivo,
    d.Modelo AS modeloDispositivo,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero
FROM ${entidadDebito} td
LEFT JOIN CatTiposTransacciones ctt 
    ON td.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON td.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON td.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
    ON m.IdCliente = c.Id
WHERE DATE(td.FHRegistro) BETWEEN ? AND ?
AND m.Estatus = 1
AND p.Id = ?
AND td.EsQR = 1
ORDER BY td.FHRegistro DESC
LIMIT ? OFFSET ?;
        `,
            [fechaInicio, fechaFin, pasajeroId, limitNum, offsetNum],
          );

          // Query para total (sin paginación)
          totalResult = await this.transaccionesrecargaRepository.query(
            `
SELECT COUNT(*) AS total
FROM ${entidadDebito} td
LEFT JOIN CatTiposTransacciones ctt 
    ON td.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON td.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON td.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
    ON m.IdCliente = c.Id
WHERE DATE(td.FHRegistro) BETWEEN ? AND ?
AND m.Estatus = 1
AND p.Id = ?
AND td.EsQR = 1;
  `,
            [fechaInicio, fechaFin, Number(pasajero.id)],
          );

          break;

        case 3:
        default:
          // Cualquier otro rol (admin, operador, etc.): filtrar por idCliente + hijos
          const { ids, placeholders } = await this.clienteHijos(cliente);

          if (ids.length === 0) {
            return { data: [], total: 0 };
          }

          transacciones = await this.transaccionesrecargaRepository.query(
            `
SELECT 
    'DEBITO' AS origenTabla,
    td.Id AS id,
    ctt.Nombre AS tipoTransaccion,
    td.Monto AS monto,
    td.LatitudInicial AS latitudInicial,
    td.LongitudInicial AS longitudInicial,
    COALESCE(td.LatitudFinal, td.LatitudInicial) AS latitudFinal,
    COALESCE(td.LongitudFinal, td.LongitudInicial) AS longitudFinal,
    td.FechaHoraInicio AS fechaHoraInicio,
    td.FechaHoraFinal AS fechaHoraFinal,
    td.FHRegistro AS fhRegistro,
    td.NumeroSerieMonedero AS numeroSerieMonedero,
    td.NumeroSerieValidador AS numeroSerieValidador,
    td.EsQR AS esQR,
    NULL AS nombreMetodoPago,
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    d.Marca AS marcaDispositivo,
    d.Modelo AS modeloDispositivo,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero
FROM ${entidadDebito} td
LEFT JOIN CatTiposTransacciones ctt 
    ON td.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON td.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON td.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
    ON m.IdCliente = c.Id
WHERE DATE(td.FHRegistro) BETWEEN ? AND ?
AND m.IdCliente IN (${placeholders})
AND td.EsQR = 1
ORDER BY td.FHRegistro DESC
LIMIT ? OFFSET ?;
        `,
            [fechaInicio, fechaFin, ...ids, Number(limit), Number(offset)],
          );

          // Query para total (sin paginación)
          totalResult = await this.transaccionesrecargaRepository.query(
            `
SELECT COUNT(*) AS total
FROM ${entidadDebito} td
LEFT JOIN CatTiposTransacciones ctt 
    ON td.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON td.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON td.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
    ON m.IdCliente = c.Id
WHERE DATE(td.FHRegistro) BETWEEN ? AND ?
AND m.IdCliente IN (${placeholders})
AND td.EsQR = 1;
  `,
            [fechaInicio, fechaFin, ...ids],
          );
          break;
      }

      const total = Number(totalResult[0]?.total || 0);

      // Formatear resultados
      const data = transacciones.map((row: any) => ({
        origenTabla: row.origenTabla || 'DEBITO',
        id: row.id ? Number(row.id) : null,
        tipoTransaccion: row.tipoTransaccion || null,
        monto: row.monto ? Number(parseFloat(String(row.monto)).toFixed(2)) : 0,
        latitudInicial: row.latitudInicial
          ? Number(parseFloat(String(row.latitudInicial)).toFixed(7))
          : null,
        longitudInicial: row.longitudInicial
          ? Number(parseFloat(String(row.longitudInicial)).toFixed(7))
          : null,
        latitudFinal: row.latitudFinal
          ? Number(parseFloat(String(row.latitudFinal)).toFixed(7))
          : null,
        longitudFinal: row.longitudFinal
          ? Number(parseFloat(String(row.longitudFinal)).toFixed(7))
          : null,
        fechaHoraInicio: row.fechaHoraInicio || null,
        fechaHoraFinal: row.fechaHoraFinal || null,
        fhRegistro: row.fhRegistro || null,
        numeroSerieMonedero: row.numeroSerieMonedero || null,
        numeroSerieValidador: row.numeroSerieValidador || null,
        esQR:
          row.esQR !== null && row.esQR !== undefined ? Number(row.esQR) : null,
        nombreMetodoPago: row.nombreMetodoPago || null,
        idCliente: row.idCliente ? Number(row.idCliente) : null,
        nombreCliente: row.nombreCliente || null,
        apellidoPaternoCliente: row.apellidoPaternoCliente || null,
        apellidoMaternoCliente: row.apellidoMaternoCliente || null,
        marcaDispositivo: row.marcaDispositivo || null,
        modeloDispositivo: row.modeloDispositivo || null,
        idPasajero: row.idPasajero ? Number(row.idPasajero) : null,
        nombrePasajero: row.nombrePasajero || null,
        apellidoPaternoPasajero: row.apellidoPaternoPasajero || null,
        apellidoMaternoPasajero: row.apellidoMaternoPasajero || null,
      }));

      return { data, total };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException({
        message: 'Error al obtener transacciones débito QR paginado.',
      });
    }
  }

  async resolverPorRolDefault(
    idUser: number,
    fechaInicio: string,
    fechaFin: string,
    email: string,
    cliente: number,
    rol: number,
    page: number,
    limit: number,
    entidadDebito: string,
    entidadRecarga: string,
  ) {
    try {
      let totalResult;
      let transacciones;
      const offset = (page - 1) * limit;

      switch (Number(rol)) {
        case 1:
          transacciones = await this.transaccionesrecargaRepository.query(
            `
SELECT * FROM (
SELECT 
    'DEBITO' AS origenTabla,
    td.Id AS id,
    ctt.Nombre AS tipoTransaccion,
    td.Monto AS monto,
    td.LatitudInicial AS latitudInicial,
    td.LongitudInicial AS longitudInicial,
    COALESCE(td.LatitudFinal, td.LatitudInicial) AS latitudFinal,
    COALESCE(td.LongitudFinal, td.LongitudInicial) AS longitudFinal,
    td.FechaHoraInicio AS fechaHoraInicio,
    td.FechaHoraFinal AS fechaHoraFinal,
    td.FHRegistro AS fhRegistro,
    td.NumeroSerieMonedero AS numeroSerieMonedero,
    td.NumeroSerieValidador AS numeroSerieValidador,
    td.EsQR AS esQR,
    NULL AS nombreMetodoPago,
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    d.Marca AS marcaDispositivo,
    d.Modelo AS modeloDispositivo,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero
FROM ${entidadDebito} td
LEFT JOIN CatTiposTransacciones ctt 
    ON td.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON td.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON td.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
	ON m.IdCliente = c.Id
WHERE DATE(td.FHRegistro) BETWEEN ? AND ?
UNION ALL
SELECT 
    'RECARGA' AS origenTabla,
    tr.Id AS id,
    ctt.Nombre AS tipoTransaccion,
    tr.Monto AS monto,
    NULL AS latitudInicial,
    NULL AS longitudInicial,
    tr.LatitudFinal AS latitudFinal,
    tr.LongitudFinal AS longitudFinal,
    NULL AS fechaHoraInicio,
    tr.FechaHoraFinal AS fechaHoraFinal,
    tr.FHRegistro AS fhRegistro,
    tr.NumeroSerieMonedero AS numeroSerieMonedero,
    tr.NumeroSerieValidador AS numeroSerieValidador,
    NULL AS esQR,
    NULL AS nombreMetodoPago,
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    d.Marca AS marcaDispositivo,
    d.Modelo AS modeloDispositivo,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero
FROM ${entidadRecarga} tr
LEFT JOIN CatTiposTransacciones ctt 
    ON tr.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON tr.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
	ON m.IdCliente = c.Id
WHERE DATE(tr.FHRegistro) BETWEEN ? AND ?
) AS todas_transacciones
ORDER BY todas_transacciones.fhRegistro DESC
LIMIT ? OFFSET ?;
        `,
            [
              fechaInicio,
              fechaFin,
              fechaInicio,
              fechaFin,
              Number(limit),
              Number(offset),
            ],
          );

          // Query para total (sin paginación)
          totalResult = await this.transaccionesrecargaRepository.query(
            `
SELECT COUNT(*) AS total
FROM (
    SELECT td.Id
    FROM ${entidadDebito} td
LEFT JOIN CatTiposTransacciones ctt 
    ON td.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON td.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON td.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
	ON m.IdCliente = c.Id
WHERE DATE(td.FHRegistro) BETWEEN ? AND ?
    UNION ALL
    SELECT tr.Id
    FROM ${entidadRecarga} tr
LEFT JOIN CatTiposTransacciones ctt 
    ON tr.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON tr.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
	ON m.IdCliente = c.Id
WHERE DATE(tr.FHRegistro) BETWEEN ? AND ?
) AS todas;
  `,
            [fechaInicio, fechaFin, fechaInicio, fechaFin],
          );
          break;

        case 11:
          // Cajero: solo recargas donde IdUsuario = idUser (token)
          // Nota: este filtro solo está disponible en la tabla histórica de recargas.
          const queryRecargasRol11 = `
SELECT 
    'RECARGA' AS origenTabla,
    htr.Id AS id,
    ctt.Nombre AS tipoTransaccion,
    htr.Monto AS monto,
    NULL AS latitudInicial,
    NULL AS longitudInicial,
    htr.LatitudFinal AS latitudFinal,
    htr.LongitudFinal AS longitudFinal,
    NULL AS fechaHoraInicio,
    htr.FechaHoraFinal AS fechaHoraFinal,
    htr.FHRegistro AS fhRegistro,
    htr.NumeroSerieMonedero AS numeroSerieMonedero,
    htr.NumeroSerieValidador AS numeroSerieValidador,
    NULL AS esQR,
    COALESCE(cmp.Nombre, 'Efectivo') AS nombreMetodoPago,
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    d.Marca AS marcaDispositivo,
    d.Modelo AS modeloDispositivo,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero
FROM ${entidadRecarga} htr
LEFT JOIN CatTiposTransacciones ctt 
    ON htr.IdTipoTransaccion = ctt.Id
LEFT JOIN CatMetodoPago cmp 
    ON htr.IdMetodoPago = cmp.Id
LEFT JOIN Validadores d 
    ON htr.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON htr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
    ON m.IdCliente = c.Id
WHERE DATE(htr.FHRegistro) BETWEEN ? AND ?
AND htr.IdUsuario = ?
ORDER BY htr.FHRegistro DESC
LIMIT ? OFFSET ?;
          `;

          const queryRecargasRol11Params = [
            fechaInicio,
            fechaFin,
            Number(idUser),
            Number(limit),
            Number(offset),
          ];


          transacciones =
            await this.historicoTransaccionesRecargaRepository.query(
              queryRecargasRol11,
              queryRecargasRol11Params,
            );

          const queryRecargasRol11Total = `
SELECT COUNT(*) AS total
FROM ${entidadRecarga} htr
LEFT JOIN Monederos m 
    ON htr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c
    ON m.IdCliente = c.Id
WHERE DATE(htr.FHRegistro) BETWEEN ? AND ?
AND htr.IdUsuario = ?;
          `;

          const queryRecargasRol11TotalParams = [
            fechaInicio,
            fechaFin,
            Number(idUser),
          ];

          totalResult =
            await this.historicoTransaccionesRecargaRepository.query(
              queryRecargasRol11Total,
              queryRecargasRol11TotalParams,
            );
          break;

        case 9:
          //Datos por usuario
          const pasajero =
            await this.pasajeroService.findOnePasajeroCorreo(email);

          if (!pasajero || !pasajero.id) {
            throw new NotFoundException(
              'Pasajero no encontrado para el usuario',
            );
          }

          // Validar parámetros
          if (!fechaInicio || !fechaFin) {
            throw new BadRequestException(
              'Las fechas de inicio y fin son requeridas',
            );
          }
          if (!entidadDebito || !entidadRecarga) {
            throw new BadRequestException(
              'Las entidades de débito y recarga son requeridas',
            );
          }

          const pasajeroId = Number(pasajero.id);
          const limitNum = Number(limit);
          const offsetNum = Number(offset);

          transacciones = await this.transaccionesrecargaRepository.query(
            `
SELECT * FROM (
SELECT 
    'DEBITO' AS origenTabla,
    td.Id AS id,
    ctt.Nombre AS tipoTransaccion,
    td.Monto AS monto,
    td.LatitudInicial AS latitudInicial,
    td.LongitudInicial AS longitudInicial,
    COALESCE(td.LatitudFinal, td.LatitudInicial) AS latitudFinal,
    COALESCE(td.LongitudFinal, td.LongitudInicial) AS longitudFinal,
    td.FechaHoraInicio AS fechaHoraInicio,
    td.FechaHoraFinal AS fechaHoraFinal,
    td.FHRegistro AS fhRegistro,
    td.NumeroSerieMonedero AS numeroSerieMonedero,
    td.NumeroSerieValidador AS numeroSerieValidador,
    td.EsQR AS esQR,
    NULL AS nombreMetodoPago,
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    d.Marca AS marcaDispositivo,
    d.Modelo AS modeloDispositivo,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero
FROM ${entidadDebito} td
LEFT JOIN CatTiposTransacciones ctt 
    ON td.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON td.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON td.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
	ON m.IdCliente = c.Id
WHERE DATE(td.FHRegistro) BETWEEN ? AND ?
AND m.Estatus = 1
AND p.Id = ?
UNION ALL
SELECT 
    'RECARGA' AS origenTabla,
    tr.Id AS id,
    ctt.Nombre AS tipoTransaccion,
    tr.Monto AS monto,
    NULL AS latitudInicial,
    NULL AS longitudInicial,
    tr.LatitudFinal AS latitudFinal,
    tr.LongitudFinal AS longitudFinal,
    NULL AS fechaHoraInicio,
    tr.FechaHoraFinal AS fechaHoraFinal,
    tr.FHRegistro AS fhRegistro,
    tr.NumeroSerieMonedero AS numeroSerieMonedero,
    tr.NumeroSerieValidador AS numeroSerieValidador,
    NULL AS esQR,
    COALESCE(cmp.Nombre, 'Efectivo') AS nombreMetodoPago,
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    d.Marca AS marcaDispositivo,
    d.Modelo AS modeloDispositivo,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero
FROM ${entidadRecarga} tr
LEFT JOIN CatTiposTransacciones ctt 
    ON tr.IdTipoTransaccion = ctt.Id
LEFT JOIN CatMetodoPago cmp 
    ON tr.IdMetodoPago = cmp.Id
LEFT JOIN Validadores d 
    ON tr.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
	ON m.IdCliente = c.Id
WHERE DATE(tr.FHRegistro) BETWEEN ? AND ?
AND m.Estatus = 1
AND p.Id = ?
) AS todas_transacciones
ORDER BY todas_transacciones.fhRegistro DESC
LIMIT ? OFFSET ?;
        `,
            [
              fechaInicio,
              fechaFin,
              pasajeroId,
              fechaInicio,
              fechaFin,
              pasajeroId,
              limitNum,
              offsetNum,
            ],
          );

          // Query para total (sin paginaci?n)
          totalResult = await this.transaccionesrecargaRepository.query(
            `
SELECT COUNT(*) AS total
FROM (
    SELECT td.Id
    FROM ${entidadDebito} td
LEFT JOIN CatTiposTransacciones ctt 
    ON td.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON td.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON td.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
	ON m.IdCliente = c.Id
    
-- condiciones
WHERE DATE(td.FHRegistro) BETWEEN ? AND ?
AND m.Estatus = 1
AND p.Id = ?
    UNION ALL

    SELECT tr.Id
    FROM ${entidadRecarga} tr
LEFT JOIN CatTiposTransacciones ctt 
    ON tr.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON tr.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
	ON m.IdCliente = c.Id
    
-- condiciones
WHERE DATE(tr.FHRegistro) BETWEEN ? AND ?
AND m.Estatus = 1
AND p.Id = ?
) AS todas;

  `,
            [
              fechaInicio,
              fechaFin,
              Number(pasajero.id),
              fechaInicio,
              fechaFin,
              Number(pasajero.id),
            ],
          );

          break;

        case 3:
        default:
          // Cualquier otro rol (admin, operador, etc.): filtrar por idCliente + hijos
          const { ids, placeholders } = await this.clienteHijos(cliente);
          transacciones = await this.transaccionesrecargaRepository.query(
            `
SELECT 
    'DEBITO' AS origenTabla,
    td.Id AS id,
    ctt.Nombre AS tipoTransaccion,
    td.Monto AS monto,
    td.LatitudInicial AS latitudInicial,
    td.LongitudInicial AS longitudInicial,
    COALESCE(td.LatitudFinal, td.LatitudInicial) AS latitudFinal,
    COALESCE(td.LongitudFinal, td.LongitudInicial) AS longitudFinal,
    td.FechaHoraInicio AS fechaHoraInicio,
    td.FechaHoraFinal AS fechaHoraFinal,
    td.FHRegistro AS fhRegistro,
    td.NumeroSerieMonedero AS numeroSerieMonedero,
    td.NumeroSerieValidador AS numeroSerieValidador,
    td.EsQR AS esQR,
    NULL AS nombreMetodoPago,
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    d.Marca AS marcaDispositivo,
    d.Modelo AS modeloDispositivo,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero
FROM ${entidadDebito} td
LEFT JOIN CatTiposTransacciones ctt 
    ON td.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON td.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON td.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
	ON m.IdCliente = c.Id
WHERE DATE(td.FHRegistro) BETWEEN ? AND ?
AND m.IdCliente IN (${placeholders})
UNION ALL
SELECT 
    'RECARGA' AS origenTabla,
    tr.Id AS id,
    ctt.Nombre AS tipoTransaccion,
    tr.Monto AS monto,
    NULL AS latitudInicial,
    NULL AS longitudInicial,
    tr.LatitudFinal AS latitudFinal,
    tr.LongitudFinal AS longitudFinal,
    NULL AS fechaHoraInicio,
    tr.FechaHoraFinal AS fechaHoraFinal,
    tr.FHRegistro AS fhRegistro,
    tr.NumeroSerieMonedero AS numeroSerieMonedero,
    tr.NumeroSerieValidador AS numeroSerieValidador,
    NULL AS esQR,
    COALESCE(cmp.Nombre, 'Efectivo') AS nombreMetodoPago,
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    d.Marca AS marcaDispositivo,
    d.Modelo AS modeloDispositivo,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero
FROM ${entidadRecarga} tr
LEFT JOIN CatTiposTransacciones ctt 
    ON tr.IdTipoTransaccion = ctt.Id
LEFT JOIN CatMetodoPago cmp 
    ON tr.IdMetodoPago = cmp.Id
LEFT JOIN Validadores d 
    ON tr.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
	ON m.IdCliente = c.Id
WHERE DATE(tr.FHRegistro) BETWEEN ? AND ?
AND m.IdCliente IN (${placeholders})
ORDER BY FHRegistro DESC
LIMIT ? OFFSET ?;
        `,
            [
              fechaInicio,
              fechaFin,
              ...ids,
              fechaInicio,
              fechaFin,
              ...ids,
              Number(limit),
              Number(offset),
            ],
          );

          // Query para total (sin paginación)
          totalResult = await this.transaccionesrecargaRepository.query(
            `
SELECT COUNT(*) AS total
FROM (
    SELECT td.Id
    FROM ${entidadDebito} td
LEFT JOIN CatTiposTransacciones ctt 
    ON td.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON td.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON td.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
	ON m.IdCliente = c.Id
WHERE DATE(td.FHRegistro) BETWEEN ? AND ?
AND m.IdCliente IN (${placeholders})
    UNION ALL
    SELECT tr.Id
    FROM ${entidadRecarga} tr
LEFT JOIN CatTiposTransacciones ctt 
    ON tr.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON tr.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
	ON m.IdCliente = c.Id
WHERE DATE(tr.FHRegistro) BETWEEN ? AND ?
AND m.IdCliente IN (${placeholders})
) AS todas;
  `,
            [fechaInicio, fechaFin, ...ids, fechaInicio, fechaFin, ...ids],
          );
          break;
      }

      const total = Number(totalResult[0]?.total || 0);

      // Validar que transacciones sea un array
      if (!Array.isArray(transacciones)) {
        throw new BadRequestException({
          message: 'Error: las transacciones no se obtuvieron correctamente',
        });
      }
      // ?? Transformaci?n de datos (ids ? number, nombreCompleto)
      const data = transacciones.map((item) => ({
        ...item,
        id: Number(item.id),
        monto: Number(item.monto),
        latitudInicial: item.latitudInicial
          ? Number(item.latitudInicial)
          : null,
        longitudInicial: item.longitudInicial
          ? Number(item.longitudInicial)
          : null,
        latitudFinal: item.latitudFinal ? Number(item.latitudFinal) : null,
        longitudFinal: item.longitudFinal ? Number(item.longitudFinal) : null,
        idCliente: item.idCliente ? Number(item.idCliente) : null,
        idPasajero: item.idPasajero ? Number(item.idPasajero) : null,
        tipoMonedero:
          item.origenTabla === 'DEBITO' && item.esQR !== undefined
            ? this.transformarEsQR(Number(item.esQR))
            : null,
      }));

      //API Response
      const result: ApiResponseCommon = {
        data: data,
        paginated: {
          total: total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };
      return { data, total };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        'Error al obtener transacciones paginadas por rol',
      );
    }
  }

  async findAllTransacciones(
    idUser: number,
    email: string,
    cliente: number,
    rol: number,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      let totalResult;
      let transacciones;
      const offset = (page - 1) * limit;
      switch (Number(rol)) {
        case 1:
          transacciones = await this.transaccionesrecargaRepository.query(
            `
SELECT 
    'DEBITO' AS origenTabla,
    td.Id AS id,
    ctt.Nombre AS tipoTransaccion,
    td.Monto AS monto,
    td.Latitud AS latitud,
    td.Longitud AS longitud,
    td.FechaHora AS fechaHora,
    td.FHRegistro AS fhRegistro,
    td.NumeroSerieMonedero AS numeroSerieMonedero,
    td.NumeroSerieValidador AS numeroSerieValidador,
    td.ControlTransaccion AS controlTransaccion,
    td.EsQR AS esQR,

    -- Datos del validador
    d.Marca AS marcaValidador,
    d.Modelo AS modeloValidador,
    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    



    -- Pasajero (via Monedero)
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero

FROM TransaccionesDebito td
INNER JOIN CatTiposTransacciones ctt 
    ON td.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON td.NumeroSerieValidador = d.NumeroSerie
INNER JOIN Monederos m 
    ON td.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
INNER JOIN Clientes c
	ON m.IdCliente = c.Id

UNION ALL

SELECT 
    'RECARGA' AS origenTabla,
    tr.Id AS id,
    ctt.Nombre AS tipoTransaccion,
    tr.Monto AS monto,
    tr.Latitud AS latitud,
    tr.Longitud AS longitud,
    tr.FechaHora AS fechaHora,
    tr.FHRegistro AS fhRegistro,
    tr.NumeroSerieMonedero AS numeroSerieMonedero,
    tr.NumeroSerieValidador AS numeroSerieValidador,
    tr.ControlTransaccion AS controlTransaccion,
    NULL AS esQR,

    d.Marca AS marcaValidador,
    d.Modelo AS modeloValidador,

    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    

  

    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero

FROM TransaccionesRecarga tr
INNER JOIN CatTiposTransacciones ctt 
    ON tr.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON tr.NumeroSerieValidador = d.NumeroSerie
INNER JOIN Monederos m 
    ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
INNER JOIN Clientes c
	ON m.IdCliente = c.Id

ORDER BY FHRegistro DESC
  LIMIT ? OFFSET ?;
        `,
            [limit, offset],
          );

          // Query para total (sin paginaci?n)
          totalResult = await this.transaccionesrecargaRepository.query(
            `
SELECT COUNT(*) AS total
FROM (
    SELECT td.Id
    FROM TransaccionesDebito td
    INNER JOIN CatTiposTransacciones ctt 
        ON td.IdTipoTransaccion = ctt.Id
    LEFT JOIN Validadores d 
        ON td.NumeroSerieValidador = d.NumeroSerie
    INNER JOIN Monederos m 
        ON td.NumeroSerieMonedero = m.NumeroSerie
    LEFT JOIN Pasajeros p 
        ON m.IdPasajero = p.Id

    UNION ALL

    SELECT tr.Id
    FROM TransaccionesRecarga tr
    INNER JOIN CatTiposTransacciones ctt 
        ON tr.IdTipoTransaccion = ctt.Id
    LEFT JOIN Validadores d 
        ON tr.NumeroSerieValidador = d.NumeroSerie
    INNER JOIN Monederos m 
        ON tr.NumeroSerieMonedero = m.NumeroSerie
    LEFT JOIN Pasajeros p 
        ON m.IdPasajero = p.Id
) AS todas;
		
  `,
          );
          break;

        case 9:
          //Datos por usuario
          const pasajero =
            await this.pasajeroService.findOnePasajeroCorreo(email);

          if (!pasajero || !pasajero.id) {
            throw new NotFoundException(
              'Pasajero no encontrado para el usuario',
            );
          }

          transacciones = await this.transaccionesrecargaRepository.query(
            `
(
  SELECT 
      'DEBITO' AS origenTabla,        
      td.Id AS id,
      ctt.Nombre AS tipoTransaccion,
      td.Monto AS monto,
      td.Latitud AS latitud,
      td.Longitud AS longitud,
      td.FechaHora AS fechaHora,
      td.FHRegistro AS fhRegistro,
      td.NumeroSerieMonedero AS numeroSerieMonedero,
      td.NumeroSerieValidador AS numeroSerieValidador,
      td.ControlTransaccion AS controlTransaccion,
      td.EsQR AS esQR,

      d.Marca AS marcaValidador,
      d.Modelo AS modeloValidador,

      p.Id AS idPasajero,
      p.Nombre AS nombrePasajero,
      p.ApellidoPaterno AS apellidoPaternoPasajero,
      p.ApellidoMaterno AS apellidoMaternoPasajero

  FROM TransaccionesDebito td
  INNER JOIN CatTiposTransacciones ctt ON td.IdTipoTransaccion = ctt.Id
  LEFT JOIN Validadores d ON td.NumeroSerieValidador = d.NumeroSerie
  INNER JOIN Monederos m ON td.NumeroSerieMonedero = m.NumeroSerie
  INNER JOIN Pasajeros p ON m.IdPasajero = p.Id
  WHERE p.Id = ?
  AND m.Estatus = 1

  UNION ALL

  SELECT 
      'RECARGA' AS origenTabla,
      tr.Id AS id,
      ctt.Nombre AS tipoTransaccion,
      tr.Monto AS monto,
      tr.Latitud AS latitud,
      tr.Longitud AS longitud,
      tr.FechaHora AS fechaHora,
      tr.FHRegistro AS fhRegistro,
      tr.NumeroSerieMonedero AS numeroSerieMonedero,
      tr.NumeroSerieValidador AS numeroSerieValidador,
      tr.ControlTransaccion AS controlTransaccion,
      NULL AS esQR,

      d.Marca AS marcaValidador,
      d.Modelo AS modeloValidador,

      p.Id AS idPasajero,
      p.Nombre AS nombrePasajero,
      p.ApellidoPaterno AS apellidoPaternoPasajero,
      p.ApellidoMaterno AS apellidoMaternoPasajero

  FROM TransaccionesRecarga tr
  INNER JOIN CatTiposTransacciones ctt ON tr.IdTipoTransaccion = ctt.Id
  LEFT JOIN Validadores d ON tr.NumeroSerieValidador = d.NumeroSerie
  INNER JOIN Monederos m ON tr.NumeroSerieMonedero = m.NumeroSerie
  INNER JOIN Pasajeros p ON m.IdPasajero = p.Id
  WHERE p.Id = ?
  AND m.Estatus = 1
)
ORDER BY FHRegistro DESC
LIMIT ? OFFSET ?;

        `,
            [Number(pasajero.id), Number(pasajero.id), limit, offset],
          );

          // Query para total (sin paginaci?n)
          totalResult = await this.transaccionesrecargaRepository.query(
            `
SELECT COUNT(*) AS total
FROM (
    SELECT td.Id
    FROM TransaccionesDebito td
    INNER JOIN CatTiposTransacciones ctt ON td.IdTipoTransaccion = ctt.Id
    INNER JOIN Monederos m ON td.NumeroSerieMonedero = m.NumeroSerie
    INNER JOIN Pasajeros p ON m.IdPasajero = p.Id
    WHERE p.Id = ?
      AND m.Estatus = 1

    UNION ALL

    SELECT tr.Id
    FROM TransaccionesRecarga tr
    INNER JOIN CatTiposTransacciones ctt ON tr.IdTipoTransaccion = ctt.Id
    INNER JOIN Monederos m ON tr.NumeroSerieMonedero = m.NumeroSerie
    INNER JOIN Pasajeros p ON m.IdPasajero = p.Id
    WHERE p.Id = ?
      AND m.Estatus = 1
) AS transacciones_pasajero;

  `,
            [Number(pasajero.id), Number(pasajero.id)], // <-- Aquí debe ir como segundo argumento de query()
          );

          break;

        case 3:
        default:
          // Cualquier otro rol (admin, operador, etc.): filtrar por idCliente + hijos
          const { ids, placeholders } = await this.clienteHijos(cliente);
          transacciones = await this.transaccionesrecargaRepository.query(
            `
(
  SELECT 
      'DEBITO' AS origenTabla,
      td.Id AS id,
      ctt.Nombre AS tipoTransaccion,
      td.Monto AS monto,
      td.Latitud AS latitud,
      td.Longitud AS longitud,
      td.FechaHora AS fechaHora,
      td.FHRegistro AS fhRegistro,
      td.NumeroSerieMonedero AS numeroSerieMonedero,
      td.NumeroSerieValidador AS numeroSerieValidador,
      td.ControlTransaccion AS controlTransaccion,
      td.EsQR AS esQR,

      d.Marca AS marcaValidador,
      d.Modelo AS modeloValidador,
      -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    



      p.Id AS idPasajero,
      p.Nombre AS nombrePasajero,
      p.ApellidoPaterno AS apellidoPaternoPasajero,
      p.ApellidoMaterno AS apellidoMaternoPasajero

  FROM TransaccionesDebito td
  INNER JOIN CatTiposTransacciones ctt 
      ON td.IdTipoTransaccion = ctt.Id
  LEFT JOIN Validadores d 
      ON td.NumeroSerieValidador = d.NumeroSerie
  INNER JOIN Monederos m 
      ON td.NumeroSerieMonedero = m.NumeroSerie
  LEFT JOIN Pasajeros p 
      ON m.IdPasajero = p.Id
  INNER JOIN Clientes c
	ON m.IdCliente = c.Id

  WHERE m.IdCliente IN (${placeholders})

  UNION ALL

  SELECT 
      'RECARGA' AS origenTabla,
      tr.Id AS id,
      ctt.Nombre AS tipoTransaccion,
      tr.Monto AS monto,
      tr.Latitud AS latitud,
      tr.Longitud AS longitud,
      tr.FechaHora AS fechaHora,
      tr.FHRegistro AS fhRegistro,
      tr.NumeroSerieMonedero AS numeroSerieMonedero,
      tr.NumeroSerieValidador AS numeroSerieValidador,
      tr.ControlTransaccion AS controlTransaccion,
      NULL AS esQR,

      d.Marca AS marcaValidador,
      d.Modelo AS modeloValidador,

      -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    


      p.Id AS idPasajero,
      p.Nombre AS nombrePasajero,
      p.ApellidoPaterno AS apellidoPaternoPasajero,
      p.ApellidoMaterno AS apellidoMaternoPasajero

  FROM TransaccionesRecarga tr
  INNER JOIN CatTiposTransacciones ctt 
      ON tr.IdTipoTransaccion = ctt.Id
  LEFT JOIN Validadores d 
      ON tr.NumeroSerieValidador = d.NumeroSerie
  INNER JOIN Monederos m 
      ON tr.NumeroSerieMonedero = m.NumeroSerie
  LEFT JOIN Pasajeros p 
      ON m.IdPasajero = p.Id
  INNER JOIN Clientes c
	ON m.IdCliente = c.Id

  WHERE m.IdCliente IN (${placeholders})
)
ORDER BY FHRegistro DESC
LIMIT ? OFFSET ?;

        `,
            [...ids, ...ids, limit, offset],
          );

          // Query para total (sin paginaci?n)
          totalResult = await this.transaccionesrecargaRepository.query(
            `
SELECT COUNT(*) AS total
FROM (
  SELECT td.Id
  FROM TransaccionesDebito td
  INNER JOIN Monederos m ON td.NumeroSerieMonedero = m.NumeroSerie
  WHERE m.IdCliente IN (${placeholders})

  UNION ALL

  SELECT tr.Id
  FROM TransaccionesRecarga tr
  INNER JOIN Monederos m ON tr.NumeroSerieMonedero = m.NumeroSerie
  WHERE m.IdCliente IN (${placeholders})
) AS todas;

  `,
            [...ids, ...ids],
          );
          break;
      }

      const total = Number(totalResult[0]?.total || 0);

      // ?? Transformaci?n de datos (ids ? number, nombreCompleto)
      const data = transacciones.map((item) => ({
        ...item,
        id: Number(item.id),
        monto: Number(item.monto),
        latitud: Number(item.latitud),
        longitud: Number(item.longitud),
        idPasajero: Number(item.idPasajero),
        tipoMonedero:
          item.origenTabla === 'DEBITO' && item.esQR !== undefined
            ? this.transformarEsQR(Number(item.esQR))
            : null,
      }));

      //API Response
      const result: ApiResponseCommon = {
        data: data,
        paginated: {
          total: total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Error al obtener transacciones: ${(error as Error)?.message}`);
      throw new BadRequestException({
        message: 'Error al obtener transacciones',
      });
    }
  }

  async findAllListTransacciones(
    cliente: number,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      let fechaInicio, fechaFin;
      let transacciones;
      let entidadRecarga;
      let entidadDebito;
      //Generamos la fecha actual
      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }
      const fechaDesfasada = nowDb();
      // Solo la fecha del momento
      const fechaActual = `${fechaDesfasada.getUTCFullYear()}-${pad(fechaDesfasada.getUTCMonth() + 1)}-${pad(fechaDesfasada.getUTCDate())}`;

      fechaInicio = fechaActual;
      fechaFin = fechaActual;
      entidadRecarga = 'TransaccionesRecarga';
      entidadDebito = 'TransaccionesDebito';
      switch (Number(rol)) {
        case 1:
          transacciones = await this.transaccionesrecargaRepository.query(
            `
SELECT 
    'DEBITO' AS origenTabla,
    td.Id AS id,
    ctt.Nombre AS tipoTransaccion,
    td.Monto AS monto,
    COALESCE(td.LatitudFinal, td.LatitudInicial) AS latitudFinal,
    COALESCE(td.LongitudFinal, td.LongitudInicial) AS longitudFinal,
    td.FechaHoraFinal AS fechaHoraFinal,
    td.FHRegistro AS fhRegistro,
    td.NumeroSerieMonedero AS numeroSerieMonedero,
    td.NumeroSerieValidador AS numeroSerieValidador,
    td.ControlTransaccion AS controlTransaccion,
    td.EsQR AS esQR,
    NULL AS nombreMetodoPago,

    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    

    -- Datos del validador
    d.Marca AS marcaValidador,
    d.Modelo AS modeloValidador,

    -- Pasajero (via Monedero)
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero

FROM ${entidadDebito} td
LEFT JOIN CatTiposTransacciones ctt 
    ON td.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON td.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON td.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
	ON m.IdCliente = c.Id
    
-- condiciones
WHERE DATE(td.FHRegistro) BETWEEN ? AND ?


UNION ALL

SELECT 
    'RECARGA' AS origenTabla,
    tr.Id AS id,
    ctt.Nombre AS tipoTransaccion,
    tr.Monto AS monto,
    tr.LatitudFinal AS latitudFinal,
    tr.LongitudFinal AS longitudFinal,
    tr.FechaHoraFinal AS fechaHoraFinal,
    tr.FHRegistro AS fhRegistro,
    tr.NumeroSerieMonedero AS numeroSerieMonedero,
    tr.NumeroSerieValidador AS numeroSerieValidador,
    tr.ControlTransaccion AS controlTransaccion,
    NULL AS esQR,
    COALESCE(cmp.Nombre, 'Efectivo') AS nombreMetodoPago,

    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    

    d.Marca AS marcaValidador,
    d.Modelo AS modeloValidador,

    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero

FROM ${entidadRecarga} tr
LEFT JOIN CatTiposTransacciones ctt 
    ON tr.IdTipoTransaccion = ctt.Id
LEFT JOIN CatMetodoPago cmp 
    ON tr.IdMetodoPago = cmp.Id
LEFT JOIN Validadores d 
    ON tr.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
	ON m.IdCliente = c.Id
    
-- condiciones
WHERE DATE(tr.FHRegistro) BETWEEN ? AND ?

ORDER BY FHRegistro DESC
        `,
            [fechaInicio, fechaFin, fechaInicio, fechaFin],
          );
          break;

        case 3:
        default:
          // Cualquier otro rol (admin, operador, etc.): filtrar por idCliente + hijos
          const { ids, placeholders } = await this.clienteHijos(cliente);
          transacciones = await this.transaccionesrecargaRepository.query(
            `
  SELECT 
      'DEBITO' AS origenTabla,
      td.Id AS id,
      ctt.Nombre AS tipoTransaccion,
      td.Monto AS monto,
      NULL AS latitudInicial,
      NULL AS longitudInicial,
      COALESCE(td.LatitudFinal, td.LatitudInicial) AS latitudFinal,
      COALESCE(td.LongitudFinal, td.LongitudInicial) AS longitudFinal,
      NULL AS fechaHoraInicio,
      td.FechaHoraFinal AS fechaHoraFinal,
      td.FHRegistro AS fhRegistro,
      td.NumeroSerieMonedero AS numeroSerieMonedero,
      td.NumeroSerieValidador AS numeroSerieValidador,
      td.EsQR AS esQR,
      NULL AS nombreMetodoPago,

      -- Datos del cliente
      c.Id AS idCliente,
      c.Nombre AS nombreCliente,
      c.ApellidoPaterno AS apellidoPaternoCliente,
      c.ApellidoMaterno AS apellidoMaternoCliente,

      -- Datos del dispositivo
      d.Marca AS marcaDispositivo,
      d.Modelo AS modeloDispositivo,

      -- Pasajero (via Monedero)
      p.Id AS idPasajero,
      p.Nombre AS nombrePasajero,
      p.ApellidoPaterno AS apellidoPaternoPasajero,
      p.ApellidoMaterno AS apellidoMaternoPasajero

FROM ${entidadDebito} td
LEFT JOIN CatTiposTransacciones ctt 
    ON td.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON td.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON td.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
	ON m.IdCliente = c.Id
    
-- condiciones
WHERE DATE(td.FHRegistro) BETWEEN ? AND ?
AND m.IdCliente IN (${placeholders})


UNION ALL

SELECT 
    'RECARGA' AS origenTabla,
    tr.Id AS id,
    ctt.Nombre AS tipoTransaccion,
    tr.Monto AS monto,
    NULL AS latitudInicial,
    NULL AS longitudInicial,
    tr.LatitudFinal AS latitudFinal,
    tr.LongitudFinal AS longitudFinal,
    NULL AS fechaHoraInicio,
    tr.FechaHoraFinal AS fechaHoraFinal,
    tr.FHRegistro AS fhRegistro,
    tr.NumeroSerieMonedero AS numeroSerieMonedero,
    tr.NumeroSerieValidador AS numeroSerieValidador,
    NULL AS esQR,
    COALESCE(cmp.Nombre, 'Efectivo') AS nombreMetodoPago,

    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    

    d.Marca AS marcaDispositivo,
    d.Modelo AS modeloDispositivo,

    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero

FROM ${entidadRecarga} tr
LEFT JOIN CatTiposTransacciones ctt 
    ON tr.IdTipoTransaccion = ctt.Id
LEFT JOIN CatMetodoPago cmp 
    ON tr.IdMetodoPago = cmp.Id
LEFT JOIN Validadores d 
    ON tr.NumeroSerieValidador = d.NumeroSerie
LEFT JOIN Monederos m 
    ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
LEFT JOIN Clientes c
	ON m.IdCliente = c.Id
    
-- condiciones
WHERE DATE(tr.FHRegistro) BETWEEN ? AND ?
AND m.IdCliente IN (${placeholders})

ORDER BY FHRegistro DESC

        `,
            [fechaInicio, fechaFin, ...ids, fechaInicio, fechaFin, ...ids],
          );
          break;
      }

      // ?? Transformaci?n de datos (ids ? number, nombreCompleto)
      const data = transacciones.map((item) => ({
        ...item,
        id: Number(item.id),
        monto: Number(item.monto),
        latitudFinal: Number(item.latitudFinal),
        longitudFinal: Number(item.longitudFinal),
        idCliente: Number(item.idCliente),
        idPasajero: Number(item.idPasajero),
      }));

      //API Response
      const result: ApiResponseCommon = {
        data: data,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Error al obtener transacciones: ${(error as Error)?.message}`);
      throw new BadRequestException({
        message: 'Error al obtener transacciones',
      });
    }
  }

  async findOneTransaccionRecarga(id: number, cliente = 0, rol = 1) {
    try {
      let whereSql = 'WHERE tr.Id = ?';
      let params: number[] = [id];
      if (Number(rol) !== 1) {
        const { ids, placeholders } = await this.clienteHijos(cliente);
        if (!tieneIdsTenant(ids)) {
          throw new NotFoundException('Transaccion no encontrada');
        }
        whereSql += ` AND m.IdCliente IN (${placeholders})`;
        params = [id, ...ids];
      }

      const transacciones = await this.transaccionesrecargaRepository.query(
        `
SELECT 
    'RECARGA' AS origenTabla,
    tr.Id AS id,
    ctt.Nombre AS tipoTransaccion,
    tr.Monto AS monto,
    tr.LatitudFinal AS latitudFinal,
    tr.LongitudFinal AS longitudFinal,
    tr.FechaHoraFinal AS fechaHoraFinal,
    tr.FHRegistro AS fhRegistro,
    tr.NumeroSerieMonedero AS numeroSerieMonedero,
    tr.NumeroSerieValidador AS numeroSerieValidador,
    tr.ControlTransaccion AS controlTransaccion,
    NULL AS esQR,


    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,

    d.Marca AS marcaValidador,
    d.Modelo AS modeloValidador,

    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero

FROM TransaccionesRecarga tr
INNER JOIN CatTiposTransacciones ctt 
    ON tr.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON tr.NumeroSerieValidador = d.NumeroSerie
INNER JOIN Monederos m 
    ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
INNER JOIN Clientes c
	ON m.IdCliente = c.Id
    ${whereSql}

        `,
        params,
      );

      if (!transacciones || transacciones.length === 0)
        throw new NotFoundException('Transaccion no encontrada');

      // ?? Transformaci?n de datos (ids ? number, nombreCompleto)
      const data = transacciones.map((item) => ({
        ...item,
        id: Number(item.id),
        monto: Number(item.monto),
        latitudFinal: Number(item.latitudFinal),
        longitudFinal: Number(item.longitudFinal),
        idCliente: Number(item.idCliente),
        idPasajero: Number(item.idPasajero),
        tipoMonedero:
          item.origenTabla === 'DEBITO' && item.esQR !== undefined
            ? this.transformarEsQR(Number(item.esQR))
            : null,
      }));
      return { data: data };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Error al obtener transacciones: ${(error as Error)?.message}`);
      throw new BadRequestException({
        message: 'Error al obtener transacciones',
      });
    }
  }

  async findOneTransaccionDebito(id: number, cliente = 0, rol = 1) {
    try {
      let whereSql = 'WHERE td.Id = ?';
      let params: number[] = [id];
      if (Number(rol) !== 1) {
        const { ids, placeholders } = await this.clienteHijos(cliente);
        if (!tieneIdsTenant(ids)) {
          throw new NotFoundException('Transaccion no encontrada');
        }
        whereSql += ` AND m.IdCliente IN (${placeholders})`;
        params = [id, ...ids];
      }

      const transacciones = await this.transaccionesrecargaRepository.query(
        `
SELECT 
    'DEBITO' AS origenTabla,
    td.Id AS id,
    ctt.Nombre AS tipoTransaccion,
    td.Monto AS monto,
    COALESCE(td.LatitudFinal, td.LatitudInicial) AS latitudFinal,
    COALESCE(td.LongitudFinal, td.LongitudInicial) AS longitudFinal,
    td.FechaHoraFinal AS fechaHoraFinal,
    td.FHRegistro AS fhRegistro,
    td.NumeroSerieMonedero AS numeroSerieMonedero,
    td.NumeroSerieValidador AS numeroSerieValidador,
    td.ControlTransaccion AS controlTransaccion,
    td.EsQR AS esQR,


    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,

    -- Datos del validador
    d.Marca AS marcaValidador,
    d.Modelo AS modeloValidador,

    -- Pasajero (via Monedero)
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero

FROM TransaccionesDebito td
INNER JOIN CatTiposTransacciones ctt 
    ON td.IdTipoTransaccion = ctt.Id
LEFT JOIN Validadores d 
    ON td.NumeroSerieValidador = d.NumeroSerie
INNER JOIN Monederos m 
    ON td.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Pasajeros p 
    ON m.IdPasajero = p.Id
INNER JOIN Clientes c
	ON m.IdCliente = c.Id
    ${whereSql}

        `,
        params,
      );

      if (!transacciones || transacciones.length === 0)
        throw new NotFoundException('Transaccion no encontrada');
      // ?? Transformaci?n de datos (ids ? number, nombreCompleto)
      const data = transacciones.map((item) => ({
        ...item,
        id: Number(item.id),
        monto: Number(item.monto),
        latitudFinal: Number(item.latitudFinal),
        longitudFinal: Number(item.longitudFinal),
        idCliente: Number(item.idCliente),
        idPasajero: Number(item.idPasajero),
        tipoMonedero:
          item.origenTabla === 'DEBITO' && item.esQR !== undefined
            ? this.transformarEsQR(Number(item.esQR))
            : null,
      }));
      return { data: data };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Error al obtener transacciones: ${(error as Error)?.message}`);
      throw new BadRequestException({
        message: 'Error al obtener transacciones',
      });
    }
  }

  /**
   * Obtiene el histórico de recargas paginado con filtros según el rol del usuario
   * @param idUser ID del usuario
   * @param email Email del usuario
   * @param cliente ID del cliente
   * @param rol Rol del usuario (1=SA, 2=ADMIN, 3=Cajero, 9=Pasajero)
   * @param getHistoricoRecargasDto DTO con parámetros de paginación y fechas
   * @returns Histórico de recargas paginado
   */
  async getHistoricoRecargasPaginado(
    idUser: number,
    email: string,
    cliente: number,
    rol: number,
    getHistoricoRecargasDto: GetHistoricoRecargasDto,
  ): Promise<ApiResponseCommon> {
    try {
      const { page, limit } = getHistoricoRecargasDto;
      let { fechaInicio, fechaFin } = getHistoricoRecargasDto;
      if (fechaInicio) {
        fechaInicio = assertIsoDate(fechaInicio.split('T')[0], 'fechaInicio');
      }
      if (fechaFin) {
        fechaFin = assertIsoDate(fechaFin.split('T')[0], 'fechaFin');
      }
      const offset = (page - 1) * limit;

      // Determinar qué tablas usar según las fechas
      // Si no hay fechas o las fechas incluyen hoy, usar ambas tablas (actual + histórico)
      // Si las fechas son solo pasadas, usar solo histórico
      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }
      const fechaDesfasada = nowDb();
      const fechaActual = `${fechaDesfasada.getUTCFullYear()}-${pad(fechaDesfasada.getUTCMonth() + 1)}-${pad(fechaDesfasada.getUTCDate())}`;

      // Construir condición de fechas (separadas para cada tabla)
      // Usar FHRegistro para el filtro de fechas
      let fechaCondition = ''; // Para casos 1, 2, 3 (solo HistoricoTransaccionesRecarga)
      let fechaConditionHistorico = ''; // Para tabla HistoricoTransaccionesRecarga
      let fechaConditionActivo = ''; // Para tabla TransaccionesRecarga
      const queryParams: any[] = [];

      let usarTablaActual = false;
      let usarTablaHistorico = true;

      if (!fechaInicio && !fechaFin) {
        // Sin fechas = usar ambas tablas (actual + histórico del día de hoy)
        // Esto asegura que se muestren todas las recargas del día actual
        usarTablaActual = true;
        usarTablaHistorico = true;
        fechaConditionHistorico = `AND DATE(htr.FHRegistro) = ?`;
        fechaConditionActivo = `AND DATE(tr.FHRegistro) = ?`;
        queryParams.push(assertIsoDate(fechaActual, 'fechaActual'));
      } else {
        // Con fechas: si incluyen hoy, usar ambas tablas
        const fechaInicioComparar = fechaInicio?.split('T')[0] ?? fechaActual;
        const fechaFinComparar = fechaFin?.split('T')[0] ?? fechaActual;
        usarTablaActual =
          fechaFinComparar >= fechaActual || fechaInicioComparar <= fechaActual;
        usarTablaHistorico = true; // Siempre consultar histórico si hay fechas

        // Construir condiciones de fechas
        if (fechaInicio && fechaFin) {
          fechaCondition = 'AND DATE(htr.FHRegistro) BETWEEN ? AND ?';
          fechaConditionHistorico = 'AND DATE(htr.FHRegistro) BETWEEN ? AND ?';
          fechaConditionActivo = 'AND DATE(tr.FHRegistro) BETWEEN ? AND ?';
          queryParams.push(fechaInicio, fechaFin);
        } else if (fechaInicio) {
          fechaCondition = 'AND DATE(htr.FHRegistro) >= ?';
          fechaConditionHistorico = 'AND DATE(htr.FHRegistro) >= ?';
          fechaConditionActivo = 'AND DATE(tr.FHRegistro) >= ?';
          queryParams.push(fechaInicio);
        } else if (fechaFin) {
          fechaCondition = 'AND DATE(htr.FHRegistro) <= ?';
          fechaConditionHistorico = 'AND DATE(htr.FHRegistro) <= ?';
          fechaConditionActivo = 'AND DATE(tr.FHRegistro) <= ?';
          queryParams.push(fechaFin);
        }
      }

      let recargas: any[];
      let totalResult: any[];

      switch (Number(rol)) {
        case 1:
          // SA = Todas las recargas
          if (usarTablaActual && usarTablaHistorico) {
            // Consultar ambas tablas con UNION ALL
            recargas = await this.historicoTransaccionesRecargaRepository.query(
              `
SELECT * FROM (
SELECT 
    htr.Id AS id,
    htr.IdTipoTransaccion AS idTipoTransaccion,
    ctt.Nombre AS tipoTransaccion,
    htr.ControlTransaccion AS controlTransaccion,
    htr.Monto AS monto,
    htr.LatitudFinal AS latitudFinal,
    htr.LongitudFinal AS longitudFinal,
    htr.FechaHoraFinal AS fechaHoraFinal,
    htr.FHRegistro AS fhRegistro,
    htr.NumeroSerieMonedero AS numeroSerieMonedero,
    htr.NumeroSerieValidador AS numeroSerieValidador,
    htr.IdUsuario AS idUsuario,
    
    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    
    -- Datos del monedero y pasajero
    m.Id AS idMonedero,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero,
    
    -- Datos del usuario que realizó la recarga
    u.Id AS idUsuarioRecarga,
    u.Nombre AS nombreUsuario,
    u.ApellidoPaterno AS apellidoPaternoUsuario,
    u.ApellidoMaterno AS apellidoMaternoUsuario,
    COALESCE(cmp.Nombre, 'Efectivo') AS nombreMetodoPago

FROM HistoricoTransaccionesRecarga htr
LEFT JOIN CatTiposTransacciones ctt ON htr.IdTipoTransaccion = ctt.Id
LEFT JOIN CatMetodoPago cmp ON htr.IdMetodoPago = cmp.Id
LEFT JOIN Monederos m ON htr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON htr.IdUsuario = u.Id
WHERE 1=1
${fechaConditionHistorico}

UNION ALL

SELECT 
    tr.Id AS id,
    tr.IdTipoTransaccion AS idTipoTransaccion,
    ctt.Nombre AS tipoTransaccion,
    NULL AS controlTransaccion,
    tr.Monto AS monto,
    tr.LatitudFinal AS latitudFinal,
    tr.LongitudFinal AS longitudFinal,
    tr.FechaHoraFinal AS fechaHoraFinal,
    tr.FHRegistro AS fhRegistro,
    tr.NumeroSerieMonedero AS numeroSerieMonedero,
    tr.NumeroSerieValidador AS numeroSerieValidador,
    NULL AS idUsuario,
    
    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    
    -- Datos del monedero y pasajero
    m.Id AS idMonedero,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero,
    
    -- Datos del usuario que realizó la recarga
    NULL AS idUsuarioRecarga,
    NULL AS nombreUsuario,
    NULL AS apellidoPaternoUsuario,
    NULL AS apellidoMaternoUsuario,
    COALESCE(cmp.Nombre, 'Efectivo') AS nombreMetodoPago

FROM TransaccionesRecarga tr
LEFT JOIN CatTiposTransacciones ctt ON tr.IdTipoTransaccion = ctt.Id
LEFT JOIN CatMetodoPago cmp ON tr.IdMetodoPago = cmp.Id
LEFT JOIN Monederos m ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
WHERE 1=1
${fechaConditionActivo}
) AS todas_recargas
ORDER BY fhRegistro DESC
LIMIT ? OFFSET ?;
            `,
              [...queryParams, ...queryParams, limit, offset],
            );

            totalResult =
              await this.historicoTransaccionesRecargaRepository.query(
                `
SELECT COUNT(*) AS total
FROM (
SELECT htr.Id
FROM HistoricoTransaccionesRecarga htr
LEFT JOIN Monederos m ON htr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
WHERE 1=1
${fechaConditionHistorico}

UNION ALL

SELECT tr.Id
FROM TransaccionesRecarga tr
LEFT JOIN Monederos m ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
WHERE 1=1
${fechaConditionActivo}
) AS todas;
            `,
                [...queryParams, ...queryParams],
              );
          } else if (usarTablaActual) {
            // Solo tabla actual
            recargas = await this.historicoTransaccionesRecargaRepository.query(
              `
SELECT 
    tr.Id AS id,
    tr.IdTipoTransaccion AS idTipoTransaccion,
    ctt.Nombre AS tipoTransaccion,
    NULL AS controlTransaccion,
    tr.Monto AS monto,
    tr.LatitudFinal AS latitudFinal,
    tr.LongitudFinal AS longitudFinal,
    tr.FechaHoraFinal AS fechaHoraFinal,
    tr.FHRegistro AS fhRegistro,
    tr.NumeroSerieMonedero AS numeroSerieMonedero,
    tr.NumeroSerieValidador AS numeroSerieValidador,
    NULL AS idUsuario,
    
    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    
    -- Datos del monedero y pasajero
    m.Id AS idMonedero,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero,
    
    -- Datos del usuario que realizó la recarga
    NULL AS idUsuarioRecarga,
    NULL AS nombreUsuario,
    NULL AS apellidoPaternoUsuario,
    NULL AS apellidoMaternoUsuario,
    COALESCE(cmp.Nombre, 'Efectivo') AS nombreMetodoPago

FROM TransaccionesRecarga tr
LEFT JOIN CatTiposTransacciones ctt ON tr.IdTipoTransaccion = ctt.Id
LEFT JOIN CatMetodoPago cmp ON tr.IdMetodoPago = cmp.Id
LEFT JOIN Monederos m ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
WHERE 1=1
${fechaConditionActivo}
ORDER BY tr.FHRegistro DESC
LIMIT ? OFFSET ?;
            `,
              [...queryParams, limit, offset],
            );

            totalResult =
              await this.historicoTransaccionesRecargaRepository.query(
                `
SELECT COUNT(*) AS total
FROM TransaccionesRecarga tr
LEFT JOIN Monederos m ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
WHERE 1=1
${fechaConditionActivo};
            `,
                queryParams,
              );
          } else {
            // Solo histórico
            recargas = await this.historicoTransaccionesRecargaRepository.query(
              `
SELECT 
    htr.Id AS id,
    htr.IdTipoTransaccion AS idTipoTransaccion,
    ctt.Nombre AS tipoTransaccion,
    htr.ControlTransaccion AS controlTransaccion,
    htr.Monto AS monto,
    htr.LatitudFinal AS latitudFinal,
    htr.LongitudFinal AS longitudFinal,
    htr.FechaHoraFinal AS fechaHoraFinal,
    htr.FHRegistro AS fhRegistro,
    htr.NumeroSerieMonedero AS numeroSerieMonedero,
    htr.NumeroSerieValidador AS numeroSerieValidador,
    htr.IdUsuario AS idUsuario,
    
    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    
    -- Datos del monedero y pasajero
    m.Id AS idMonedero,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero,
    
    -- Datos del usuario que realizó la recarga
    u.Id AS idUsuarioRecarga,
    u.Nombre AS nombreUsuario,
    u.ApellidoPaterno AS apellidoPaternoUsuario,
    u.ApellidoMaterno AS apellidoMaternoUsuario,
    COALESCE(cmp.Nombre, 'Efectivo') AS nombreMetodoPago

FROM HistoricoTransaccionesRecarga htr
LEFT JOIN CatTiposTransacciones ctt ON htr.IdTipoTransaccion = ctt.Id
LEFT JOIN CatMetodoPago cmp ON htr.IdMetodoPago = cmp.Id
LEFT JOIN Monederos m ON htr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON htr.IdUsuario = u.Id
WHERE 1=1
${fechaCondition}
ORDER BY htr.FechaHoraFinal DESC
LIMIT ? OFFSET ?;
            `,
              [...queryParams, limit, offset],
            );

            totalResult =
              await this.historicoTransaccionesRecargaRepository.query(
                `
SELECT COUNT(*) AS total
FROM HistoricoTransaccionesRecarga htr
LEFT JOIN Monederos m ON htr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
WHERE 1=1
${fechaCondition};
            `,
                queryParams,
              );
          }
          break;

        case 3:
        default:
          // Cualquier otro rol (admin, etc.): filtrar por idCliente + hijos
          const { ids, placeholders } = await this.clienteHijos(cliente);

          if (usarTablaActual && usarTablaHistorico) {
            // Consultar ambas tablas con UNION ALL
            recargas = await this.historicoTransaccionesRecargaRepository.query(
              `
SELECT * FROM (
SELECT 
    htr.Id AS id,
    htr.IdTipoTransaccion AS idTipoTransaccion,
    ctt.Nombre AS tipoTransaccion,
    htr.ControlTransaccion AS controlTransaccion,
    htr.Monto AS monto,
    htr.LatitudFinal AS latitudFinal,
    htr.LongitudFinal AS longitudFinal,
    htr.FechaHoraFinal AS fechaHoraFinal,
    htr.FHRegistro AS fhRegistro,
    htr.NumeroSerieMonedero AS numeroSerieMonedero,
    htr.NumeroSerieValidador AS numeroSerieValidador,
    htr.IdUsuario AS idUsuario,
    
    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    
    -- Datos del monedero y pasajero
    m.Id AS idMonedero,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero,
    
    -- Datos del usuario que realizó la recarga
    u.Id AS idUsuarioRecarga,
    u.Nombre AS nombreUsuario,
    u.ApellidoPaterno AS apellidoPaternoUsuario,
    u.ApellidoMaterno AS apellidoMaternoUsuario,
    COALESCE(cmp.Nombre, 'Efectivo') AS nombreMetodoPago

FROM HistoricoTransaccionesRecarga htr
LEFT JOIN CatTiposTransacciones ctt ON htr.IdTipoTransaccion = ctt.Id
LEFT JOIN CatMetodoPago cmp ON htr.IdMetodoPago = cmp.Id
LEFT JOIN Monederos m ON htr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON htr.IdUsuario = u.Id
WHERE (m.IdCliente IN (${placeholders}) OR m.IdCliente IS NULL)
${fechaConditionHistorico}

UNION ALL

SELECT 
    tr.Id AS id,
    tr.IdTipoTransaccion AS idTipoTransaccion,
    ctt.Nombre AS tipoTransaccion,
    NULL AS controlTransaccion,
    tr.Monto AS monto,
    tr.LatitudFinal AS latitudFinal,
    tr.LongitudFinal AS longitudFinal,
    tr.FechaHoraFinal AS fechaHoraFinal,
    tr.FHRegistro AS fhRegistro,
    tr.NumeroSerieMonedero AS numeroSerieMonedero,
    tr.NumeroSerieValidador AS numeroSerieValidador,
    NULL AS idUsuario,
    
    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    
    -- Datos del monedero y pasajero
    m.Id AS idMonedero,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero,
    
    -- Datos del usuario que realizó la recarga
    NULL AS idUsuarioRecarga,
    NULL AS nombreUsuario,
    NULL AS apellidoPaternoUsuario,
    NULL AS apellidoMaternoUsuario,
    COALESCE(cmp.Nombre, 'Efectivo') AS nombreMetodoPago

FROM TransaccionesRecarga tr
LEFT JOIN CatTiposTransacciones ctt ON tr.IdTipoTransaccion = ctt.Id
LEFT JOIN CatMetodoPago cmp ON tr.IdMetodoPago = cmp.Id
LEFT JOIN Monederos m ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
WHERE m.IdCliente IN (${placeholders})
${fechaConditionActivo}
) AS todas_recargas
ORDER BY fhRegistro DESC
LIMIT ? OFFSET ?;
            `,
              [...ids, ...ids, ...queryParams, ...queryParams, limit, offset],
            );

            totalResult =
              await this.historicoTransaccionesRecargaRepository.query(
                `
SELECT COUNT(*) AS total
FROM (
SELECT htr.Id
FROM HistoricoTransaccionesRecarga htr
LEFT JOIN Monederos m ON htr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
WHERE (m.IdCliente IN (${placeholders}) OR m.IdCliente IS NULL)
${fechaConditionHistorico}

UNION ALL

SELECT tr.Id
FROM TransaccionesRecarga tr
LEFT JOIN Monederos m ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
WHERE m.IdCliente IN (${placeholders})
${fechaConditionActivo}
) AS todas;
            `,
                [...ids, ...ids, ...queryParams, ...queryParams],
              );
          } else if (usarTablaActual) {
            // Solo tabla actual
            recargas = await this.historicoTransaccionesRecargaRepository.query(
              `
SELECT 
    tr.Id AS id,
    tr.IdTipoTransaccion AS idTipoTransaccion,
    ctt.Nombre AS tipoTransaccion,
    NULL AS controlTransaccion,
    tr.Monto AS monto,
    tr.LatitudFinal AS latitudFinal,
    tr.LongitudFinal AS longitudFinal,
    tr.FechaHoraFinal AS fechaHoraFinal,
    tr.FHRegistro AS fhRegistro,
    tr.NumeroSerieMonedero AS numeroSerieMonedero,
    tr.NumeroSerieValidador AS numeroSerieValidador,
    NULL AS idUsuario,
    
    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    
    -- Datos del monedero y pasajero
    m.Id AS idMonedero,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero,
    
    -- Datos del usuario que realizó la recarga
    NULL AS idUsuarioRecarga,
    NULL AS nombreUsuario,
    NULL AS apellidoPaternoUsuario,
    NULL AS apellidoMaternoUsuario,
    COALESCE(cmp.Nombre, 'Efectivo') AS nombreMetodoPago

FROM TransaccionesRecarga tr
LEFT JOIN CatTiposTransacciones ctt ON tr.IdTipoTransaccion = ctt.Id
LEFT JOIN CatMetodoPago cmp ON tr.IdMetodoPago = cmp.Id
LEFT JOIN Monederos m ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
WHERE m.IdCliente IN (${placeholders})
${fechaConditionActivo}
ORDER BY tr.FHRegistro DESC
LIMIT ? OFFSET ?;
            `,
              [...ids, ...queryParams, limit, offset],
            );

            totalResult =
              await this.historicoTransaccionesRecargaRepository.query(
                `
SELECT COUNT(*) AS total
FROM TransaccionesRecarga tr
LEFT JOIN Monederos m ON tr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
WHERE m.IdCliente IN (${placeholders})
${fechaConditionActivo};
            `,
                [...ids, ...queryParams],
              );
          } else {
            // Solo histórico
            recargas = await this.historicoTransaccionesRecargaRepository.query(
              `
SELECT 
    htr.Id AS id,
    htr.IdTipoTransaccion AS idTipoTransaccion,
    ctt.Nombre AS tipoTransaccion,
    htr.ControlTransaccion AS controlTransaccion,
    htr.Monto AS monto,
    htr.LatitudFinal AS latitudFinal,
    htr.LongitudFinal AS longitudFinal,
    htr.FechaHoraFinal AS fechaHoraFinal,
    htr.FHRegistro AS fhRegistro,
    htr.NumeroSerieMonedero AS numeroSerieMonedero,
    htr.NumeroSerieValidador AS numeroSerieValidador,
    htr.IdUsuario AS idUsuario,
    
    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    
    -- Datos del monedero y pasajero
    m.Id AS idMonedero,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero,
    
    -- Datos del usuario que realizó la recarga
    u.Id AS idUsuarioRecarga,
    u.Nombre AS nombreUsuario,
    u.ApellidoPaterno AS apellidoPaternoUsuario,
    u.ApellidoMaterno AS apellidoMaternoUsuario,
    COALESCE(cmp.Nombre, 'Efectivo') AS nombreMetodoPago

FROM HistoricoTransaccionesRecarga htr
LEFT JOIN CatTiposTransacciones ctt ON htr.IdTipoTransaccion = ctt.Id
LEFT JOIN CatMetodoPago cmp ON htr.IdMetodoPago = cmp.Id
LEFT JOIN Monederos m ON htr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON htr.IdUsuario = u.Id
WHERE m.IdCliente IN (${placeholders})
${fechaCondition}
ORDER BY htr.FechaHoraFinal DESC
LIMIT ? OFFSET ?;
            `,
              [...ids, ...queryParams, limit, offset],
            );

            totalResult =
              await this.historicoTransaccionesRecargaRepository.query(
                `
SELECT COUNT(*) AS total
FROM HistoricoTransaccionesRecarga htr
LEFT JOIN Monederos m ON htr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
WHERE m.IdCliente IN (${placeholders})
${fechaCondition};
            `,
                [...ids, ...queryParams],
              );
          }
          break;

        case 3:
          // Cajero = Solo sus recargas (por IdUsuario) Y filtrar por clientes hijos
          const { ids: idsCajero, placeholders: placeholdersCajero } =
            await this.clienteHijos(cliente);

          if (usarTablaActual && usarTablaHistorico) {
            // Consultar ambas tablas con UNION ALL
            // Nota: TransaccionesRecarga no tiene IdUsuario, así que solo consultamos histórico cuando hay IdUsuario
            recargas = await this.historicoTransaccionesRecargaRepository.query(
              `
SELECT * FROM (
SELECT 
    htr.Id AS id,
    htr.IdTipoTransaccion AS idTipoTransaccion,
    ctt.Nombre AS tipoTransaccion,
    htr.ControlTransaccion AS controlTransaccion,
    htr.Monto AS monto,
    htr.LatitudFinal AS latitudFinal,
    htr.LongitudFinal AS longitudFinal,
    htr.FechaHoraFinal AS fechaHoraFinal,
    htr.FHRegistro AS fhRegistro,
    htr.NumeroSerieMonedero AS numeroSerieMonedero,
    htr.NumeroSerieValidador AS numeroSerieValidador,
    htr.IdUsuario AS idUsuario,
    
    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    
    -- Datos del monedero y pasajero
    m.Id AS idMonedero,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero,
    
    -- Datos del usuario que realizó la recarga
    u.Id AS idUsuarioRecarga,
    u.Nombre AS nombreUsuario,
    u.ApellidoPaterno AS apellidoPaternoUsuario,
    u.ApellidoMaterno AS apellidoMaternoUsuario,
    COALESCE(cmp.Nombre, 'Efectivo') AS nombreMetodoPago

FROM HistoricoTransaccionesRecarga htr
LEFT JOIN CatTiposTransacciones ctt ON htr.IdTipoTransaccion = ctt.Id
LEFT JOIN CatMetodoPago cmp ON htr.IdMetodoPago = cmp.Id
LEFT JOIN Monederos m ON htr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON htr.IdUsuario = u.Id
WHERE htr.IdUsuario = ? AND (m.IdCliente IN (${placeholdersCajero}) OR m.IdCliente IS NULL)
${fechaConditionHistorico}
) AS todas_recargas
ORDER BY fhRegistro DESC
LIMIT ? OFFSET ?;
            `,
              [idUser, ...idsCajero, ...queryParams, limit, offset],
            );

            totalResult =
              await this.historicoTransaccionesRecargaRepository.query(
                `
SELECT COUNT(*) AS total
FROM HistoricoTransaccionesRecarga htr
LEFT JOIN Monederos m ON htr.NumeroSerieMonedero = m.NumeroSerie
WHERE htr.IdUsuario = ? AND (m.IdCliente IN (${placeholdersCajero}) OR m.IdCliente IS NULL)
${fechaConditionHistorico};
            `,
                [idUser, ...idsCajero, ...queryParams],
              );
          } else if (usarTablaActual) {
            // Solo tabla actual - pero TransaccionesRecarga no tiene IdUsuario, así que no hay recargas del cajero en tabla actual
            recargas = [];
            totalResult = [{ total: 0 }];
          } else {
            // Solo histórico
            recargas = await this.historicoTransaccionesRecargaRepository.query(
              `
SELECT 
    htr.Id AS id,
    htr.IdTipoTransaccion AS idTipoTransaccion,
    ctt.Nombre AS tipoTransaccion,
    htr.ControlTransaccion AS controlTransaccion,
    htr.Monto AS monto,
    htr.LatitudFinal AS latitudFinal,
    htr.LongitudFinal AS longitudFinal,
    htr.FechaHoraFinal AS fechaHoraFinal,
    htr.FHRegistro AS fhRegistro,
    htr.NumeroSerieMonedero AS numeroSerieMonedero,
    htr.NumeroSerieValidador AS numeroSerieValidador,
    htr.IdUsuario AS idUsuario,
    
    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    
    -- Datos del monedero y pasajero
    m.Id AS idMonedero,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero,
    
    -- Datos del usuario que realizó la recarga
    u.Id AS idUsuarioRecarga,
    u.Nombre AS nombreUsuario,
    u.ApellidoPaterno AS apellidoPaternoUsuario,
    u.ApellidoMaterno AS apellidoMaternoUsuario,
    COALESCE(cmp.Nombre, 'Efectivo') AS nombreMetodoPago

FROM HistoricoTransaccionesRecarga htr
LEFT JOIN CatTiposTransacciones ctt ON htr.IdTipoTransaccion = ctt.Id
LEFT JOIN CatMetodoPago cmp ON htr.IdMetodoPago = cmp.Id
LEFT JOIN Monederos m ON htr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON htr.IdUsuario = u.Id
WHERE htr.IdUsuario = ? AND (m.IdCliente IN (${placeholdersCajero}) OR m.IdCliente IS NULL)
${fechaCondition}
ORDER BY htr.FechaHoraFinal DESC
LIMIT ? OFFSET ?;
            `,
              [idUser, ...idsCajero, ...queryParams, limit, offset],
            );

            totalResult =
              await this.historicoTransaccionesRecargaRepository.query(
                `
SELECT COUNT(*) AS total
FROM HistoricoTransaccionesRecarga htr
LEFT JOIN Monederos m ON htr.NumeroSerieMonedero = m.NumeroSerie
WHERE htr.IdUsuario = ? AND (m.IdCliente IN (${placeholdersCajero}) OR m.IdCliente IS NULL)
${fechaCondition};
            `,
                [idUser, ...idsCajero, ...queryParams],
              );
          }
          break;

        case 9:
          // Pasajero = Solo las de él (filtrar por monederos del pasajero asociado al usuario)
          // Buscar pasajero por IdUsuario directamente o por correo como fallback
          let pasajeroId: number | null = null;

          try {
            // Intentar buscar pasajero por IdUsuario directamente
            const pasajeroPorUsuario = await this.pasajeroRepository.findOne({
              where: { idUsuario: idUser },
            });

            if (pasajeroPorUsuario) {
              pasajeroId = pasajeroPorUsuario.id;
            } else {
              // Fallback: buscar por correo
              const pasajeroPorCorreo =
                await this.pasajeroService.findOnePasajeroCorreo(email);
              if (pasajeroPorCorreo && pasajeroPorCorreo.id) {
                pasajeroId = pasajeroPorCorreo.id;
              }
            }
          } catch (error) {
            // Si falla, intentar por correo
            try {
              const pasajeroPorCorreo =
                await this.pasajeroService.findOnePasajeroCorreo(email);
              if (pasajeroPorCorreo && pasajeroPorCorreo.id) {
                pasajeroId = pasajeroPorCorreo.id;
              }
            } catch (e) {
              // Si no se encuentra, pasajeroId queda null
            }
          }

          // Buscar recargas solo en HistoricoTransaccionesRecarga
          // Filtrar por: IdUsuario del usuario Y clientes hijos (solo las recargas que él realizó en su cliente y clientes hijos)
          // Para pasajero: solo mostrar las recargas donde IdUsuario = idUser AND m.IdCliente IN (clientes hijos)
          const { ids: idsPasajero, placeholders: placeholdersPasajero } =
            await this.clienteHijos(cliente);

          const condicionesWhereHistorico = `htr.IdUsuario = ? AND (m.IdCliente IN (${placeholdersPasajero}) OR m.IdCliente IS NULL)`;
          const paramsWhere = [idUser, ...idsPasajero, ...queryParams];

          // Obtener recargas del histórico con paginación
          recargas = await this.historicoTransaccionesRecargaRepository.query(
            `
SELECT 
    htr.Id AS id,
    htr.IdTipoTransaccion AS idTipoTransaccion,
    ctt.Nombre AS tipoTransaccion,
    htr.ControlTransaccion AS controlTransaccion,
    htr.Monto AS monto,
    htr.LatitudFinal AS latitudFinal,
    htr.LongitudFinal AS longitudFinal,
    htr.FechaHoraFinal AS fechaHoraFinal,
    htr.FHRegistro AS fhRegistro,
    htr.NumeroSerieMonedero AS numeroSerieMonedero,
    htr.NumeroSerieValidador AS numeroSerieValidador,
    htr.IdUsuario AS idUsuario,
    
    -- Datos del cliente
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    
    -- Datos del monedero y pasajero
    m.Id AS idMonedero,
    p.Id AS idPasajero,
    p.Nombre AS nombrePasajero,
    p.ApellidoPaterno AS apellidoPaternoPasajero,
    p.ApellidoMaterno AS apellidoMaternoPasajero,
    
    -- Datos del usuario que realizó la recarga
    u.Id AS idUsuarioRecarga,
    u.Nombre AS nombreUsuario,
    u.ApellidoPaterno AS apellidoPaternoUsuario,
    u.ApellidoMaterno AS apellidoMaternoUsuario,
    COALESCE(cmp.Nombre, 'Efectivo') AS nombreMetodoPago

FROM HistoricoTransaccionesRecarga htr
LEFT JOIN CatTiposTransacciones ctt ON htr.IdTipoTransaccion = ctt.Id
LEFT JOIN CatMetodoPago cmp ON htr.IdMetodoPago = cmp.Id
LEFT JOIN Monederos m ON htr.NumeroSerieMonedero = m.NumeroSerie
LEFT JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON htr.IdUsuario = u.Id
WHERE ${condicionesWhereHistorico}
${fechaConditionHistorico}
ORDER BY htr.FechaHoraFinal DESC
LIMIT ? OFFSET ?;
            `,
            [...paramsWhere, limit, offset],
          );

          totalResult =
            await this.historicoTransaccionesRecargaRepository.query(
              `
SELECT COUNT(*) AS total
FROM HistoricoTransaccionesRecarga htr
LEFT JOIN Monederos m ON htr.NumeroSerieMonedero = m.NumeroSerie
WHERE htr.IdUsuario = ? AND (m.IdCliente IN (${placeholdersPasajero}) OR m.IdCliente IS NULL)
${fechaConditionHistorico};
            `,
              paramsWhere,
            );
          break;
      }

      const total = Number(totalResult[0]?.total || 0);

      // Validar que recargas sea un array
      if (!Array.isArray(recargas)) {
        throw new BadRequestException({
          message: 'Error: las recargas no se obtuvieron correctamente',
        });
      }

      // Convertir BigInt a Number
      const data = recargas.map((item) => ({
        ...item,
        id: Number(item.id),
        idTipoTransaccion: item.idTipoTransaccion
          ? Number(item.idTipoTransaccion)
          : null,
        monto: Number(item.monto),
        idCliente: item.idCliente ? Number(item.idCliente) : null,
        idMonedero: item.idMonedero ? Number(item.idMonedero) : null,
        idPasajero: item.idPasajero ? Number(item.idPasajero) : null,
        idUsuario: item.idUsuario ? Number(item.idUsuario) : null,
        idUsuarioRecarga: item.idUsuarioRecarga
          ? Number(item.idUsuarioRecarga)
          : null,
      }));

      const result: ApiResponseCommon = {
        data: data,
        paginated: {
          total: total,
          page: page,
          lastPage: Math.ceil(total / limit),
        },
      };

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException({
        message: 'Error al obtener histórico de recargas',
      });
    }
  }
}
