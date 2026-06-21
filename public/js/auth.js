/**
 * Nova Exchange - Auth & UI Utilities
 * 依赖 js/config.js (NOVA_CONFIG)
 */

;(function () {
  'use strict';

  /* ---- Toast System ---- */
  function showToast(message, type) {
    type = type || 'error';
    var container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    var el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.textContent = message;
    container.appendChild(el);

    setTimeout(function () {
      el.style.animation = 'toast-out 0.25s ease forwards';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }, 4000);

    el.addEventListener('click', function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  }
  window.showToast = showToast;

  /* ---- Token Management ---- */
  function getToken() { return localStorage.getItem('nova_token'); }
  function setToken(t) { if (t) localStorage.setItem('nova_token', t); else localStorage.removeItem('nova_token'); }
  function getUser() {
    try { return JSON.parse(localStorage.getItem('nova_user')); } catch(e) { return null; }
  }
  function setUser(u) {
    if (u) localStorage.setItem('nova_user', JSON.stringify(u));
    else localStorage.removeItem('nova_user');
  }
  function clearSession() {
    localStorage.removeItem('nova_token');
    localStorage.removeItem('nova_user');
  }
  function isLoggedIn() { return !!getToken(); }

  window.NovaAuth = {
    getToken: getToken,
    setToken: setToken,
    getUser: getUser,
    setUser: setUser,
    clearSession: clearSession,
    isLoggedIn: isLoggedIn
  };

  /* ---- Navbar Management ---- */
  function showNavbar(user) {
    var navbar = document.getElementById('navbar');
    var username = document.getElementById('navbar-username');
    if (navbar) navbar.style.display = '';
    if (username && user) username.textContent = user.name || user.email || '';
  }

  function hideNavbar() {
    var navbar = document.getElementById('navbar');
    if (navbar) navbar.style.display = 'none';
  }

  /* ---- API Helper ---- */
  window.apiFetch = function (path, options) {
    options = options || {};
    var url = NOVA_CONFIG.apiUrl(path);
    var headers = options.headers || {};
    headers['Content-Type'] = 'application/json';

    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    return fetch(url, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || data.message || 'Request failed (' + res.status + ')');
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      }).catch(function (parseErr) {
        if (parseErr.status) throw parseErr;
        var err = new Error('Unexpected response (' + res.status + ')');
        err.status = res.status;
        throw err;
      });
    });
  };

  /* ---- Auth Actions ---- */
  window.handleLogin = function (formEl) {
    if (!formEl) return;

    var submitBtn = formEl.querySelector('button[type=\"submit\"]');
    if (!submitBtn) submitBtn = formEl.querySelector('.btn-primary');
    if (submitBtn) submitBtn.disabled = true;

    var phone = (formEl.querySelector('[name=\"phone\"]') || formEl.querySelector('[name=\"account\"]') || {}).value || '';
    var password = (formEl.querySelector('[name=\"password\"]') || {}).value || '';

    apiFetch('/api/login', {
      method: 'POST',
      body: { phone: phone.trim(), password: password }
    }).then(function (data) {
      if (data.success && data.token) {
        setToken(data.token);
        setUser(data.user);
        showToast('Login successful!', 'success');
        window.location.hash = '#dashboard';
        renderDashboard(data.user);
      } else {
        showToast(data.error || 'Login failed. Please check your credentials.', 'error');
      }
    }).catch(function (err) {
      showToast(err.message || 'Network error. Please check your connection and try again.', 'error');
    }).finally(function () {
      if (submitBtn) submitBtn.disabled = false;
    });
  };

  window.handleRegister = function (formEl) {
    if (!formEl) return;

    var submitBtn = formEl.querySelector('button[type=\"submit\"]') || formEl.querySelector('.btn-primary');
    if (submitBtn) submitBtn.disabled = true;

    var name = (formEl.querySelector('[name=\"name\"]') || {}).value || '';
    var phone = (formEl.querySelector('[name=\"phone\"]') || {}).value || '';
    var password = (formEl.querySelector('[name=\"password\"]') || {}).value || '';
    var referralCode = (formEl.querySelector('[name=\"referral_code\"]') || {}).value || '';
    var email = (formEl.querySelector('[name=\"email\"]') || {}).value || '';

    if (!name.trim()) { showToast('Please enter your name', 'warning'); if (submitBtn) submitBtn.disabled = false; return; }
    if (!phone.trim()) { showToast('Please enter your phone number', 'warning'); if (submitBtn) submitBtn.disabled = false; return; }
    if (!password || password.length < 6) { showToast('Password must be at least 6 characters', 'warning'); if (submitBtn) submitBtn.disabled = false; return; }

    var body = { name: name.trim(), phone: phone.trim(), password: password };
    if (email.trim()) body.email = email.trim();
    if (referralCode.trim()) body.referral_code = referralCode.trim().toUpperCase();

    apiFetch('/api/register', {
      method: 'POST',
      body: body
    }).then(function (data) {
      if (data.success && data.token) {
        setToken(data.token);
        setUser(data.user);
        showToast('Registration successful!', 'success');
        window.location.hash = '#dashboard';
        renderDashboard(data.user);
      } else if (data.success && data.message) {
        showToast(data.message || 'Registration submitted. Please check your email.', 'success');
      } else {
        showToast(data.error || 'Registration failed. Please try again.', 'error');
      }
    }).catch(function (err) {
      showToast(err.message || 'Network error. Please try again.', 'error');
    }).finally(function () {
      if (submitBtn) submitBtn.disabled = false;
    });
  };

  window.handleLogout = function () {
    clearSession();
    hideNavbar();
    window.location.hash = '';
    renderAuthView();
  };

  /* ---- View Router ---- */
  window.renderDashboard = function (user) {
    var app = document.getElementById('app');
    if (!app) return;

    user = user || getUser();
    if (!user) {
      window.location.hash = '';
      return;
    }

    showNavbar(user);

    app.innerHTML = ''
      + '<div class=\"dashboard-page\">'
      + '  <h2 style=\"color:var(--primary);margin-bottom:8px\">Welcome, ' + escapeHtml(user.name || 'User') + '</h2>'
      + '  <p style=\"color:var(--text-muted);margin-bottom:24px\">'
      +     (user.email ? 'Email: ' + escapeHtml(user.email) + '<br>' : '')
      +     (user.phone_masked ? 'Phone: ' + escapeHtml(user.phone_masked) : (user.phone ? 'Phone: ' + escapeHtml(user.phone) : ''))
      +     (user.referral_code ? '<br>Referral Code: <strong>' + escapeHtml(user.referral_code) + '</strong>' : '')
      + '  </p>'
      + '  <div id=\"dashboard-content\">'
      + '    <p style=\"color:var(--text-muted)\">Loading dashboard...</p>'
      + '  </div>'
      + '</div>';

    loadDashboardData();
  };

  function loadDashboardData() {
    var container = document.getElementById('dashboard-content');
    if (!container) return;

    apiFetch('/api/me/dashboard').then(function (data) {
      if (data.success) {
        var bal = data.balance || {};
        container.innerHTML = ''
          + '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:24px\">'
          + '  <div style=\"background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:18px;text-align:center\">'
          + '    <div style=\"font-size:12px;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px\">Balance</div>'
          + '    <div style=\"font-size:24px;font-weight:700;color:var(--primary)\">' + formatCurrency(bal.available_balance || 0) + '</div>'
          + '  </div>'
          + '  <div style=\"background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:18px;text-align:center\">'
          + '    <div style=\"font-size:12px;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px\">Total Earned</div>'
          + '    <div style=\"font-size:24px;font-weight:700;color:var(--success)\">' + formatCurrency(bal.total_earned || 0) + '</div>'
          + '  </div>'
          + '  <div style=\"background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:18px;text-align:center\">'
          + '    <div style=\"font-size:12px;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px\">Downlines</div>'
          + '    <div style=\"font-size:24px;font-weight:700;color:var(--accent)\">' + (data.downline_count || 0) + '</div>'
          + '  </div>'
          + '</div>';
      } else {
        container.innerHTML = '<p style=\"color:var(--text-muted)\">Could not load dashboard data.</p>';
      }
    }).catch(function () {
      container.innerHTML = '<p style=\"color:var(--text-muted)\">Could not load dashboard data.</p>';
    });
  }

  /* ---- Auth View ---- */
  window.renderAuthView = function () {
    var app = document.getElementById('app');
    if (!app) return;

    hideNavbar();

    app.innerHTML = ''
      + '<div class=\"auth-page\">'
      + '  <div class=\"auth-card\">'
      + '    <h1>' + escapeHtml(NOVA_CONFIG.APP_NAME) + '</h1>'
      + '    <p class=\"subtitle\">' + escapeHtml(NOVA_CONFIG.APP_DESCRIPTION) + '</p>'
      + '    <div id=\"auth-tabs\" style=\"display:flex;gap:0;margin-bottom:20px;border-bottom:2px solid var(--border)\">'
      + '      <button class=\"auth-tab active\" data-tab=\"login\" style=\"flex:1;padding:10px;border:none;background:none;font-size:15px;font-weight:600;color:var(--primary);border-bottom:2px solid var(--primary);cursor:pointer\">Sign In</button>'
      + '      <button class=\"auth-tab\" data-tab=\"register\" style=\"flex:1;padding:10px;border:none;background:none;font-size:15px;font-weight:500;color:var(--text-muted);border-bottom:2px solid transparent;cursor:pointer\">Register</button>'
      + '    </div>'
      + '    <div id=\"auth-form-container\">'
      + renderLoginForm()
      + '    </div>'
      + '  </div>'
      + '</div>';

    // Tab switching
    var tabs = app.querySelectorAll('.auth-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) {
          t.style.color = 'var(--text-muted)';
          t.style.borderBottomColor = 'transparent';
          t.style.fontWeight = '500';
        });
        this.style.color = 'var(--primary)';
        this.style.borderBottomColor = 'var(--primary)';
        this.style.fontWeight = '600';

        var container = document.getElementById('auth-form-container');
        if (this.dataset.tab === 'register') {
          container.innerHTML = renderRegisterForm();
          bindRegisterForm();
        } else {
          container.innerHTML = renderLoginForm();
          bindLoginForm();
        }
      });
    });

    bindLoginForm();
  };

  function renderLoginForm() {
    return '<form id=\"login-form\">'
      + '  <div class=\"form-group\">'
      + '    <label for=\"login-phone\">Phone Number</label>'
      + '    <input type=\"text\" id=\"login-phone\" name=\"phone\" placeholder=\"e.g. 08012345678\" autocomplete=\"tel\" required>'
      + '  </div>'
      + '  <div class=\"form-group\">'
      + '    <label for=\"login-password\">Password</label>'
      + '    <input type=\"password\" id=\"login-password\" name=\"password\" placeholder=\"Enter your password\" autocomplete=\"current-password\" required>'
      + '  </div>'
      + '  <button type=\"submit\" class=\"btn btn-primary\">Sign In</button>'
      + '  <div id=\"loginError\" style=\"display:none;margin-top:12px;padding:10px 14px;background:var(--error-bg);color:var(--error);border-radius:var(--radius-sm);font-size:14px\"></div>'
      + '  <div id=\"loginSuccess\" style=\"display:none;margin-top:12px;padding:10px 14px;background:var(--success-bg);color:var(--success);border-radius:var(--radius-sm);font-size:14px\"></div>'
      + '</form>';
  }

  function renderRegisterForm() {
    return '<form id=\"register-form\">'
      + '  <div class=\"form-group\">'
      + '    <label for=\"reg-name\">Full Name</label>'
      + '    <input type=\"text\" id=\"reg-name\" name=\"name\" placeholder=\"Your full name\" required>'
      + '  </div>'
      + '  <div class=\"form-group\">'
      + '    <label for=\"reg-phone\">Phone Number</label>'
      + '    <input type=\"text\" id=\"reg-phone\" name=\"phone\" placeholder=\"e.g. 08012345678\" required>'
      + '  </div>'
      + '  <div class=\"form-group\">'
      + '    <label for=\"reg-email\">Email (optional)</label>'
      + '    <input type=\"email\" id=\"reg-email\" name=\"email\" placeholder=\"your@email.com\">'
      + '  </div>'
      + '  <div class=\"form-group\">'
      + '    <label for=\"reg-password\">Password</label>'
      + '    <input type=\"password\" id=\"reg-password\" name=\"password\" placeholder=\"At least 6 characters\" minlength=\"6\" required>'
      + '  </div>'
      + '  <div class=\"form-group\">'
      + '    <label for=\"reg-referral\">Referral Code (optional)</label>'
      + '    <input type=\"text\" id=\"reg-referral\" name=\"referral_code\" placeholder=\"Enter referral code\">'
      + '  </div>'
      + '  <button type=\"submit\" class=\"btn btn-primary\">Create Account</button>'
      + '  <div id=\"regError\" style=\"display:none;margin-top:12px;padding:10px 14px;background:var(--error-bg);color:var(--error);border-radius:var(--radius-sm);font-size:14px\"></div>'
      + '  <div id=\"regSuccess\" style=\"display:none;margin-top:12px;padding:10px 14px;background:var(--success-bg);color:var(--success);border-radius:var(--radius-sm);font-size:14px\"></div>'
      + '</form>';
  }

  function bindLoginForm() {
    var form = document.getElementById('login-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errorEl = document.getElementById('loginError');
      var successEl = document.getElementById('loginSuccess');
      if (errorEl) errorEl.style.display = 'none';
      if (successEl) successEl.style.display = 'none';
      handleLogin(form);
    });
  }

  function bindRegisterForm() {
    var form = document.getElementById('register-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errorEl = document.getElementById('regError');
      var successEl = document.getElementById('regSuccess');
      if (errorEl) errorEl.style.display = 'none';
      if (successEl) successEl.style.display = 'none';
      handleRegister(form);
    });
  }

  /* ---- Utilities ---- */
  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    return str.replace(/&/g, '&amp;').replace(/\"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatCurrency(amount) {
    if (typeof amount !== 'number') amount = parseFloat(amount) || 0;
    return '\u20A6' + Number(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  window.escapeHtml = escapeHtml;
  window.formatCurrency = formatCurrency;

  /* ---- Bootstrap ---- */
  document.addEventListener('DOMContentLoaded', function () {
    if (isLoggedIn()) {
      var user = getUser();
      showNavbar(user);
      renderDashboard(user);
    } else {
      hideNavbar();
      renderAuthView();
    }

    window.addEventListener('hashchange', function () {
      if (window.location.hash === '#dashboard' && isLoggedIn()) {
        renderDashboard();
      } else if (!window.location.hash || window.location.hash === '#/') {
        renderAuthView();
      }
    });
  });
})();
