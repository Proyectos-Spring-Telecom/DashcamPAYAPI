# Módulo Netpay

Módulo de integración con la pasarela de pagos Netpay para NestJS.

## ⚠️ Seguridad PCI DSS — Tokenización solo en cliente

**IMPORTANTE:** Este módulo NO acepta números de tarjeta (PAN), fechas de expiración ni CVV.
Todo dato de tarjeta sensible debe tokenizarse en el **cliente** usando:

- **Frontend Web:** NetpayJS (librería de Netpay)
- **App Móvil:** SDK de Netpay

El backend SOLO maneja tokens sustitutos generados por Netpay.
Este enfoque reduce el alcance de cumplimiento PCI DSS a SAQ A/A-EP.

### Flujo correcto:
1. Cliente captura: número, expiración, CVV
2. Cliente tokeniza con NetpayJS/SDK → obtiene `token`
3. Cliente envía `token` al backend
4. Backend procesa pago con el `token`

### Lo que NUNCA llega al backend:
- ❌ cardNumber (PAN)
- ❌ cvv / cvv2
- ❌ expMonth / expYear

Si el cliente intenta enviar estos campos, serán ignorados por seguridad.

## Configuración

### Variables de Entorno

Agrega las siguientes variables a tu archivo `.env`:

```env
# Ambiente: 'sandbox' o 'production'
NETPAY_ENVIRONMENT=sandbox

# URL base de la API (opcional, se usan valores por defecto si no se especifica)
# NETPAY_BASE_URL=https://sandbox.netpay.com.mx

# Llaves de API de Netpay
NETPAY_PUBLIC_KEY=tu_public_key_aqui
NETPAY_PRIVATE_KEY=tu_private_key_aqui
```

**⚠️ IMPORTANTE - URLs de Netpay**: 

Las URLs por defecto son:
- **Sandbox**: `https://sandbox.netpay.com.mx`
- **Production**: `https://suite.netpay.com.mx`

**Sin embargo**, las URLs exactas pueden variar según:
- La versión de la API de Netpay que estés usando
- Tu configuración específica en Netpay Manager
- La región o el tipo de cuenta

**Si obtienes errores de timeout o conexión**:
1. Verifica la URL correcta en tu cuenta de Netpay Manager
2. Consulta la documentación oficial de Netpay para tu versión de API
3. Configura `NETPAY_BASE_URL` manualmente con la URL correcta:
   ```env
   NETPAY_BASE_URL=https://tu-url-correcta.netpay.com.mx
   ```

**Nota**: Los endpoints pueden requerir rutas diferentes (ej: `/api/v1/tokens` en lugar de `/v1/tokens`). Verifica la documentación de Netpay para tu versión específica.

### Obtener Llaves

