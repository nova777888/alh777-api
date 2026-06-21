/**
 * Nova Exchange - 全局配置文件
 * 
 * 所有 API 端点、外部服务地址等集中于此，避免硬编码。
 * 可通过 localStorage 覆盖默认值（方便调试）：
 *   localStorage.setItem('nova_api_base', 'https://新地址.vercel.app')
 *   localStorage.setItem('nova_supabase_url', 'https://新项目.supabase.co')
 *   localStorage.setItem('nova_supabase_anon_key', '新公钥')
 */
;(function () {
  'use strict';

  var CONFIG = {
    // ---- API 基础地址 ----
    // 默认值与当前 Vercel 部署一致，可通过 localStorage 覆盖
    API_BASE: localStorage.getItem('nova_api_base') || '',

    // ---- Supabase 配置 ----
    SUPABASE_URL: localStorage.getItem('nova_supabase_url') || 'https://ecikviwuxfieryrmfgdq.supabase.co',
    SUPABASE_ANON_KEY: localStorage.getItem('nova_supabase_anon_key') || 'sb_publishable_qZmFog48wGY8aMzEzl3P2Q_bFktF5X3',

    // ---- 应用信息 ----
    APP_NAME: 'Nova Exchange',
    APP_DESCRIPTION: 'Multi-Level Marketing Platform'
  };

  // 工具函数：构建 API 完整 URL
  CONFIG.apiUrl = function (path) {
    var base = CONFIG.API_BASE;
    if (base && !base.endsWith('/')) base += '/';
    return base + path.replace(/^\//, '');
  };

  // 暴露到全局
  window.NOVA_CONFIG = CONFIG;

  // 兼容旧名
  window.API_BASE = CONFIG.API_BASE;
})();
