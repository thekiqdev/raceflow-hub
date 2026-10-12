import axios, { type AxiosInstance } from 'axios';
import { query } from '../config/database.js';
import { createCustomer, getCustomerByUserId } from './asaasService.js';

export interface GatewayPayment {
  id:string; customer:string; externalReference:string; value:number; billingType:string;
  status:string; deleted?:boolean; invoiceUrl?:string; pixQrCode?:string|null;
  refunds?:Array<{status:string; value:number; description?:string}>;
}
export interface GatewayCreditCard {
  holderName:string; number:string; expiryMonth:string; expiryYear:string; ccv:string;
}
export interface GatewayCreditCardHolder {
  name:string; email:string; cpfCnpj:string; postalCode:string; addressNumber:string;
  addressComplement?:string; phone:string; mobilePhone?:string;
}
export interface GatewayCardToken {
  creditCardToken:string; creditCardBrand?:string|null; creditCardNumber?:string|null;
}
export interface CheckoutPaymentGateway {
  customer(buyerId:string):Promise<string>;
  tokenize(input:{customer:string; creditCard:GatewayCreditCard; creditCardHolderInfo:GatewayCreditCardHolder;
    remoteIp:string}):Promise<GatewayCardToken>;
  create(input:{customer:string; value:number; billingType:string; externalReference:string; dueDate:string; description?:string;
    creditCardToken?:string; creditCard?:GatewayCreditCard; creditCardHolderInfo?:GatewayCreditCardHolder;
    remoteIp?:string}):Promise<GatewayPayment>;
  find(reference:string):Promise<GatewayPayment[]>;
  get(id:string):Promise<GatewayPayment>;
  pixQr(id:string):Promise<string|null>;
  remove(id:string):Promise<void>;
  refund(id:string,value:number,description:string):Promise<void>;
}
function client() {
  const apiKey=process.env.ASAAS_API_KEY;
  if(!apiKey) throw new Error('Gateway indisponível.');
  return axios.create({baseURL:process.env.ASAAS_API_URL || (process.env.ASAAS_ENVIRONMENT==='production'
    ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3'),timeout:30000,
    headers:{access_token:apiKey,'Content-Type':'application/json'}});
}
async function sleep(ms:number) { await new Promise(resolve=>setTimeout(resolve,ms)); }
/** Busca o payload copia-e-cola do PIX; o Asaas pode demorar alguns segundos após criar a cobrança. */
async function fetchPixQr(http:AxiosInstance,id:string):Promise<string|null> {
  for(let attempt=0;attempt<4;attempt++) {
    if(attempt>0) await sleep(attempt*1000);
    try {
      const response=await http.get(`/payments/${encodeURIComponent(id)}/pixQrCode`);
      if(typeof response.data?.payload==='string' && response.data.payload.trim()) return response.data.payload;
    } catch {
      // QR ainda indisponível ou falha transitória; tenta de novo.
    }
  }
  return null;
}
// Sem interceptores que possam registrar dados pessoais ou credenciais em falhas de rede.
export const checkoutPaymentGateway:CheckoutPaymentGateway={
  async customer(buyerId) {
    const existing=await getCustomerByUserId(buyerId);
    if(existing) return existing;
    const buyer=(await query('SELECT p.full_name,p.cpf,u.email FROM users u JOIN profiles p ON p.id=u.id WHERE u.id=$1',[buyerId])).rows[0];
    if(!buyer?.full_name || !buyer.cpf || !buyer.email) throw new Error('Complete os dados do comprador antes de pagar.');
    return (await createCustomer(buyerId,{name:buyer.full_name,email:buyer.email,cpfCnpj:buyer.cpf.replace(/\D/g,''),notificationDisabled:true})).asaas_customer_id;
  },
  async tokenize(input) {
    const response=await client().post('/creditCard/tokenizeCreditCard',{
      customer:input.customer,
      creditCard:input.creditCard,
      creditCardHolderInfo:input.creditCardHolderInfo,
      remoteIp:input.remoteIp,
    });
    const token=response.data?.creditCardToken;
    if(typeof token!=='string' || !token.trim()) throw new Error('Tokenização do cartão não retornou identificador.');
    return {
      creditCardToken:token,
      creditCardBrand:typeof response.data?.creditCardBrand==='string'?response.data.creditCardBrand:null,
      creditCardNumber:typeof response.data?.creditCardNumber==='string'?response.data.creditCardNumber:null,
    };
  },
  async create(input) {
    const http=client();
    const body:Record<string,unknown>={
      customer:input.customer,billingType:input.billingType,value:input.value,dueDate:input.dueDate,
      externalReference:input.externalReference,description:input.description || 'Inscrições Cronoteam',
      interest:{value:0},fine:{value:0},
    };
    if(input.remoteIp) body.remoteIp=input.remoteIp;
    if(input.billingType==='CREDIT_CARD') {
      body.installmentCount=1;
      body.installmentValue=input.value;
      if(input.creditCardToken) {
        // Token: nunca reenviar PAN/CVV na cobrança.
        body.creditCardToken=input.creditCardToken;
      } else if(input.creditCard && input.creditCardHolderInfo) {
        body.creditCard=input.creditCard;
        body.creditCardHolderInfo=input.creditCardHolderInfo;
      }
    }
    const payment=(await http.post('/payments',body)).data as GatewayPayment;
    if(input.billingType==='PIX') payment.pixQrCode=await fetchPixQr(http,payment.id);
    return payment;
  },
  async find(reference) {
    const result=(await client().get('/payments',{params:{externalReference:reference,limit:100}})).data;
    if(result.hasMore || !Array.isArray(result.data)) throw new Error('Conciliação incompleta.');
    return result.data;
  },
  async get(id) { return (await client().get(`/payments/${encodeURIComponent(id)}`)).data; },
  async pixQr(id) { return fetchPixQr(client(),id); },
  async remove(id) {
    const result=(await client().delete(`/payments/${encodeURIComponent(id)}`)).data;
    if(result.deleted!==true) throw new Error('Cancelamento não confirmado.');
  },
  async refund(id,value,description) { await client().post(`/payments/${encodeURIComponent(id)}/refund`,{value,description}); },
};
