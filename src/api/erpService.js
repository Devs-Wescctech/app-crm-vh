const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export async function buscarClienteERP(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, '');
  
  if (cpfLimpo.length !== 11) {
    throw new Error('CPF inválido');
  }
  
  const response = await fetch(`${API_BASE}/functions/get-customer-from-erp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ cpf: cpfLimpo }),
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    const error = new Error(data.error || 'Erro ao buscar cliente no ERP');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  
  return data;
}

export async function buscarHistoricoIndicacoes(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, '');
  
  const response = await fetch(`${API_BASE}/referrals/filter`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      referrer_cpf: cpfLimpo,
      status: 'convertido'
    }),
  });
  
  if (!response.ok) {
    return [];
  }
  
  return response.json();
}
