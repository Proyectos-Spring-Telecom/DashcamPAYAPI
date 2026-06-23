import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import { Pasajeros } from 'src/entities/Pasajeros';
import { DatosTarjeta } from 'src/entities/DatosTarjeta';
import { DireccionesTarjeta } from 'src/entities/DireccionesTarjeta';
import { TokenDirecciones } from 'src/entities/TokenDirecciones';
import { TokenizeCardDto } from './dto/tokenize-card.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentSavedCardDto } from './dto/payment-saved-card.dto';
import { AssignCardDto } from './dto/assign-card.dto';
import { DireccionTarjetaDto } from './dto/direccion-tarjeta.dto';
import { Confirm3DSDto } from './dto/confirm-3ds.dto';
import { CancelRefundDto } from './dto/cancel-refund.dto';
import { ProcessPaymentWithTokenDto } from './dto/process-payment-with-token.dto';
import {
  NetpayTokenResponse,
  NetpayReferenceIdResponse,
  NetpayCheckInResponse,
  NetpayPaymentResponse,
  NetpayCustomerResponse,
  NetpayCardResponse,
  NetpayTransactionDetailResponse,
  NetpayErrorResponse,
} from './interfaces/netpay-response.interface';

@Injectable()
export class NetpayService {
  /** Origen del host (p. ej. https://gateway-154.netpaydev.com) para httpClient: /v1/..., health, etc. */
  private readonly baseUrl: string;
  /** Base de gateway-ecommerce desde NETPAY_BASE_URL o default por ambiente */
  private readonly netpayEcommerceBaseUrl: string;
  private readonly publicKey: string;
  private readonly privateKey: string;
  private readonly isProduction: boolean;
  private readonly httpClient: AxiosInstance;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Pasajeros)
    private readonly pasajeroRepository: Repository<Pasajeros>,
    @InjectRepository(DatosTarjeta)
    private readonly datosTarjetaRepository: Repository<DatosTarjeta>,
    @InjectRepository(DireccionesTarjeta)
    private readonly direccionesTarjetaRepository: Repository<DireccionesTarjeta>,
    @InjectRepository(TokenDirecciones)
    private readonly tokenDireccionesRepository: Repository<TokenDirecciones>,
  ) {
    this.isProduction =
      this.configService.get<string>('NETPAY_ENVIRONMENT') === 'production';

    const defaultEcommerceBase = this.isProduction
      ? 'https://gateway.netpay.com.mx/gateway-ecommerce'
      : 'https://gateway-154.netpaydev.com/gateway-ecommerce';

    const configuredBase = this.configService
      .get<string>('NETPAY_BASE_URL')
      ?.trim();
    this.netpayEcommerceBaseUrl = (
      configuredBase || defaultEcommerceBase
    ).replace(/\/$/, '');

    try {
      this.baseUrl = new URL(this.netpayEcommerceBaseUrl).origin;
    } catch {
      this.baseUrl = this.netpayEcommerceBaseUrl
        .replace(/\/gateway-ecommerce.*$/i, '')
        .replace(/\/$/, '');
    }
    
    // Obtener y validar las API keys
    this.publicKey = (this.configService.get<string>('NETPAY_PUBLIC_KEY') || '').trim();
    this.privateKey = (this.configService.get<string>('NETPAY_PRIVATE_KEY') || '').trim();

    // Validar que las API keys estén configuradas
    if (!this.publicKey || this.publicKey === '') {
      throw new BadRequestException(
        'NETPAY_PUBLIC_KEY no está configurada o está vacía. Por favor, verifica tu archivo .env y asegúrate de que NETPAY_PUBLIC_KEY tenga un valor válido.',
      );
    }

    if (!this.privateKey || this.privateKey === '') {
      throw new BadRequestException(
        'NETPAY_PRIVATE_KEY no está configurada o está vacía. Por favor, verifica tu archivo .env y asegúrate de que NETPAY_PRIVATE_KEY tenga un valor válido.',
      );
    }

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Obtiene los headers de autenticación para las peticiones
   * Según la documentación de Netpay, usa Authorization header con la private key
   * @param includeUserAgent Si incluir el User-Agent (requerido para v3.5/charges)
   */
  private getAuthHeaders(includeUserAgent: boolean = true): Record<string, string> {
    // Validar que la private key esté configurada
    if (!this.privateKey) {
      throw new BadRequestException('NETPAY_PRIVATE_KEY no está configurada. Verifica las variables de entorno.');
    }

    const headers: Record<string, string> = {
      'Authorization': this.privateKey, // Netpay usa la key directamente, no Bearer
      'Content-Type': 'application/json',
      'accept': 'application/json',
    };
    
    if (includeUserAgent) {
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';
    }
    
    return headers;
  }

  /**
   * Obtiene los headers de autenticación para endpoints de reports (refund)
   * Usa X-Netpay-Apikey en lugar de Authorization
   */
  private getReportsAuthHeaders(): Record<string, string> {
    // Validar que la private key esté configurada
    if (!this.privateKey) {
      throw new BadRequestException('NETPAY_PRIVATE_KEY no está configurada. Verifica las variables de entorno.');
    }

    return {
      'X-Netpay-Apikey': this.privateKey,
      'Content-Type': 'application/json',
      'accept': 'application/json',
    };
  }

  /**
   * Maneja errores de la API de Netpay
   */
  private handleError(error: any, context?: string): never {

      if (error.response) {
      // El servidor respondió con un código de estado de error
      const status = error.response.status;
      const errorData: NetpayErrorResponse | undefined = error.response.data;
      

      // Si hay subErrors, incluirlos en el mensaje
      const subErrorsMessage = errorData && (errorData as any).subErrors 
        ? `\nErrores de validación: ${JSON.stringify((errorData as any).subErrors, null, 2)}`
        : '';

      const errorMessage = errorData?.message || `Error en la petición a Netpay (${status})`;
      throw new BadRequestException(errorMessage + subErrorsMessage);
    }
    
    if (error.request) {
      // La petición se hizo pero no se recibió respuesta

      const errorMessage = error.code === 'ECONNREFUSED'
        ? `No se pudo conectar al servidor de Netpay. Verifica la URL: ${this.baseUrl}`
        : error.code === 'ETIMEDOUT'
        ? 'La petición a Netpay expiró (timeout)'
        : error.code === 'ENOTFOUND'
        ? `No se pudo resolver el host de Netpay. Verifica la URL: ${this.baseUrl}`
        : `No se recibió respuesta del servidor de Netpay. Código: ${error.code || 'UNKNOWN'}`;

      throw new InternalServerErrorException(errorMessage);
    }
    
    // Error al configurar la petición
    throw new InternalServerErrorException(
      `Error al procesar la petición: ${error.message}`,
    );
  }

  /**
   * Obtiene la public key para usar en NetpayJS (frontend)
   * @returns Public key de Netpay
   */
  getPublicKey(): { publicKey: string; environment: string } {
    return {
      publicKey: this.publicKey,
      environment: this.isProduction ? 'production' : 'sandbox',
    };
  }

  /**
   * Verifica la conectividad con el servidor de Netpay
   * @returns Información de la conexión
   */
  async testConnection(): Promise<{
    success: boolean;
    baseUrl: string;
    environment: string;
    message: string;
  }> {
    try {
      // Intentar una petición simple para verificar conectividad
      await this.httpClient.get('/health', { timeout: 5000 });
      return {
        success: true,
        baseUrl: this.baseUrl,
        environment: this.isProduction ? 'production' : 'sandbox',
        message: 'Conexión exitosa',
      };
    } catch (error) {
      return {
        success: false,
        baseUrl: this.baseUrl,
        environment: this.isProduction ? 'production' : 'sandbox',
        message: error.code || 'Error de conexión',
      };
    }
  }

  /**
   * Tokeniza una tarjeta de crédito/débito
   * Nota: Según la documentación de Netpay, la tokenización normalmente se hace desde el frontend
   * con NetpayJS. Este método intenta hacerlo desde el backend usando la API REST.
   * @param tokenizeCardDto Datos de la tarjeta a tokenizar
   * @returns Token de la tarjeta
   */
  async tokenizeCard(
    tokenizeCardDto: TokenizeCardDto,
  ): Promise<NetpayTokenResponse> {
    // Preparar el payload según la documentación de Netpay
    const payload: any = {
      cardNumber: tokenizeCardDto.cardNumber,
      expMonth: tokenizeCardDto.expMonth,
      expYear: tokenizeCardDto.expYear,
      cvv2: tokenizeCardDto.cvv2,
    };

    // Campos opcionales según documentación
    if (tokenizeCardDto.vault !== undefined) {
      payload.vault = tokenizeCardDto.vault;
    }
    if (tokenizeCardDto.simpleUse !== undefined) {
      payload.simpleUse = tokenizeCardDto.simpleUse;
    }
    if (tokenizeCardDto.deviceFingerPrint) {
      payload.deviceFingerPrint = tokenizeCardDto.deviceFingerPrint;
    }

    // Endpoints posibles según diferentes versiones de la API
    const possibleEndpoints = [
      '/v1/tokens',
      '/api/v1/tokens',
      '/api/v1/tokenization',
      '/tokens',
      '/v1.2.1/tokens', // Versión específica de la API
    ];

    // Métodos de autenticación - NetpayJS usa public key
    const authMethods = [
      { usePublicKey: true, useApiKeyHeader: false, name: 'public key + Bearer' },
      { usePublicKey: true, useApiKeyHeader: true, name: 'public key + x-netpay-api-key' },
      { usePublicKey: false, useApiKeyHeader: false, name: 'private key + Bearer' },
      { usePublicKey: false, useApiKeyHeader: true, name: 'private key + x-netpay-api-key' },
    ];

    let lastError: any = null;

    // Intentar con diferentes combinaciones de endpoint y autenticación
    for (const endpoint of possibleEndpoints) {
      for (const authMethod of authMethods) {
        try {

          const response = await this.httpClient.post<NetpayTokenResponse>(
            endpoint,
            payload,
            { 
              headers: this.getAuthHeaders(),
              timeout: 15000,
            },
          );
          
          return response.data;
        } catch (error) {
          lastError = error;
          
          // Si recibimos una respuesta del servidor
          if (error.response) {
            const status = error.response.status;
            
            // Si es 401/403, probar siguiente método de auth
            if (status === 401 || status === 403) {
              continue;
            }
            
            // Si es 404, el endpoint no existe, probar siguiente
            if (status === 404) {
              break; // Probar siguiente endpoint
            }
            
            // Si es otro error de respuesta (400, 422, etc.), puede ser error de validación
            
            // Si no es 404, puede ser que el endpoint existe pero hay error de datos
            // Continuar probando otros métodos pero guardar el error
            continue;
          }
          
          // Si es timeout o error de conexión, continuar probando
          if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            continue;
          }
        }
      }
    }

    // Si llegamos aquí, todos los intentos fallaron
    if (lastError) {
      // Si el último error tiene información útil, mostrarla
      if (lastError.response) {
        this.handleError(lastError, 'tokenizeCard');
      } else {
        throw new InternalServerErrorException(
          `No se pudo tokenizar la tarjeta. Verifica la URL base (${this.baseUrl}) y las llaves de API. ` +
          `Nota: La tokenización normalmente se hace desde el frontend con NetpayJS. ` +
          `Si necesitas tokenizar desde el backend, verifica con Netpay si hay un endpoint REST disponible.`
        );
      }
    }
    
    throw new InternalServerErrorException('No se pudo tokenizar la tarjeta después de intentar múltiples métodos');
  }

  /**
   * Obtiene un Reference ID para checkout
   * @returns Reference ID
   */
  async getReferenceId(): Promise<NetpayReferenceIdResponse> {
    try {
      const response = await this.httpClient.post<NetpayReferenceIdResponse>(
        '/v1/reference-id',
        {},
        { headers: this.getAuthHeaders() },
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Realiza check-in para checkout
   * @param referenceId Reference ID del checkout
   * @param amount Monto del pago
   * @param currency Moneda (MXN, USD, etc.)
   * @returns Información del checkout
   */
  async checkIn(
    referenceId: string,
    amount: number,
    currency: string = 'MXN',
  ): Promise<NetpayCheckInResponse> {
    try {
      const response = await this.httpClient.post<NetpayCheckInResponse>(
        '/v1/check-in',
        {
          referenceId,
          amount,
          currency,
        },
        { headers: this.getAuthHeaders() },
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Realiza check-out para checkout
   * @param referenceId Reference ID del checkout
   * @returns Información del checkout
   */
  async checkOut(referenceId: string): Promise<NetpayCheckInResponse> {
    try {
      const response = await this.httpClient.post<NetpayCheckInResponse>(
        '/v1/check-out',
        { referenceId },
        { headers: this.getAuthHeaders() },
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Procesa un pago con token de tarjeta (generado por NetpayJS en frontend)
   * Usa el endpoint v3.5/charges de Netpay
   * Este es el método recomendado cuando la tokenización se hace en el cliente
   * @param processPaymentDto Datos del pago incluyendo token de NetpayJS
   * @returns Información de la transacción
   */
  async processPaymentWithToken(
    processPaymentDto: ProcessPaymentWithTokenDto,
  ): Promise<NetpayPaymentResponse> {
    try {
      // Preparar payload según el formato exacto de Netpay v3.5/charges
      // Según el curl proporcionado: paymentMethod es string "card", token va directamente
      const payload: any = {
        transactionType: 'Auth',
        amount: processPaymentDto.amount,
        description: processPaymentDto.description,
        paymentMethod: 'card', // String, no objeto
        token: processPaymentDto.token, // Token generado por NetpayJS va directamente en el payload
        currency: processPaymentDto.currency || 'MXN',
        saveCard: processPaymentDto.saveCard || 'false', // Netpay espera string ("true" o "false")
      };

      // Agregar sessionId (requerido según el curl)
      if (processPaymentDto.sessionId) {
        payload.sessionId = processPaymentDto.sessionId;
      } else if (processPaymentDto.deviceFingerPrint) {
        // Si no hay sessionId pero hay deviceFingerPrint, usar el mismo valor
        payload.sessionId = processPaymentDto.deviceFingerPrint;
      }

      // Agregar deviceFingerPrint (requerido según el curl)
      if (processPaymentDto.deviceFingerPrint) {
        payload.deviceFingerPrint = processPaymentDto.deviceFingerPrint;
      }

      // Agregar referenceID si está presente
      if (processPaymentDto.referenceID) {
        payload.referenceID = processPaymentDto.referenceID;
      }

      // Agregar billing si está presente (objeto completo con firstName, lastName, email, phone, address, merchantReferenceCode)
      if (processPaymentDto.billing) {
        payload.billing = processPaymentDto.billing;
      }

      // Agregar deviceInformation si está presente (objeto completo para 3DS 2.0)
      if (processPaymentDto.deviceInformation) {
        payload.deviceInformation = processPaymentDto.deviceInformation;
      }

      // URL completa para procesar pagos - usar endpoint v3.5/charges
      const paymentUrl = `${this.netpayEcommerceBaseUrl}/v3.5/charges`;

      // Usar axios directamente con la URL completa
      // Incluir User-Agent header como en el curl de ejemplo
      const response = await axios.post<NetpayPaymentResponse>(
        paymentUrl,
        payload,
        { 
          headers: this.getAuthHeaders(true), // Incluir User-Agent para v3.5/charges
          timeout: 30000,
        },
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'processPaymentWithToken');
    }
  }

  /**
   * Procesa un pago con token de un solo uso
   * @param createPaymentDto Datos del pago
   * @returns Información de la transacción
   */
  async processPayment(
    createPaymentDto: CreatePaymentDto,
  ): Promise<NetpayPaymentResponse> {
    try {
      const payload = {
        token: createPaymentDto.token,
        amount: createPaymentDto.amount,
        currency: createPaymentDto.currency,
        description: createPaymentDto.description,
        saveCard: createPaymentDto.saveCard ? String(createPaymentDto.saveCard) : 'false', // Netpay espera string
        deviceInformation: createPaymentDto.deviceInformation,
        ...(createPaymentDto.referenceId && { referenceId: createPaymentDto.referenceId }),
      };

      const response = await this.httpClient.post<NetpayPaymentResponse>(
        '/v1/charges',
        payload,
        { headers: this.getAuthHeaders() },
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Crea un cliente en Netpay
   * @param createCustomerDto Datos del cliente
   * @returns Información del cliente creado
   */
  async createCustomer(
    createCustomerDto: CreateCustomerDto,
  ): Promise<NetpayCustomerResponse> {
    try {
      const identifier =
        createCustomerDto.identifier ??
        Math.floor(1000000000 + Math.random() * 9000000000).toString();
  
      const trimStr = (v: unknown): string =>
        v === undefined || v === null ? '' : String(v).trim();

      const optionalStr = (v: unknown): string | undefined => {
        const s = trimStr(v);
        return s === '' ? undefined : s;
      };

      const optionalInt = (v: unknown): number | undefined => {
        if (v === undefined || v === null || v === '') return undefined;
        const n = Number(v);
        if (!Number.isFinite(n)) return undefined;
        return Math.trunc(n);
      };

      const optionalDireccion = (v: unknown): DireccionTarjetaDto | undefined => {
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          return v as DireccionTarjetaDto;
        }
        return undefined;
      };

      const firstName =
        trimStr(createCustomerDto.firstName) ||
        trimStr(createCustomerDto.nombre);
  
      const lastName =
        trimStr(createCustomerDto.lastName) ||
        [
          trimStr(createCustomerDto.apellidoPaterno),
          trimStr(createCustomerDto.apellidoMaterno),
        ]
          .filter(Boolean)
          .join(' ')
          .trim();
  
      const payload: any = {
        firstName,
        lastName,
        email: createCustomerDto.email,
        identifier,
      };
  
      const phone =
        trimStr(createCustomerDto.phone) || trimStr(createCustomerDto.telefono);
  
      if (phone) {
        payload.phone = phone;
      }
  
      // IMPORTANTE:
      // Crear cliente sin tarjeta en v4
      const clientsUrl = `${this.netpayEcommerceBaseUrl}/v4/clients`;
  
      console.log('[NETPAY] createCustomer payload:', JSON.stringify(payload, null, 2));
  
      const response = await axios.post<NetpayCustomerResponse>(
        clientsUrl,
        payload,
        {
          headers: this.getAuthHeaders(),
          timeout: 30000,
        },
      );
  
      const customerResponse = response.data;
  
      const customerId =
        customerResponse?.id ||
        customerResponse?.customerId ||
        customerResponse?.clientId?.toString();
  
      if (createCustomerDto.idPasajero && customerId) {
        try {
          await this.pasajeroRepository.update(createCustomerDto.idPasajero, {
            customerIdNetPay: String(customerId),
          });
        } catch (updateError) {
          console.error(
            '[NETPAY] Error al actualizar customerIdNetPay del pasajero:',
            updateError,
          );
        }
      }
  
      // Luego asignar la tarjeta con el token ya generado en frontend
      if (createCustomerDto.token && customerId) {
        try {
          await this.assignCardToCustomer({
            customerId: String(customerId),
            token: createCustomerDto.token,
            preAuth: false,
            cvv2: optionalStr(createCustomerDto.cvv2),
            referenceId: createCustomerDto.referenceId,
            idDireccion: optionalInt(createCustomerDto.idDireccion),
            nombre: optionalStr(createCustomerDto.nombre) ?? firstName,
            apellidoPaterno: optionalStr(createCustomerDto.apellidoPaterno),
            apellidoMaterno: optionalStr(createCustomerDto.apellidoMaterno),
            email: createCustomerDto.email,
            telefono: optionalStr(createCustomerDto.telefono) ?? optionalStr(phone),
            direccion: optionalDireccion(createCustomerDto.direccion),
          });
        } catch (assignError) {
          console.error(
            '[NETPAY] Error al asignar tarjeta al customer:',
            assignError,
          );
        }
      }
  
      return customerResponse;
    } catch (error) {
      console.log('ERROR:', error);
      this.handleError(error, 'createCustomer');
    }
  }


  /**
   * Asigna una tarjeta a un cliente existente
   * @param assignCardDto Datos para asignar la tarjeta
   * @returns Información de la tarjeta asignada
   */
  /**
   * Asigna una tarjeta (token) a un cliente existente
   * @param assignCardDto Datos para asignar la tarjeta
   * @returns Información de la tarjeta asignada
   */
  async assignCardToCustomer(
    assignCardDto: AssignCardDto,
  ): Promise<NetpayCardResponse> {
    try {
      let clientIdParam: string | number = assignCardDto.customerId;
  
      if (
        typeof assignCardDto.customerId === 'string' &&
        assignCardDto.customerId.trim() !== '' &&
        !isNaN(Number(assignCardDto.customerId))
      ) {
        clientIdParam = Number(assignCardDto.customerId);
      }
  
      const payload: any = {
        token: assignCardDto.token,
        preAuth: assignCardDto.preAuth ?? false,
      };
  
      if (assignCardDto.cvv2) {
        payload.cvv2 = assignCardDto.cvv2;
      }
  
      let idDireccionFinal: number | null = null;
  
      // Si viene idDireccion, solo validar que exista
      if (assignCardDto.idDireccion) {
        const direccionExistente = await this.direccionesTarjetaRepository.findOne({
          where: { id: assignCardDto.idDireccion },
        });
  
        if (!direccionExistente) {
          throw new BadRequestException(
            `No se encontró la dirección con ID ${assignCardDto.idDireccion}`,
          );
        }
  
        idDireccionFinal = assignCardDto.idDireccion;
      }
      // Si no viene idDireccion pero sí vienen datos y dirección, crear registros
      else if (
        assignCardDto.direccion &&
        (
          assignCardDto.nombre ||
          assignCardDto.apellidoPaterno ||
          assignCardDto.apellidoMaterno ||
          assignCardDto.email ||
          assignCardDto.telefono
        )
      ) {
        const datosTarjetaData = this.datosTarjetaRepository.create({
          nombre: assignCardDto.nombre || null,
          apellidoPaterno: assignCardDto.apellidoPaterno || null,
          apellidoMaterno: assignCardDto.apellidoMaterno || null,
          email: assignCardDto.email || null,
          telefono: assignCardDto.telefono || null,
          customerIdNetPay: String(assignCardDto.customerId),
          estatus: 1,
        });
  
        const datosTarjetaGuardado =
          await this.datosTarjetaRepository.save(datosTarjetaData);
  
        const nuevaDireccion = this.direccionesTarjetaRepository.create({
          ciudad: assignCardDto.direccion.ciudad || null,
          pais: assignCardDto.direccion.pais || 'MX',
          cp: assignCardDto.direccion.CP || null,
          estado: assignCardDto.direccion.estado || null,
          calle: assignCardDto.direccion.calle || null,
          calleEsquina: assignCardDto.direccion.calleEsquina || null,
          colonia: assignCardDto.direccion.colonia || null,
          idDatosTarjeta: datosTarjetaGuardado.id,
          estatus: 1,
        });
  
        const direccionGuardada =
          await this.direccionesTarjetaRepository.save(nuevaDireccion);
  
        idDireccionFinal = direccionGuardada.id;
      }
  
      const assignCardUrl = `${this.netpayEcommerceBaseUrl}/v3/clients/${clientIdParam}/token`;
  
      console.log(
        '[NETPAY] assignCardToCustomer url:',
        assignCardUrl,
      );
      console.log(
        '[NETPAY] assignCardToCustomer payload:',
        JSON.stringify(payload, null, 2),
      );
  
      const response = await axios.put<NetpayCardResponse>(
        assignCardUrl,
        payload,
        {
          headers: this.getAuthHeaders(),
          timeout: 30000,
        },
      );
  
      if (response.data && idDireccionFinal) {
        const referenceId =
          assignCardDto.referenceId || (response.data as any)?.referenceId || null;
  
        const tokenDireccion = this.tokenDireccionesRepository.create({
          idDireccion: idDireccionFinal,
          tokenCard: assignCardDto.token,
          referenceId,
        });
  
        await this.tokenDireccionesRepository.save(tokenDireccion);
      }
  
      return response.data;
    } catch (error) {
      console.log('ERROR assignCardToCustomer:', error);
      this.handleError(error, 'assignCardToCustomer');
    }
  }
  /**
   * Obtiene los datos de tarjeta y direcciones asociadas por CustomerIdNetPay
   * @param customerIdNetPay ID del cliente en Netpay
   * @returns Datos de tarjeta con sus direcciones asociadas
   */
  async getDatosTarjetaByCustomerId(customerIdNetPay: string): Promise<any> {
    try {
      if (!customerIdNetPay) {
        throw new BadRequestException('El parámetro customerIdNetPay es requerido');
      }

      // Buscar datos de tarjeta por CustomerIdNetPay con estatus activo (1)
      const datosTarjeta = await this.datosTarjetaRepository.find({
        where: { 
          customerIdNetPay: customerIdNetPay,
          estatus: 1, // ✅ Solo tarjetas activas
        },
        relations: ['direccionesTarjeta'],
        order: { id: 'DESC' },
      });

      if (!datosTarjeta || datosTarjeta.length === 0) {
        return [];
      }

      // Formatear la respuesta: array plano de direcciones con datos del titular
      const resultado: any[] = [];
      
      for (const dato of datosTarjeta) {
        // ✅ Filtrar solo direcciones activas (estatus = 1)
        const direccionesActivas = dato.direccionesTarjeta?.filter(dir => dir.estatus === 1) || [];
        
        for (const dir of direccionesActivas) {
          // ✅ Buscar tokens activos directamente en la BD para esta dirección
          const tokensActivos = await this.tokenDireccionesRepository.find({
            where: { 
              idDireccion: dir.id,
              estatus: 1, // Solo tokens activos
            },
            order: { id: 'DESC' },
          });
          
          // Obtener el tokenCard y referenceId del primer token activo
          let tokenCard: string | null = null;
          let referenceId: string | null = null;
          if (tokensActivos && tokensActivos.length > 0) {
            tokenCard = tokensActivos[0].tokenCard || null;
            referenceId = tokensActivos[0].referenceId || null;
          }
          
          // Combinar apellidos
          const apellidos = dato.apellidoMaterno 
            ? `${dato.apellidoPaterno || ''} ${dato.apellidoMaterno}`.trim()
            : dato.apellidoPaterno || '';
          
          const direccionObj: any = {
            idDireccion: dir.id,
            nombre: dato.nombre,
            apellidos: apellidos,
            telefono: dato.telefono,
            email: dato.email,
            ciudad: dir.ciudad,
            pais: dir.pais,
            CP: dir.cp,
            estado: dir.estado,
            calle: dir.calle,
            calleEsquina: dir.calleEsquina,
          };
          
          // Agregar colonia solo si existe
          if (dir.colonia) {
            direccionObj.colonia = dir.colonia;
          }
          
          // Agregar tokenCard siempre (puede ser null)
          direccionObj.tokenCard = tokenCard;
          
          // Agregar referenceId siempre (puede ser null)
          direccionObj.referenceId = referenceId;
          
          resultado.push(direccionObj);
        }
      }

      return resultado;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Error al obtener los datos de tarjeta: ${error.message}`,
      );
    }
  }

  /**
   * Consulta información de un cliente
   * @param customerId ID del cliente (puede ser id string o clientId número)
   * @returns Información del cliente con datos de tarjeta y direcciones
   */
  async getCustomer(customerId: string): Promise<any> {
    try {
      // Netpay puede usar tanto el id (string) como el clientId (número)
      // Intentar primero con el clientId como número, si no es válido, usar como string
      let clientIdParam: string | number = customerId;
      
      // Si es un número válido, convertirlo a número
      if (!isNaN(Number(customerId)) && customerId.trim() !== '') {
        clientIdParam = Number(customerId);
      }
      
      // URL completa para obtener cliente - usar endpoint v3/clients
      // El endpoint acepta tanto número como string según el tipo de ID
      const clientUrl = `${this.netpayEcommerceBaseUrl}/v3/clients/${clientIdParam}`;


      // Usar axios directamente con la URL completa
      const response = await axios.get<NetpayCustomerResponse>(
        clientUrl,
        { 
          headers: this.getAuthHeaders(),
          timeout: 30000,
        },
      );

      // Buscar datos relacionados en DatosTarjeta y DireccionesTarjeta
      const datosTarjeta = await this.datosTarjetaRepository.find({
        where: { 
          customerIdNetPay: customerId,
          estatus: 1, // Solo tarjetas activas
        },
        relations: ['direccionesTarjeta'],
        order: { id: 'DESC' },
      });

      // Formatear el arreglo de datos de tarjeta con direcciones
      const datosTarjetaArray: any[] = [];
      
      for (const dato of datosTarjeta) {
        // Filtrar solo direcciones activas
        const direccionesActivas = dato.direccionesTarjeta?.filter(dir => dir.estatus === 1) || [];
        
        for (const direccion of direccionesActivas) {
          // Buscar tokens activos para esta dirección
          const tokensActivos = await this.tokenDireccionesRepository.find({
            where: { 
              idDireccion: direccion.id,
              estatus: 1,
            },
            order: { id: 'DESC' },
          });
          
          const tokenCard = tokensActivos.length > 0 ? tokensActivos[0].tokenCard : null;
          const referenceId = tokensActivos.length > 0 ? tokensActivos[0].referenceId : null;
          
          datosTarjetaArray.push({
            idDireccion: Number(direccion.id),
            nombre: dato.nombre,
            apellidos: dato.apellidoMaterno
              ? `${dato.apellidoPaterno || ''} ${dato.apellidoMaterno}`.trim()
              : dato.apellidoPaterno || null,
            telefono: dato.telefono,
            email: dato.email,
            ciudad: direccion.ciudad,
            pais: direccion.pais,
            CP: direccion.cp,
            estado: direccion.estado,
            calle: direccion.calle,
            calleEsquina: direccion.calleEsquina,
            colonia: direccion.colonia || null,
            tokenCard: tokenCard,
            referenceId: referenceId,
          });
        }
      }

      // Si no hay direcciones, crear objetos solo con datos personales
      if (datosTarjetaArray.length === 0) {
        for (const dato of datosTarjeta) {
          datosTarjetaArray.push({
            idDireccion: null,
            nombre: dato.nombre,
            apellidos: dato.apellidoMaterno 
              ? `${dato.apellidoPaterno || ''} ${dato.apellidoMaterno}`.trim()
              : dato.apellidoPaterno || null,
            telefono: dato.telefono,
            email: dato.email,
            ciudad: null,
            pais: null,
            CP: null,
            estado: null,
            calle: null,
            calleEsquina: null,
            colonia: null,
            tokenCard: null,
          });
        }
      } // Aplanar el arreglo de arreglos

      // Combinar la respuesta de Netpay con los datos de tarjeta
      return {
        ...response.data,
        datosTarjeta: datosTarjetaArray,
      };
    } catch (error) {
      this.handleError(error, 'getCustomer');
    }
  }

  /**
   * Elimina una tarjeta de un cliente
   * @param customerId ID del cliente
   * @param tokenCard Token de la tarjeta
   * @returns Confirmación de eliminación
   */
  async deleteCard(
    customerId: string,
    tokenCard: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Codificar los parámetros para evitar problemas con caracteres especiales
      const encodedCustomerId = encodeURIComponent(customerId);
      const encodedTokenCard = encodeURIComponent(tokenCard);

      // URL completa para eliminar tarjeta - usar endpoint v3/clients/{clientId}/token/{tokenCard}
      const deleteUrl = `${this.netpayEcommerceBaseUrl}/v3/clients/${encodedCustomerId}/token/${encodedTokenCard}`;

      // Usar axios directamente con la URL completa
      await axios.delete(
        deleteUrl,
        {
          headers: this.getAuthHeaders(),
          timeout: 30000,
        },
      );

      // ✅ Si la eliminación en Netpay fue exitosa, actualizar estatus en base de datos
      console.log('[NETPAY] Tarjeta eliminada en Netpay, actualizando registros en BD...');
      
      // 1. Buscar en TokenDirecciones por el tokenCard
      const tokenDireccion = await this.tokenDireccionesRepository.findOne({
        where: { tokenCard: tokenCard },
        relations: ['idDireccion2'], // Cargar la relación con DireccionesTarjeta
      });

      if (tokenDireccion) {
        console.log('[NETPAY] TokenDireccion encontrado, ID:', tokenDireccion.id);
        
        // 2. Actualizar estatus de TokenDirecciones a 0 (inactivo)
        await this.tokenDireccionesRepository.update(tokenDireccion.id, {
          estatus: 0,
        });
        console.log('[NETPAY] TokenDireccion actualizado a estatus 0');

        // 3. Si tiene relación con DireccionesTarjeta, actualizar también
        if (tokenDireccion.idDireccion) {
          const direccionTarjeta = await this.direccionesTarjetaRepository.findOne({
            where: { id: tokenDireccion.idDireccion },
            relations: ['idDatosTarjeta2'], // Cargar la relación con DatosTarjeta
          });

          if (direccionTarjeta) {
            console.log('[NETPAY] DireccionTarjeta encontrada, ID:', direccionTarjeta.id);
            
            // 4. Actualizar estatus de DireccionesTarjeta a 0
            await this.direccionesTarjetaRepository.update(direccionTarjeta.id, {
              estatus: 0,
            });
            console.log('[NETPAY] DireccionTarjeta actualizada a estatus 0');

            // 5. Si tiene relación con DatosTarjeta, actualizar también
            if (direccionTarjeta.idDatosTarjeta) {
              const datosTarjeta = await this.datosTarjetaRepository.findOne({
                where: { id: direccionTarjeta.idDatosTarjeta },
              });

              if (datosTarjeta) {
                console.log('[NETPAY] DatosTarjeta encontrados, ID:', datosTarjeta.id);
                
                // 6. Actualizar estatus de DatosTarjeta a 0
                await this.datosTarjetaRepository.update(datosTarjeta.id, {
                  estatus: 0,
                });
                console.log('[NETPAY] DatosTarjeta actualizados a estatus 0');
              } else {
                console.log('[NETPAY] No se encontraron DatosTarjeta con ID:', direccionTarjeta.idDatosTarjeta);
              }
            } else {
              console.log('[NETPAY] DireccionTarjeta no tiene idDatosTarjeta asociado');
            }
          } else {
            console.log('[NETPAY] No se encontró DireccionTarjeta con ID:', tokenDireccion.idDireccion);
          }
        } else {
          console.log('[NETPAY] TokenDireccion no tiene idDireccion asociado');
        }
      } else {
        console.log('[NETPAY] No se encontró TokenDireccion con tokenCard:', tokenCard);
      }

      return { 
        success: true, 
        message: 'Tarjeta eliminada correctamente de Netpay y registros actualizados en base de datos' 
      };
    } catch (error) {
      this.handleError(error, 'deleteCard');
    }
  }

  /**
   * Procesa un pago con token guardado
   * @param createPaymentDto Datos del pago (debe incluir customerId y cardId)
   * @returns Información de la transacción
   */
  /**
   * Procesa un pago con tarjeta guardada usando referenceID
   * Usa el endpoint v3.5/charges de Netpay
   * @param createPaymentDto Datos del pago con referenceID (identifica la tarjeta guardada)
   * @returns Información de la transacción
   */
  async processPaymentWithSavedCard(
    paymentSavedCardDto: PaymentSavedCardDto,
  ): Promise<NetpayPaymentResponse> {
    // Para tarjeta guardada, se requiere referenceID según el curl proporcionado
    if (!paymentSavedCardDto.referenceId) {
      throw new BadRequestException(
        'referenceID es requerido para pagos con tarjeta guardada',
      );
    }

    try {
      // Preparar payload según el formato exacto de Netpay v3.5/charges para tarjeta guardada
      // Orden exacto según el curl proporcionado (NO incluir token, customerId, cardId)
      // IMPORTANTE: Para tarjeta guardada solo se usa referenceID, NO token
      const payload: any = {
        transactionType: 'Auth',
        amount: paymentSavedCardDto.amount,
        description: paymentSavedCardDto.description,
        paymentMethod: 'card',
      };

      // Agregar sessionId (usar deviceFingerPrint como fallback si no está presente)
      // Debe ir después de paymentMethod, antes de deviceFingerPrint
      if (paymentSavedCardDto.sessionId) {
        payload.sessionId = paymentSavedCardDto.sessionId;
      } else if (paymentSavedCardDto.deviceFingerPrint) {
        payload.sessionId = paymentSavedCardDto.deviceFingerPrint;
      }

      // Agregar deviceFingerPrint (usar sessionId como fallback si no está presente)
      // Debe ir después de sessionId, antes de currency
      if (paymentSavedCardDto.deviceFingerPrint) {
        payload.deviceFingerPrint = paymentSavedCardDto.deviceFingerPrint;
      } else if (paymentSavedCardDto.sessionId) {
        payload.deviceFingerPrint = paymentSavedCardDto.sessionId;
      }

      // Agregar currency después de deviceFingerPrint
      payload.currency = paymentSavedCardDto.currency || 'MXN';

      // Agregar billing si está presente (debe ir después de currency, antes de saveCard)
      if (paymentSavedCardDto.billing && Object.keys(paymentSavedCardDto.billing).length > 0) {
        payload.billing = paymentSavedCardDto.billing;
      }

      // Agregar saveCard (string "true" o "false") - debe ir después de billing
      payload.saveCard = paymentSavedCardDto.saveCard || 'false';

      // Agregar referenceID (requerido para tarjeta guardada) - debe ir después de saveCard
      // Este es el único campo necesario para identificar la tarjeta guardada
      payload.referenceID = paymentSavedCardDto.referenceId;

      // Agregar deviceInformation si está presente - debe ir al final
      if (paymentSavedCardDto.deviceInformation && Object.keys(paymentSavedCardDto.deviceInformation).length > 0) {
        payload.deviceInformation = paymentSavedCardDto.deviceInformation;
      }

      // Asegurar que NO se incluya token, customerId, ni cardId en el payload
      // Eliminar explícitamente estos campos si existen por alguna razón
      delete payload.token;
      delete payload.customerId;
      delete payload.cardId;

      // Crear un nuevo objeto limpio solo con los campos permitidos
      // Esto asegura que no haya campos adicionales que puedan causar problemas
      const cleanPayload: any = {
        transactionType: payload.transactionType,
        amount: payload.amount,
        description: payload.description,
        paymentMethod: payload.paymentMethod,
      };

      // Agregar source si token está presente (Netpay espera source, no token)
      if (paymentSavedCardDto.token) {
        cleanPayload.source = paymentSavedCardDto.token;
      }

      // Agregar campos opcionales solo si existen y no son null/undefined
      if (payload.sessionId) cleanPayload.sessionId = payload.sessionId;
      if (payload.deviceFingerPrint) cleanPayload.deviceFingerPrint = payload.deviceFingerPrint;
      if (payload.currency) cleanPayload.currency = payload.currency;
      if (payload.billing) cleanPayload.billing = payload.billing;
      if (payload.saveCard) cleanPayload.saveCard = payload.saveCard;
      if (payload.referenceID) cleanPayload.referenceID = payload.referenceID;
      if (payload.deviceInformation) cleanPayload.deviceInformation = payload.deviceInformation;

      // Limpiar el objeto usando JSON para eliminar cualquier campo undefined/null
      // Esto asegura que no haya campos adicionales que puedan causar problemas
      const finalPayload = JSON.parse(JSON.stringify(cleanPayload));
      console.log(finalPayload);
      // Asegurar que NO haya customerId ni cardId (pero token sí puede estar si se proporciona)
      delete finalPayload.customerId;
      delete finalPayload.cardId;

      // URL completa para procesar pagos - usar endpoint v3.5/charges
      const paymentUrl = `${this.netpayEcommerceBaseUrl}/v3.5/charges`;
      console.log(paymentUrl);
      // Obtener headers de autenticación
      const headers = this.getAuthHeaders(true); // Incluir User-Agent para v3.5/charges


      // Usar axios directamente con la URL completa
      // Incluir User-Agent header como en el curl de ejemplo
      const response = await axios.post<NetpayPaymentResponse>(
        paymentUrl,
        finalPayload,
        { 
          headers: headers,
          timeout: 30000,
        },
      );
      console.log(response.data,"RESPONSE PAGO") 
      return response.data;
    } catch (error) {
      this.handleError(error, 'processPaymentWithSavedCard');
    }
  }
  
  /**
   * Confirma una transacción después de 3D Secure
   * Usa el endpoint v3.5/charges/{transaccionTokenId}/confirm
   * @param confirm3DSDto Datos de confirmación 3DS
   * @returns Información de la transacción confirmada
   */
  async confirm3DSPayment(
    confirm3DSDto: Confirm3DSDto,
  ): Promise<NetpayPaymentResponse> {
    try {
      // URL completa para confirmar transacción 3DS
      // Formato: /v3.5/charges/{transaccionTokenId}/confirm?processorTransactionId={processorTransactionId}
      const confirmUrl = `${this.netpayEcommerceBaseUrl}/v3.5/charges/${confirm3DSDto.transaccionTokenId}/confirm?processorTransactionId=${confirm3DSDto.processorTransactionId}`;


      // Usar axios directamente con la URL completa
      const response = await axios.post<NetpayPaymentResponse>(
        confirmUrl,
        {}, // Body vacío según el curl proporcionado
        { 
          headers: this.getAuthHeaders(false), // No incluir User-Agent para este endpoint
          timeout: 30000,
        },
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'confirm3DSPayment');
    }
  }

  /**
   * Consulta los detalles de una transacción
   * Usa el endpoint v3/transactions/{transactionTokenId}
   * @param transactionTokenId Transaction Token ID de la transacción
   * @returns Detalles de la transacción
   */
  async getTransactionDetails(
    transactionTokenId: string,
  ): Promise<NetpayTransactionDetailResponse> {
    try {
      // URL completa para consultar transacción - usar endpoint v3/transactions/{transactionTokenId}
      const transactionUrl = `${this.netpayEcommerceBaseUrl}/v3/transactions/${transactionTokenId}`;


      // Usar axios directamente con la URL completa
      const response = await axios.get<NetpayTransactionDetailResponse>(
        transactionUrl,
        { 
          headers: this.getAuthHeaders(false), // No incluir User-Agent para este endpoint
          timeout: 30000,
        },
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'getTransactionDetails');
    }
  }

  /**
   * Cancela o reembolsa una transacción
   * Usa el endpoint reports-sandbox/v2/transactions/{tokenId}/refund
   * @param cancelRefundDto Datos para cancelar/reembolsar
   * @returns Información de la transacción cancelada/reembolsada
   */
  async cancelOrRefund(
    cancelRefundDto: CancelRefundDto,
  ): Promise<NetpayTransactionDetailResponse> {
    try {
      // Construir payload según el formato de Netpay
      const payload: any = {};

      if (cancelRefundDto.amount) {
        payload.amount = String(cancelRefundDto.amount); // Netpay espera amount como string
      }

      if (cancelRefundDto.motive) {
        payload.motive = cancelRefundDto.motive;
      }

      // URL para refund - usar endpoint reports-sandbox/v2/transactions/{tokenId}/refund
      // En producción sería reports/v2 en lugar de reports-sandbox/v2
      const reportsBaseUrl = this.isProduction
        ? 'https://gateway.netpay-api.com/reports'
        : 'https://gateway.netpay-api.com/reports-sandbox';
      
      const refundUrl = `${reportsBaseUrl}/v2/transactions/${cancelRefundDto.tokenId}/refund`;


      // Usar axios directamente con la URL completa
      // Usar headers especiales para reports (X-Netpay-Apikey)
      const response = await axios.put<NetpayTransactionDetailResponse>(
        refundUrl,
        payload,
        { 
          headers: this.getReportsAuthHeaders(),
          timeout: 30000,
        },
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'cancelOrRefund');
    }
  }
}