1. **Sandbox (Pruebas)**: Obtén las llaves desde [Netpay Manager](https://manager.netpay.com.mx)
2. **Producción**: Solicita las llaves de producción al equipo de Netpay

## Uso

### Opción Recomendada: Tokenización desde Frontend

**Netpay está diseñado para tokenizar desde el frontend usando NetpayJS.** Esta es la forma más segura y recomendada:

1. **Frontend**: Usa NetpayJS para tokenizar la tarjeta del cliente
2. **Frontend**: Envía el token al backend
3. **Backend**: Procesa el pago usando el token

Ver la guía completa en [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md)

**Endpoints disponibles para esta opción:**
- `GET /netpay/public-key` - Obtiene la public key para usar en NetpayJS
- `POST /netpay/payment/with-token` - Procesa un pago con token generado por NetpayJS

### Inyectar el Servicio

```typescript
import { NetpayService } from './netpay/netpay.service';

constructor(private readonly netpayService: NetpayService) {}
```

### Flujos de Pago

#### Pago con Token (generado en el cliente)

```typescript
// El token se obtiene en el frontend con NetpayJS — nunca en el backend
const payment = await this.netpayService.processPaymentWithToken({
  token: tokenFromNetpayJS,
  amount: 100.5,
  currency: 'MXN',
  description: 'Pago de servicio',
  deviceFingerPrint: '...',
  sessionId: '...',
  billing: { /* ... */ },
  deviceInformation: { /* ... */ },
});
```

#### Pago con Tarjeta Guardada

```typescript
// 1. Crear cliente (token generado previamente en el cliente con NetpayJS)
const customer = await this.netpayService.createCustomer({
  firstName: 'Juan',
  lastName: 'Pérez',
  email: 'juan@example.com',
  token: tokenFromNetpayJS,
});

// 2. Procesar pago con tarjeta guardada
const payment = await this.netpayService.processPaymentWithSavedCard({
  referenceId: '1222337263222',
  amount: 100.5,
  currency: 'MXN',
  description: 'Pago de servicio',
});
```

#### Checkout Custom

```typescript
// 1. Obtener Reference ID
const reference = await this.netpayService.getReferenceId();

// 2. Check-in
const checkIn = await this.netpayService.checkIn(
  reference.referenceId,
  100.50,
  'MXN',
);

// 3. Procesar pago con referenceId (token desde NetpayJS en el cliente)
const payment = await this.netpayService.processPaymentWithToken({
  token: tokenFromNetpayJS,
  amount: 100.5,
  currency: 'MXN',
  description: 'Pago de servicio',
  referenceID: reference.referenceId,
});

// 4. Check-out
await this.netpayService.checkOut(reference.referenceId);
```

### 3D Secure

Si el pago requiere autenticación 3DS:

```typescript
// 1. Procesar pago (puede requerir 3DS; token desde NetpayJS)
const payment = await this.netpayService.processPaymentWithToken({
  token: tokenFromNetpayJS,
  amount: 100.5,
  currency: 'MXN',
  description: 'Pago de servicio',
  deviceInformation: { /* ... */ },
});

// 2. Si requiere 3DS, confirmar después de la autenticación
if (payment.status === '3DS_REQUIRED') {
  const confirmed = await this.netpayService.confirm3DSPayment({
    transactionId: payment.transactionId,
    referenceId: reference.referenceId,
  });
}
```

### Consultar Transacción

```typescript
const transaction = await this.netpayService.getTransactionDetails(
  'txn_1234567890',
);
```

### Cancelar o Reembolsar

```typescript
// Reembolso total
await this.netpayService.cancelOrRefund({
  transactionId: 'txn_1234567890',
});

// Reembolso parcial
await this.netpayService.cancelOrRefund({
  transactionId: 'txn_1234567890',
  amount: 50.25,
  reason: 'Cancelación parcial',
});
```

## Endpoints Disponibles

- `GET /netpay/test-connection` - Verificar conectividad con Netpay
- `GET /netpay/public-key` - Public key para NetpayJS (frontend)
- `POST /netpay/payment/with-token` - Procesar pago con token (recomendado)
- `POST /netpay/payment/saved-card` - Procesar pago con tarjeta guardada
- `POST /netpay/customers` - Crear cliente
- `GET /netpay/customers/:customerId` - Consultar cliente
- `PUT /netpay/customers/:customerId/cards` - Asignar tarjeta a cliente
- `DELETE /netpay/customers/:customerId/cards/:cardId` - Eliminar tarjeta
- `POST /netpay/3ds/confirm` - Confirmar pago 3DS
- `GET /netpay/transactions/:transactionId` - Consultar transacción
- `PUT /netpay/transactions/:transactionId/refund` - Cancelar/reembolsar

## Solución de Problemas

### Error: "No se recibió respuesta del servidor de Netpay"

Este error puede deberse a varias causas:

1. **URL incorrecta**: Verifica que la URL base sea correcta según tu versión de la API de Netpay
   ```env
   NETPAY_BASE_URL=https://tu-url-correcta.netpay.com.mx
   ```

2. **Llaves no configuradas**: Asegúrate de tener configuradas las variables de entorno
   ```env
   NETPAY_PUBLIC_KEY=tu_llave_publica
   NETPAY_PRIVATE_KEY=tu_llave_privada
   ```

3. **Problemas de red/firewall**: Verifica que tu servidor pueda acceder a la API de Netpay

4. **Autenticación incorrecta**: Algunas operaciones pueden requerir la public key en lugar de private key. El servicio intenta automáticamente ambos métodos.

5. **Verificar conectividad**: Usa el endpoint de prueba:
   ```bash
   GET /netpay/test-connection
   ```

### Verificar Configuración

El servicio muestra logs de depuración en la consola cuando hay problemas. Revisa los logs para ver:
- URL base utilizada
- Ambiente (sandbox/production)
- Estado de las llaves de API
- Detalles del error

## Manejo de Errores

El servicio maneja automáticamente los errores de la API de Netpay y lanza excepciones de NestJS:

- `BadRequestException`: Errores de validación o pago rechazado
- `InternalServerErrorException`: Errores del servidor o de conexión

Los errores incluyen información detallada para facilitar la depuración.

## Documentación Oficial

Para más detalles, consulta la [documentación oficial de Netpay](https://docs.netpay.com.mx/v1.2.1/reference/checkout-custom).
