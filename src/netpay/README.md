# Módulo Netpay

Módulo de integración con la pasarela de pagos Netpay para NestJS.

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

### Opción Alternativa: Tokenización desde Backend

Si necesitas tokenizar desde el backend (puede no estar disponible en todas las versiones de Netpay):

### Inyectar el Servicio

```typescript
import { NetpayService } from './netpay/netpay.service';

constructor(private readonly netpayService: NetpayService) {}
```

### Flujos de Pago

#### Opción 1: Pago con Token de Un Solo Uso

```typescript
// 1. Tokenizar tarjeta
const tokenResponse = await this.netpayService.tokenizeCard({
  cardNumber: '4111111111111111',
  cardHolderName: 'Juan Pérez',
  expirationMonth: '12',
  expirationYear: '2025',
  cvv: '123',
});

// 2. Procesar pago
const payment = await this.netpayService.processPayment({
  token: tokenResponse.token,
  amount: 100.50,
  currency: 'MXN',
  description: 'Pago de servicio',
  saveCard: false,
});
```

#### Opción 2: Pago con Tarjeta Guardada

```typescript
// 1. Crear cliente
const customer = await this.netpayService.createCustomer({
  firstName: 'Juan',
  lastName: 'Pérez',
  email: 'juan@example.com',
  token: tokenResponse.token, // Token de la tarjeta
});

// 2. Procesar pago con tarjeta guardada
const payment = await this.netpayService.processPaymentWithSavedCard({
  customerId: customer.customerId,
  cardId: 'card_123', // ID de la tarjeta guardada
  amount: 100.50,
  currency: 'MXN',
  description: 'Pago de servicio',
});
```

#### Opción 3: Checkout Custom

```typescript
// 1. Obtener Reference ID
const reference = await this.netpayService.getReferenceId();

// 2. Check-in
const checkIn = await this.netpayService.checkIn(
  reference.referenceId,
  100.50,
  'MXN',
);

// 3. Procesar pago con referenceId
const payment = await this.netpayService.processPayment({
  token: tokenResponse.token,
  amount: 100.50,
  currency: 'MXN',
  description: 'Pago de servicio',
  referenceId: reference.referenceId,
});

// 4. Check-out
await this.netpayService.checkOut(reference.referenceId);
```

### 3D Secure

Si el pago requiere autenticación 3DS:

```typescript
// 1. Procesar pago (puede requerir 3DS)
const payment = await this.netpayService.processPayment({
  token: tokenResponse.token,
  amount: 100.50,
  currency: 'MXN',
  description: 'Pago de servicio',
  deviceInformation: {
    deviceFingerprint: 'abc123',
    userAgent: navigator.userAgent,
  },
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
- `POST /netpay/tokenize` - Tokenizar tarjeta
- `POST /netpay/reference-id` - Obtener Reference ID
- `POST /netpay/check-in` - Check-in para checkout
- `POST /netpay/check-out` - Check-out para checkout
- `POST /netpay/payment` - Procesar pago con token
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
