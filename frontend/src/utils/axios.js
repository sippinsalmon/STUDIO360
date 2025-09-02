import axios from 'axios';

import { CONFIG } from 'src/config-global';

// ----------------------------------------------------------------------

const axiosInstance = axios.create({ baseURL: CONFIG.site.serverUrl });

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    // Ensure we always return a string error message
    let errorMessage = 'Something went wrong!';
    let extra = '';
    
    if (error.response && error.response.data) {
      if (typeof error.response.data === 'string') {
        errorMessage = error.response.data;
      } else if (error.response.data.message) {
        errorMessage = String(error.response.data.message);
      } else if (error.response.data.error) {
        errorMessage = String(error.response.data.error);
      }
      // If backend provided stderr/stdout, append a short diagnostic tail
      try {
        const stderr = error.response.data.stderr;
        const stdout = error.response.data.stdout;
        const clip = (s) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, 400) : '');
        const parts = [];
        if (stderr) parts.push(`stderr: ${clip(stderr)}`);
        if (stdout) parts.push(`stdout: ${clip(stdout)}`);
        extra = parts.length ? `\n${parts.join('\n')}` : '';
      } catch (_) {
        // ignore
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return Promise.reject(new Error(`${errorMessage}${extra}`));
  }
);

export default axiosInstance;

// ----------------------------------------------------------------------

export const fetcher = async (args) => {
  try {
    const [url, config] = Array.isArray(args) ? args : [args];

    const res = await axiosInstance.get(url, { ...config });

    return res.data;
  } catch (error) {
    console.error('Failed to fetch:', error);
    throw error;
  }
};

// ----------------------------------------------------------------------

export const endpoints = {
  chat: '/api/chat',
  aiAssistantMessage: '/api/assistant/message',
  aiAssistantHealth: '/api/assistant/health',
  kanban: '/api/kanban',
  calendar: '/api/calendar',
  auth: {
    me: '/api/auth/me',
    signIn: '/api/auth/sign-in',
    signUp: '/api/auth/sign-up',
  },
  mail: {
    list: '/api/mail/list',
    details: '/api/mail/details',
    labels: '/api/mail/labels',
  },
  post: {
    list: '/api/post/list',
    details: '/api/post/details',
    latest: '/api/post/latest',
    search: '/api/post/search',
  },
  product: {
    list: '/api/product/list',
    details: '/api/product/details',
    search: '/api/product/search',
  },
};
