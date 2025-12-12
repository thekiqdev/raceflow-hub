/**
 * ViaCEP API integration
 * Documentation: https://viacep.com.br/
 */

export interface ViaCepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge: string;
  gia: string;
  ddd: string;
  siafi: string;
  erro?: boolean;
}

/**
 * Fetch address by CEP using ViaCEP API
 * @param cep - CEP (with or without mask)
 * @returns Address data or null if not found
 */
export const fetchAddressByCep = async (cep: string): Promise<ViaCepResponse | null> => {
  // Remove mask from CEP
  const cleanCep = cep.replace(/\D/g, '');
  
  if (cleanCep.length !== 8) {
    return null;
  }
  
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    
    if (!response.ok) {
      throw new Error('Erro ao buscar CEP');
    }
    
    const data: ViaCepResponse = await response.json();
    
    // ViaCEP returns { erro: true } when CEP is not found
    if (data.erro) {
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Erro ao buscar CEP:', error);
    return null;
  }
};

