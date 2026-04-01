const API_BASE = '/api';

let isRefreshing = false;
let failedQueue = [];

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

function getRequestMethod(init) {
  return (init?.method || 'GET').toUpperCase();
}

function processQueue(error, token = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const response = await originalFetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    throw new Error('Refresh token expired');
  }

  const data = await response.json();
  localStorage.setItem('accessToken', data.accessToken);
  if (data.refreshToken) {
    localStorage.setItem('refreshToken', data.refreshToken);
  }
  return data.accessToken;
}

function forceRedirectToLogin() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

const originalFetch = window.fetch.bind(window);

async function interceptedFetch(input, init) {
  const response = await originalFetch(input, init);

  const url = typeof input === 'string' ? input : input.url;
  const isApiCall = url.startsWith(API_BASE + '/');
  const isAuthEndpoint = url.startsWith(API_BASE + '/auth/login') ||
                         url.startsWith(API_BASE + '/auth/register') ||
                         url.startsWith(API_BASE + '/auth/refresh');

  if (response.status !== 401 || !isApiCall || isAuthEndpoint) {
    return response;
  }

  const hasRefreshToken = !!localStorage.getItem('refreshToken');
  if (!hasRefreshToken) {
    return response;
  }

  const method = getRequestMethod(init);
  const isSafeMethod = SAFE_METHODS.includes(method);

  if (isRefreshing) {
    if (!isSafeMethod) {
      return response;
    }
    return new Promise((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    }).then((newToken) => {
      const newHeaders = { ...(init?.headers || {}), 'Authorization': `Bearer ${newToken}` };
      return originalFetch(input, { ...init, headers: newHeaders });
    }).catch(() => {
      return response;
    });
  }

  isRefreshing = true;

  try {
    const newToken = await refreshAccessToken();
    processQueue(null, newToken);

    const newHeaders = { ...(init?.headers || {}), 'Authorization': `Bearer ${newToken}` };
    return originalFetch(input, { ...init, headers: newHeaders });
  } catch (error) {
    processQueue(error, null);
    forceRedirectToLogin();
    return response;
  } finally {
    isRefreshing = false;
  }
}

export function installTokenInterceptor() {
  window.fetch = interceptedFetch;
}
