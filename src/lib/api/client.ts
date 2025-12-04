const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = this.getToken();
    const url = `${this.baseURL}${endpoint}`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      console.log('🌐 Making request:', {
        url,
        method: options.method || 'GET',
        endpoint,
        baseURL: this.baseURL,
        hasToken: !!token,
      });
      
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });
      
      console.log('✅ Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
      });

      // Check if response is ok before parsing JSON
      if (!response.ok && response.status !== 401) {
        // Try to parse error response
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          // If JSON parsing fails, use status text
        }
        return {
          success: false,
          error: errorMessage,
          message: `Request failed with status ${response.status}`,
        };
      }

      const data: ApiResponse<T> = await response.json();

      // If unauthorized, clear token
      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        // Dispatch event for auth context to handle
        window.dispatchEvent(new CustomEvent('auth:logout'));
      }

      return data;
    } catch (error) {
      console.error('❌ API request failed:', {
        error,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        url,
        endpoint,
        baseURL: this.baseURL,
      });
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Provide more helpful error messages
      let userMessage = 'Erro de conexão';
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        userMessage = `Não foi possível conectar ao servidor em ${url}. Verifique se o backend está rodando.`;
      } else if (errorMessage.includes('CORS')) {
        userMessage = 'Erro de CORS. Verifique a configuração do servidor.';
      } else if (errorMessage.includes('Network request failed')) {
        userMessage = 'Falha na rede. Verifique sua conexão com a internet.';
      }
      
      return {
        success: false,
        error: userMessage,
        message: errorMessage,
      };
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  async patch<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }
}

export const apiClient = new ApiClient(API_URL);

