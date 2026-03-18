import { apiClient } from './client.js';

export interface FormFieldConfiguration {
  id: string;
  form_type: 'quote' | 'contact';
  field_key: string;
  field_label: string;
  field_type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'date' | 'number';
  field_placeholder?: string;
  field_required: boolean;
  field_order: number;
  field_width?: '100%' | '50%' | '33%';
  field_options?: any;
  field_validation?: any;
  field_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicFormFieldConfiguration {
  field_key: string;
  field_label: string;
  field_type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'date' | 'number';
  field_placeholder?: string;
  field_required: boolean;
  field_order: number;
  field_width?: '100%' | '50%' | '33%';
  field_options?: any;
}

export interface CreateFormFieldConfigurationData {
  form_type: 'quote' | 'contact';
  field_key: string;
  field_label: string;
  field_type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'date' | 'number';
  field_placeholder?: string;
  field_required?: boolean;
  field_order?: number;
  field_width?: '100%' | '50%' | '33%';
  field_options?: any;
  field_validation?: any;
  field_enabled?: boolean;
}

export interface UpdateFormFieldConfigurationData {
  field_label?: string;
  field_type?: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'date' | 'number';
  field_placeholder?: string;
  field_required?: boolean;
  field_order?: number;
  field_width?: '100%' | '50%' | '33%';
  field_options?: any;
  field_validation?: any;
  field_enabled?: boolean;
}

export interface BulkUpdateFormConfigurationsData {
  configurations: Array<{
    field_key: string;
    field_label: string;
    field_type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'date' | 'number';
    field_placeholder?: string;
    field_required: boolean;
    field_order: number;
    field_width?: '100%' | '50%' | '33%';
    field_options?: any;
    field_validation?: any;
    field_enabled: boolean;
  }>;
}

// Get public form configurations (for rendering forms) - no auth required
export const getPublicFormConfigurations = async (formType: 'quote' | 'contact') => {
  try {
    // For public endpoints, we need to fetch directly without token
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    const url = `${API_URL}/form-configurations/public/${formType}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`Public form configurations response for ${formType}:`, data);
    return data;
  } catch (error: any) {
    console.error(`Error fetching public form configurations for ${formType}:`, error);
    return {
      success: false,
      error: error?.message || error?.error || 'Erro ao carregar configurações',
      data: [],
    };
  }
};

// Get all form field configurations for a specific form type (admin only)
export const getFormConfigurations = async (formType: 'quote' | 'contact') => {
  try {
    const response = await apiClient.get<FormFieldConfiguration[]>(`/form-configurations/${formType}`);
    console.log(`Form configurations response for ${formType}:`, response);
    return response;
  } catch (error: any) {
    console.error(`Error fetching form configurations for ${formType}:`, error);
    return {
      success: false,
      error: error?.message || error?.error || 'Erro ao carregar configurações',
      data: [],
    };
  }
};

// Get a single form field configuration by ID (admin only)
export const getFormFieldConfigurationById = async (formType: 'quote' | 'contact', id: string) => {
  return apiClient.get<FormFieldConfiguration>(`/form-configurations/${formType}/${id}`);
};

// Create a new form field configuration (admin only)
export const createFormFieldConfiguration = async (data: CreateFormFieldConfigurationData) => {
  return apiClient.post<FormFieldConfiguration>('/form-configurations', data);
};

// Update a form field configuration (admin only)
export const updateFormFieldConfiguration = async (id: string, data: UpdateFormFieldConfigurationData) => {
  return apiClient.put<FormFieldConfiguration>(`/form-configurations/${id}`, data);
};

// Delete a form field configuration (admin only)
export const deleteFormFieldConfiguration = async (id: string) => {
  return apiClient.delete(`/form-configurations/${id}`);
};

// Reorder form field configurations (admin only)
export const reorderFormFields = async (formType: 'quote' | 'contact', fields: Array<{ id: string; order: number }>) => {
  return apiClient.put(`/form-configurations/${formType}/reorder`, { fields });
};

// Bulk update form field configurations (admin only)
export const bulkUpdateFormConfigurations = async (formType: 'quote' | 'contact', data: BulkUpdateFormConfigurationsData) => {
  return apiClient.put<FormFieldConfiguration[]>(`/form-configurations/${formType}/bulk-update`, data);
};
