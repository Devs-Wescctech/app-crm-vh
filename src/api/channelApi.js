const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function fetchChannelAPI(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'API Error');
  }

  return response.json();
}

export function getTemplatesByToken(channelToken) {
  return fetchChannelAPI('/whatsapp/templates-by-token', {
    headers: {
      'x-channel-token': channelToken,
    },
  });
}
