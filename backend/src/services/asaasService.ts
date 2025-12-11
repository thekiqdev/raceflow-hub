import axios, { AxiosInstance, AxiosError } from 'axios';
import { query } from '../config/database.js';
import {
  AsaasCustomerRequest,
  AsaasCustomerResponse,
  AsaasPaymentRequest,
  AsaasPaymentResponse,
  AsaasBillingType,
  CreateCustomerResult,
  CreatePaymentResult,
  PaymentStatusResult,
} from '../types/asaas.js';

// Get Asaas configuration from environment
const getAsaasConfig = () => {
  const apiKey = process.env.ASAAS_API_KEY;
  const environment = process.env.ASAAS_ENVIRONMENT || 'sandbox';
  const apiUrl = process.env.ASAAS_API_URL || 
    (environment === 'production' 
      ? 'https://www.asaas.com/api/v3' 
      : 'https://sandbox.asaas.com/api/v3');

  console.log('🔧 Configuração Asaas:', {
    environment,
    apiUrl,
    hasApiKey: !!apiKey,
    apiKeyLength: apiKey?.length || 0,
  });

  if (!apiKey) {
    throw new Error('ASAAS_API_KEY não configurada nas variáveis de ambiente');
  }

  return { apiKey, apiUrl };
};

// Create axios instance for Asaas API
const createAsaasClient = (): AxiosInstance => {
  const { apiKey, apiUrl } = getAsaasConfig();

  const client = axios.create({
    baseURL: apiUrl,
    timeout: 30000, // 30 seconds
    headers: {
      'access_token': apiKey,
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor for logging
  client.interceptors.request.use(
    (config) => {
      console.log(`🌐 Asaas API Request: ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    },
    (error) => {
      console.error('❌ Asaas API Request Error:', error);
      return Promise.reject(error);
    }
  );

  // Response interceptor for error handling
  client.interceptors.response.use(
    (response) => {
      console.log(`✅ Asaas API Response: ${response.status} ${response.config.url}`);
      return response;
    },
    (error: AxiosError) => {
      if (error.response) {
        console.error(`❌ Asaas API Error: ${error.response.status}`, error.response.data);
      } else if (error.request) {
        console.error('❌ Asaas API Error: No response received', error.request);
      } else {
        console.error('❌ Asaas API Error:', error.message);
      }
      return Promise.reject(error);
    }
  );

  return client;
};

// Get or create Asaas customer
export const createCustomer = async (
  userId: string,
  customerData: AsaasCustomerRequest
): Promise<CreateCustomerResult> => {
  const asaasClient = createAsaasClient();

  try {
    // Check if customer already exists in our database
    const existingCustomer = await query(
      'SELECT asaas_customer_id FROM asaas_customers WHERE user_id = $1',
      [userId]
    );

    if (existingCustomer.rows.length > 0) {
      console.log(`📋 Cliente Asaas já existe para user_id: ${userId}`);
      return {
        asaas_customer_id: existingCustomer.rows[0].asaas_customer_id,
        created: false,
      };
    }

    // Check if customer exists in Asaas by CPF/CNPJ
    try {
      const searchResponse = await asaasClient.get('/customers', {
        params: {
          cpfCnpj: customerData.cpfCnpj,
        },
      });

      if (searchResponse.data?.data && searchResponse.data.data.length > 0) {
        const existingAsaasCustomer = searchResponse.data.data[0] as AsaasCustomerResponse;
        console.log(`📋 Cliente já existe no Asaas: ${existingAsaasCustomer.id}`);

        // Save to our database
        await query(
          'INSERT INTO asaas_customers (user_id, asaas_customer_id) VALUES ($1, $2)',
          [userId, existingAsaasCustomer.id]
        );

        return {
          asaas_customer_id: existingAsaasCustomer.id,
          created: false,
        };
      }
    } catch (searchError: any) {
      // If search fails, continue to create new customer
      console.log('⚠️ Erro ao buscar cliente no Asaas, criando novo:', searchError.message);
    }

    // Create new customer in Asaas
    console.log('🆕 Criando novo cliente no Asaas...');
    const response = await asaasClient.post<AsaasCustomerResponse>('/customers', customerData);

    const asaasCustomer = response.data;

    // Save to our database
    await query(
      'INSERT INTO asaas_customers (user_id, asaas_customer_id) VALUES ($1, $2)',
      [userId, asaasCustomer.id]
    );

    console.log(`✅ Cliente criado no Asaas: ${asaasCustomer.id}`);

    return {
      asaas_customer_id: asaasCustomer.id,
      created: true,
    };
  } catch (error: any) {
    console.error('❌ Erro ao criar cliente no Asaas:', error);
    
    if (error.response?.data) {
      const errorData = error.response.data;
      if (errorData.errors) {
        const errorMessages = errorData.errors.map((e: any) => e.description).join(', ');
        
        // Check if error is related to invalid CPF
        const isInvalidCpf = errorMessages.includes('CPF/CNPJ informado é inválido') || 
                            errorMessages.toLowerCase().includes('cpf') && errorMessages.toLowerCase().includes('inválido');
        
        if (isInvalidCpf) {
          throw new Error('CPF/CNPJ informado é inválido');
        }
        
        throw new Error(`Erro ao criar cliente no Asaas: ${errorMessages}`);
      }
    }

    throw new Error(`Erro ao criar cliente no Asaas: ${error.message}`);
  }
};

// Get customer by user ID
export const getCustomerByUserId = async (userId: string): Promise<string | null> => {
  const result = await query(
    'SELECT asaas_customer_id FROM asaas_customers WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].asaas_customer_id;
};

// Create payment in Asaas
export const createPayment = async (
  registrationId: string,
  customerId: string,
  paymentData: {
    value: number;
    dueDate: string; // YYYY-MM-DD
    description: string;
    billingType: AsaasBillingType;
    externalReference?: string;
  }
): Promise<CreatePaymentResult> => {
  const asaasClient = createAsaasClient();

  try {
    // Prepare payment request
    const paymentRequest: AsaasPaymentRequest = {
      customer: customerId,
      billingType: paymentData.billingType,
      value: paymentData.value,
      dueDate: paymentData.dueDate,
      description: paymentData.description,
      externalReference: paymentData.externalReference || `REG-${registrationId}`,
      installmentCount: 1,
      installmentValue: paymentData.value,
    };

    console.log('💳 Criando pagamento no Asaas...', { 
      registrationId, 
      customerId, 
      value: paymentData.value,
      billingType: paymentData.billingType,
      dueDate: paymentData.dueDate
    });

    // Create payment in Asaas
    const response = await asaasClient.post<AsaasPaymentResponse>('/payments', paymentRequest);
    const asaasPayment = response.data;

    // Log completo da resposta para identificar todos os campos
    console.log(`✅ Pagamento criado no Asaas - Resposta completa:`, JSON.stringify(asaasPayment, null, 2));
    
    // O Asaas pode retornar o ID numérico em invoiceNumber
    // Verificar se há um campo com ID numérico
    const invoiceNumber = (asaasPayment as any).invoiceNumber;
    const paymentIdForQuery = invoiceNumber || asaasPayment.id;
    
    console.log(`✅ Pagamento criado no Asaas:`, {
      id: asaasPayment.id,
      invoiceNumber: invoiceNumber,
      paymentIdForQuery: paymentIdForQuery,
      allFields: Object.keys(asaasPayment),
      status: asaasPayment.status,
      billingType: asaasPayment.billingType,
      value: asaasPayment.value,
      pixQrCodeAvailable: !!asaasPayment.pixQrCode,
      pixQrCodeId: asaasPayment.pixQrCodeId
    });

    // If PIX, wait and fetch QR Code
    let pixQrCode: string | null = null;
    let pixQrCodeId: string | null = null;

    if (paymentData.billingType === 'PIX') {
      console.log('🔍 Buscando QR Code PIX...');
      
      // Check if QR Code is already available in the initial response
      if (asaasPayment.pixQrCode) {
        pixQrCode = asaasPayment.pixQrCode;
        pixQrCodeId = asaasPayment.pixQrCodeId || null;
        console.log('✅ QR Code PIX já disponível na resposta inicial');
      } else {
        // Wait 2 seconds for QR Code to be generated
        console.log('⏳ Aguardando 2 segundos para geração do QR Code...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Try to get QR Code (up to 5 attempts)
        // O Asaas pode usar o invoiceNumber como ID para consulta
        const invoiceNumber = (asaasPayment as any).invoiceNumber;
        const paymentIdToUse = invoiceNumber || asaasPayment.id;
        
        console.log(`🔍 IDs disponíveis:`, {
          originalId: asaasPayment.id,
          invoiceNumber: invoiceNumber,
          paymentIdToUse: paymentIdToUse
        });
        
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            console.log(`🔍 Tentativa ${attempt}/5: Consultando pagamento com ID: ${paymentIdToUse}...`);
            
            // Usar o invoiceNumber se disponível, senão usar o ID original
            const paymentResponse = await asaasClient.get<AsaasPaymentResponse>(
              `/payments/${paymentIdToUse}`
            );

            const payment = paymentResponse.data;

            // Log completo da resposta para debug
            console.log(`📋 Resposta completa da consulta:`, {
              id: payment.id,
              status: payment.status,
              billingType: payment.billingType,
              pixQrCode: payment.pixQrCode ? `${payment.pixQrCode.substring(0, 50)}...` : null,
              pixQrCodeId: payment.pixQrCodeId,
              pixTransactionId: payment.pixTransactionId,
              // Verificar todos os campos possíveis
              allKeys: Object.keys(payment),
            });

            // Segundo a documentação do Asaas, o QR Code PIX deve ser obtido via endpoint específico
            // GET /v3/payments/{id}/pixQrCode
            // Este endpoint retorna: payload (código copia e cola), encodedImage (Base64), expirationDate
            // Vamos sempre tentar este endpoint primeiro, pois é o método recomendado
            try {
              console.log(`🔍 Tentando obter QR Code via endpoint específico: /payments/${paymentIdToUse}/pixQrCode`);
              const qrCodeResponse = await asaasClient.get(
                `/payments/${paymentIdToUse}/pixQrCode`
              );
              
              console.log(`📋 Resposta do endpoint pixQrCode:`, {
                hasPayload: !!qrCodeResponse.data?.payload,
                hasEncodedImage: !!qrCodeResponse.data?.encodedImage,
                expirationDate: qrCodeResponse.data?.expirationDate,
                allKeys: Object.keys(qrCodeResponse.data || {}),
              });
              
              if (qrCodeResponse.data?.payload) {
                pixQrCode = qrCodeResponse.data.payload;
                // O pixQrCodeId pode estar na resposta ou no payment
                pixQrCodeId = qrCodeResponse.data.id || payment.pixQrCodeId || (payment as any).pixTransaction?.id || null;
                console.log(`✅ QR Code PIX obtido via endpoint específico /pixQrCode`);
                if (pixQrCode) {
                  console.log(`📝 QR Code payload (primeiros 100 chars): ${pixQrCode.substring(0, 100)}...`);
                }
                break;
              }
            } catch (qrError: any) {
              console.log(`⚠️ Erro ao obter QR Code via endpoint específico:`, {
                message: qrError.message,
                status: qrError.response?.status,
                data: qrError.response?.data
              });
              // Se o endpoint específico falhar, tentar campos diretos na resposta do payment
              const pixTransaction = (payment as any).pixTransaction;
              const qrCode = payment.pixQrCode || 
                            (pixTransaction?.payload) || 
                            (pixTransaction?.qrCode) || 
                            (payment as any).pixQrCodeBase64 || 
                            (payment as any).qrCode;
              
              if (qrCode) {
                pixQrCode = qrCode;
                pixQrCodeId = payment.pixQrCodeId || pixTransaction?.id || null;
                console.log(`✅ QR Code PIX obtido nos campos diretos do payment`);
                break;
              }
            }

            if (attempt < 5) {
              const waitTime = attempt * 2000; // 2s, 4s, 6s, 8s
              console.log(`⏳ QR Code ainda não disponível, tentando novamente em ${waitTime/1000} segundos... (${attempt}/5)`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
              console.log('⚠️ QR Code PIX não disponível após 5 tentativas. Será buscado posteriormente.');
              console.log('💡 O QR Code pode estar disponível em alguns minutos. Use o endpoint de consulta de status.');
            }
          } catch (error: any) {
            console.error(`❌ Erro ao buscar QR Code (tentativa ${attempt}/5):`, {
              message: error.message,
              status: error.response?.status,
              data: error.response?.data
            });
            if (attempt < 5) {
              const waitTime = attempt * 2000;
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          }
        }
      }
    }

    // Save payment to database
    await query(
      `INSERT INTO asaas_payments (
        registration_id, asaas_payment_id, asaas_customer_id, value, net_value,
        billing_type, status, due_date, payment_link, invoice_url, bank_slip_url,
        external_reference, pix_qr_code_id, pix_qr_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        registrationId,
        asaasPayment.id,
        customerId,
        asaasPayment.value,
        asaasPayment.netValue || null,
        asaasPayment.billingType,
        asaasPayment.status,
        asaasPayment.dueDate,
        asaasPayment.paymentLink || null,
        asaasPayment.invoiceUrl || null,
        asaasPayment.bankSlipUrl || null,
        asaasPayment.externalReference || null,
        pixQrCodeId,
        pixQrCode,
      ]
    );

    // Update registration with asaas_payment_id
    await query(
      'UPDATE registrations SET asaas_payment_id = $1 WHERE id = $2',
      [asaasPayment.id, registrationId]
    );

    return {
      asaas_payment_id: asaasPayment.id,
      payment_link: asaasPayment.paymentLink,
      pix_qr_code: pixQrCode,
      pix_qr_code_id: pixQrCodeId,
      status: asaasPayment.status,
      value: asaasPayment.value,
      net_value: asaasPayment.netValue,
      due_date: asaasPayment.dueDate,
    };
  } catch (error: any) {
    console.error('❌ Erro ao criar pagamento no Asaas:', error);
    
    if (error.response?.data) {
      const errorData = error.response.data;
      if (errorData.errors) {
        const errorMessages = errorData.errors.map((e: any) => e.description).join(', ');
        throw new Error(`Erro ao criar pagamento no Asaas: ${errorMessages}`);
      }
    }

    throw new Error(`Erro ao criar pagamento no Asaas: ${error.message}`);
  }
};

/**
 * Create payment for transfer fee (doesn't update registrations table)
 */
export const createTransferPayment = async (
  transferRequestId: string,
  customerId: string,
  paymentData: {
    value: number;
    dueDate: string; // YYYY-MM-DD
    description: string;
    billingType: AsaasBillingType;
    externalReference?: string;
  }
): Promise<CreatePaymentResult> => {
  const asaasClient = createAsaasClient();

  try {
    // Prepare payment request
    const paymentRequest: AsaasPaymentRequest = {
      customer: customerId,
      billingType: paymentData.billingType,
      value: paymentData.value,
      dueDate: paymentData.dueDate,
      description: paymentData.description,
      externalReference: paymentData.externalReference || `TRANSFER-${transferRequestId}`,
      installmentCount: 1,
      installmentValue: paymentData.value,
    };

    console.log('💳 Criando pagamento de transferência no Asaas...', { 
      transferRequestId, 
      customerId, 
      value: paymentData.value,
      billingType: paymentData.billingType,
      dueDate: paymentData.dueDate
    });

    // Create payment in Asaas
    const response = await asaasClient.post<AsaasPaymentResponse>('/payments', paymentRequest);
    const asaasPayment = response.data;

    console.log(`✅ Pagamento de transferência criado no Asaas:`, {
      id: asaasPayment.id,
      status: asaasPayment.status,
      value: asaasPayment.value,
    });

    // If PIX, wait and fetch QR Code
    let pixQrCode: string | null = null;
    let pixQrCodeId: string | null = null;

    if (paymentData.billingType === 'PIX') {
      console.log('🔍 Buscando QR Code PIX para transferência...');
      
      if (asaasPayment.pixQrCode) {
        pixQrCode = asaasPayment.pixQrCode;
        pixQrCodeId = asaasPayment.pixQrCodeId || null;
        console.log('✅ QR Code PIX já disponível na resposta inicial');
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000));

        const invoiceNumber = (asaasPayment as any).invoiceNumber;
        const paymentIdToUse = invoiceNumber || asaasPayment.id;
        
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            const paymentResponse = await asaasClient.get<AsaasPaymentResponse>(
              `/payments/${paymentIdToUse}`
            );
            const payment = paymentResponse.data;

            try {
              const qrCodeResponse = await asaasClient.get(
                `/payments/${paymentIdToUse}/pixQrCode`
              );
              
              if (qrCodeResponse.data?.payload) {
                pixQrCode = qrCodeResponse.data.payload;
                pixQrCodeId = qrCodeResponse.data.id || payment.pixQrCodeId || null;
                console.log(`✅ QR Code PIX obtido para transferência`);
                break;
              }
            } catch (qrError: any) {
              const pixTransaction = (payment as any).pixTransaction;
              const qrCode = payment.pixQrCode || 
                            (pixTransaction?.payload) || 
                            (pixTransaction?.qrCode);
              
              if (qrCode) {
                pixQrCode = qrCode;
                pixQrCodeId = payment.pixQrCodeId || pixTransaction?.id || null;
                console.log(`✅ QR Code PIX obtido para transferência`);
                break;
              }
            }

            if (attempt < 5) {
              const waitTime = attempt * 2000;
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          } catch (error: any) {
            console.error(`❌ Erro ao buscar QR Code (tentativa ${attempt}/5):`, error.message);
            if (attempt < 5) {
              const waitTime = attempt * 2000;
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          }
        }
      }
    }

    // Save payment to database (without updating registrations table)
    await query(
      `INSERT INTO asaas_payments (
        registration_id, asaas_payment_id, asaas_customer_id, value, net_value,
        billing_type, status, due_date, payment_link, invoice_url, bank_slip_url,
        external_reference, pix_qr_code_id, pix_qr_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        null, // No registration_id for transfer payments
        asaasPayment.id,
        customerId,
        asaasPayment.value,
        asaasPayment.netValue || null,
        asaasPayment.billingType,
        asaasPayment.status,
        asaasPayment.dueDate,
        asaasPayment.paymentLink || null,
        asaasPayment.invoiceUrl || null,
        asaasPayment.bankSlipUrl || null,
        asaasPayment.externalReference || null,
        pixQrCodeId,
        pixQrCode,
      ]
    );

    console.log(`✅ Pagamento de transferência salvo no banco de dados`);

    return {
      asaas_payment_id: asaasPayment.id,
      payment_link: asaasPayment.paymentLink,
      pix_qr_code: pixQrCode,
      pix_qr_code_id: pixQrCodeId,
      status: asaasPayment.status,
      value: asaasPayment.value,
      net_value: asaasPayment.netValue,
      due_date: asaasPayment.dueDate,
    };
  } catch (error: any) {
    console.error('❌ Erro ao criar pagamento de transferência no Asaas:', error);
    
    if (error.response?.data) {
      const errorData = error.response.data;
      if (errorData.errors) {
        const errorMessages = errorData.errors.map((e: any) => e.description).join(', ');
        throw new Error(`Erro ao criar pagamento de transferência no Asaas: ${errorMessages}`);
      }
    }

    throw new Error(`Erro ao criar pagamento de transferência no Asaas: ${error.message}`);
  }
};

// Get payment status from Asaas
export const getPaymentStatus = async (
  asaasPaymentId: string
): Promise<PaymentStatusResult> => {
  const asaasClient = createAsaasClient();

  try {
    console.log(`🔍 Consultando status do pagamento: ${asaasPaymentId}`);

    const response = await asaasClient.get<AsaasPaymentResponse>(`/payments/${asaasPaymentId}`);
    const payment = response.data;

    // Update payment in database
    await query(
      `UPDATE asaas_payments 
       SET status = $1, payment_date = $2, pix_transaction_id = $3, updated_at = NOW()
       WHERE asaas_payment_id = $4`,
      [
        payment.status,
        payment.paymentDate ? new Date(payment.paymentDate) : null,
        payment.pixTransactionId || null,
        asaasPaymentId,
      ]
    );

    // If QR Code is now available, update it
    if (payment.billingType === 'PIX' && payment.pixQrCode) {
      const existingPayment = await query(
        'SELECT pix_qr_code FROM asaas_payments WHERE asaas_payment_id = $1',
        [asaasPaymentId]
      );
      
      if (!existingPayment.rows[0]?.pix_qr_code) {
        await query(
          'UPDATE asaas_payments SET pix_qr_code = $1, pix_qr_code_id = $2 WHERE asaas_payment_id = $3',
          [payment.pixQrCode, payment.pixQrCodeId || null, asaasPaymentId]
        );
        console.log('✅ QR Code PIX atualizado no banco de dados');
      }
    }

    return {
      status: payment.status,
      payment_date: payment.paymentDate || null,
      pix_transaction_id: payment.pixTransactionId || null,
    };
  } catch (error: any) {
    console.error('❌ Erro ao consultar status do pagamento:', error);
    throw new Error(`Erro ao consultar status do pagamento: ${error.message}`);
  }
};

// Get payment by registration ID
export const getPaymentByRegistrationId = async (
  registrationId: string
): Promise<any | null> => {
  const result = await query(
    'SELECT * FROM asaas_payments WHERE registration_id = $1 ORDER BY created_at DESC LIMIT 1',
    [registrationId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

