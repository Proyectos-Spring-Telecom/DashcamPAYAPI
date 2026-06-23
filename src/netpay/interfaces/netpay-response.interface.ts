/**
 * Interfaces para las respuestas de la API de Netpay
 */

export interface NetpayTokenResponse {
  token: string;
  cardType?: string;
  cardBrand?: string;
}

export interface NetpayReferenceIdResponse {
  referenceId: string;
}

export interface NetpayCheckInResponse {
  referenceId: string;
  checkoutUrl?: string;
}

export interface NetpayPaymentResponse {
  transactionId: string;
  status: string;
  authorizationCode?: string;
  message?: string;
  amount?: number;
  currency?: string;
}

export interface NetpayCustomerResponse {
  id?: string;
  clientId?: number;
  customerId?: string;
  storeIdAdq?: number;
  name?: string;
  phone?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  paymentSources?: any[];
  status?: string;
  message?: string;
}

export interface NetpayCardResponse {
  cardId: string;
  last4: string;
  brand: string;
  status: string;
}

export interface NetpayTransactionDetailResponse {
  transactionId: string;
  status: string;
  amount: number;
  currency: string;
  authorizationCode?: string;
  referenceId?: string;
  createdAt: string;
  updatedAt: string;
  card?: {
    last4: string;
    brand: string;
  };
}

export interface NetpayErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: any;
}
