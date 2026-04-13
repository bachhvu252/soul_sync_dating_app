/**
 * frontend/js/api.js
 *
 * Shared API client for all SoulSync frontend pages.
 * Wraps fetch() with:
 *  - Base URL pointing at the Node.js backend
 *  - Automatic Authorization header injection from localStorage
 *  - Consistent error parsing
 *  - Auth redirect on 401
 */

const API_BASE = 'http://localhost:3001';

// ── Token helpers ────────────────────────────────────────────────────────────

const Auth = {
  getToken() {
    return localStorage.getItem('ss_access_token');
  },
  setToken(token) {
    localStorage.setItem('ss_access_token', token);
  },
  getUser() {
    const raw = localStorage.getItem('ss_user');
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  setUser(user) {
    localStorage.setItem('ss_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('ss_access_token');
    localStorage.removeItem('ss_user');
  },
  logout() {
    this.clear();
    window.location.href = '/login.html';
  },
  isLoggedIn() {
    return !!this.getToken();
  },
  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  },
};

// ── Core fetch wrapper ───────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include', // send httpOnly refresh token cookie
    headers,
  });

  // 401 → token expired → try to refresh, then retry
  if (res.status === 401 && path !== '/api/auth/refresh') {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry original request with new token
      return apiFetch(path, options);
    }
    Auth.clear();
    window.location.href = '/login.html';
    return null;
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function tryRefreshToken() {
  try {
    const data = await apiFetch('/api/auth/refresh', { method: 'POST' });
    if (data?.data?.accessToken) {
      Auth.setToken(data.data.accessToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── Auth API ─────────────────────────────────────────────────────────────────

const api = {
  getImageUrl(url) {
    if (!url) return '';
    return url.startsWith('/') ? API_BASE + url : url;
  },

  auth: {
    async login(email, password) {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      Auth.setToken(data.data.accessToken);
      Auth.setUser(data.data.user);
      return data.data;
    },

    async register(payload) {
      const data = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      Auth.setToken(data.data.accessToken);
      Auth.setUser(data.data.user);
      return data.data;
    },

    async logout() {
      try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
      } finally {
        Auth.clear();
      }
    },
  },

  profile: {
    async get(userId) {
      const data = await apiFetch(`/api/profile/${userId}`);
      return data.data;
    },

    async getOwn() {
      const user = Auth.getUser();
      if (!user) throw new Error('Not logged in');
      return this.get(user.id);
    },

    async update(payload) {
      const data = await apiFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      return data.data;
    },

    async upload(file) {
      const token = Auth.getToken();
      if (!token) throw new Error('Not logged in');

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('http://localhost:3001/api/profile/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data.data;
    },

    async deletePhoto(photoId) {
      const data = await apiFetch(`/api/profile/photos/${photoId}`, {
        method: 'DELETE',
      });
      return data.data;
    },

    async updatePreferences(payload) {
      const data = await apiFetch('/api/profile/preferences', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return data.data;
    },
  },
};

// ── UI helpers ───────────────────────────────────────────────────────────────

/**
 * Show a toast notification at the bottom of the screen.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
function showToast(message, type = 'success') {
  const existing = document.getElementById('ss-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'ss-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
    background: ${type === 'error' ? '#EF4444' : type === 'info' ? '#6366F1' : '#10B981'};
    color: white; padding: 14px 28px; border-radius: 30px;
    font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 14px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.15); z-index: 9999;
    animation: slideUp 0.3s ease;
  `;

  const style = document.createElement('style');
  style.textContent = `@keyframes slideUp { from { opacity:0; transform:translateX(-50%) translateY(20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;
  document.head.appendChild(style);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

/**
 * Fill navbar user info from localStorage.
 */
function populateNavbar() {
  const user = Auth.getUser();
  const profile = window._cachedProfile;

  const nameEl = document.querySelector('.user-name');
  const tierEl = document.querySelector('.user-tier');
  const avatarEl = document.querySelector('.user-avatar');

  if (nameEl && user) {
    nameEl.textContent = profile?.first_name
      ? `${profile.first_name} ${profile.last_name || ''}`.trim()
      : user.email.split('@')[0];
  }
  if (tierEl && user) {
    tierEl.textContent = `${user.membership_tier || 'free'} Member`;
  }
  if (avatarEl && profile?.photos?.[0]?.url) {
    avatarEl.src = api.getImageUrl(profile.photos[0].url);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (Auth.isLoggedIn()) {
    populateNavbar();
  }
});
