/**
 * Supabase 配置文件 (Web版) - 内存优化版
 * 与小程序共用同一个 Supabase 数据库
 * 优化点：
 * 1. 数据缓存机制，减少重复请求
 * 2. 分页加载，避免大数据量
 * 3. 请求去重，合并相同请求
 * 4. 自动清理过期缓存
 */

const SUPABASE_URL = 'https://bvgtenrrxdhczlvebjxj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2Z3RlbnJyeGRoY3psdmVianhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMjk5NTEsImV4cCI6MjA5MTkwNTk1MX0.K4HBL1_sGg-79N5CoF_M6V-YlPibSrdoVvd9k515D28';

const TABLES = {
  GOODS: 'goods',
  CATEGORIES: 'categories',
  RECORDS: 'records',
  USERS: 'users',
  SETTINGS: 'settings',
  BARCODES: 'barcodes',
  POSITION_CONFIG: 'position_config'
};

// 缓存配置
const CACHE_CONFIG = {
  maxAge: 5 * 60 * 1000, // 缓存5分钟
  maxSize: 50, // 最大缓存条目数
  cleanupInterval: 10 * 60 * 1000 // 每10分钟清理一次
};

/**
 * 简单的 LRU 缓存实现
 */
class SimpleCache {
  constructor(maxSize = 50, maxAge = 5 * 60 * 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.maxAge = maxAge;
    this.lastCleanup = Date.now();
  }

  get(key) {
    this.cleanup();
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }
    
    // 更新访问顺序（LRU）
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.data;
  }

  set(key, data) {
    if (this.cache.size >= this.maxSize) {
      // 删除最旧的条目
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clear() {
    this.cache.clear();
  }

  cleanup() {
    const now = Date.now();
    if (now - this.lastCleanup < 60000) return; // 每分钟最多清理一次
    
    this.lastCleanup = now;
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > this.maxAge) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Supabase Web 客户端 - 优化版
 */
class SupabaseClient {
  constructor() {
    this.url = SUPABASE_URL;
    this.headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    
    // 初始化缓存
    this.cache = new SimpleCache(CACHE_CONFIG.maxSize, CACHE_CONFIG.maxAge);
    
    // 请求去重
    this.pendingRequests = new Map();
    
    // 定期清理缓存
    setInterval(() => this.cache.cleanup(), CACHE_CONFIG.cleanupInterval);
  }

  /**
   * 生成缓存键
   */
  getCacheKey(method, endpoint, params) {
    return `${method}:${endpoint}:${JSON.stringify(params || {})}`;
  }

  /**
   * 通用请求方法 - 带缓存和去重
   */
  async request(method, endpoint, params = null, body = null, options = {}) {
    const cacheKey = this.getCacheKey(method, endpoint, params);
    
    // GET 请求使用缓存
    if (method === 'GET' && !options.noCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        console.log('[Cache Hit]', cacheKey);
        return cached;
      }
    }
    
    // 请求去重：如果相同的请求正在进行中，等待它完成
    if (this.pendingRequests.has(cacheKey)) {
      console.log('[Request Deduplication]', cacheKey);
      return this.pendingRequests.get(cacheKey);
    }
    
    // 创建请求
    const requestPromise = this.doRequest(method, endpoint, params, body);
    this.pendingRequests.set(cacheKey, requestPromise);
    
    try {
      const result = await requestPromise;
      
      // 缓存 GET 请求结果
      if (method === 'GET' && !options.noCache) {
        this.cache.set(cacheKey, result);
      }
      
      return result;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * 实际执行请求
   */
  async doRequest(method, endpoint, params = null, body = null) {
    // 分离 endpoint 中的查询参数
    let endpointParams = '';
    let baseEndpoint = endpoint;
    if (endpoint.includes('?')) {
      const parts = endpoint.split('?');
      baseEndpoint = parts[0];
      endpointParams = parts[1] || '';
    }

    // 构建 URL
    let url = `${this.url}/rest/v1/${baseEndpoint}`;

    // 合并所有查询参数
    const queryParts = [];
    if (endpointParams) {
      queryParts.push(endpointParams);
    }

    if (params) {
      for (const key in params) {
        if (params[key] !== undefined && params[key] !== null) {
          let value = params[key];
          if (typeof value === 'string' && (value.includes('*') || value.includes('.') || key === 'order')) {
            queryParts.push(`${key}=${value}`);
          } else {
            queryParts.push(`${key}=${encodeURIComponent(value)}`);
          }
        }
      }
    }

    if (queryParts.length > 0) {
      url += `?${queryParts.join('&')}`;
    }

    console.log('[Supabase Request]', method, url);

    const response = await fetch(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : null
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Supabase Error]', response.status, data);
      throw new Error(data.message || `Request failed with status ${response.status}`);
    }

    return data;
  }

  // ========== 基础 CRUD 操作 ==========

  async select(table, params = {}, options = {}) {
    return this.request('GET', table, params, null, options);
  }

  async insert(table, data) {
    // 清除相关缓存
    this.cache.clear();
    return this.request('POST', table, null, data, { noCache: true });
  }

  async update(table, data, params = {}) {
    // 清除相关缓存
    this.cache.clear();
    return this.request('PATCH', table, params, data, { noCache: true });
  }

  async delete(table, params = {}) {
    // 清除相关缓存
    this.cache.clear();
    return this.request('DELETE', table, params, null, { noCache: true });
  }

  // ========== 分页查询（内存优化） ==========
  
  /**
   * 分页查询 - 只返回当前页数据
   */
  async selectPaginated(table, options = {}) {
    const {
      page = 1,
      pageSize = 20,
      order = 'created_at.desc',
      filters = {}
    } = options;
    
    const offset = (page - 1) * pageSize;
    
    const params = {
      ...filters,
      order,
      limit: pageSize,
      offset
    };
    
    return this.select(table, params);
  }
  
  /**
   * 获取总数（用于分页）
   */
  async count(table, filters = {}) {
    const params = {
      ...filters,
      select: 'count',
      limit: 1
    };
    
    const result = await this.request('GET', table, params, null, { noCache: true });
    // 通过 range 头获取总数，这里简化处理
    return result.length;
  }

  // ========== 认证相关 ==========

  /**
   * 用户登录 - 使用自定义 users 表验证
   */
  async signIn(username, password) {
    try {
      const res = await this.select(TABLES.USERS, {
        username: `eq.${username}`,
        password: `eq.${password}`,
        limit: 1
      }, { noCache: true }); // 登录不缓存

      if (res && res.length > 0) {
        const user = res[0];
        const userData = {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          isMaster: user.is_master
        };
        
        // 保存会话到 localStorage
        localStorage.setItem('supabase_session', JSON.stringify({ user: userData }));
        
        return { success: true, data: { user: userData } };
      } else {
        return { success: false, error: { message: '用户名或密码错误' } };
      }
    } catch (err) {
      console.error('[signIn] 登录失败:', err);
      return { success: false, error: err };
    }
  }

  /**
   * 获取当前会话
   */
  getSession() {
    const session = localStorage.getItem('supabase_session');
    return session ? JSON.parse(session) : null;
  }

  /**
   * 检查是否已登录
   */
  isAuthenticated() {
    const session = this.getSession();
    return session && session.user;
  }

  /**
   * 获取当前用户
   */
  getUser() {
    const session = this.getSession();
    return session?.user || null;
  }

  /**
   * 退出登录
   */
  signOut() {
    localStorage.removeItem('supabase_session');
    localStorage.removeItem('rememberMe');
    this.cache.clear(); // 清除缓存
  }

  /**
   * 恢复会话
   */
  restoreSession() {
    return this.isAuthenticated();
  }
  
  /**
   * 手动清除缓存
   */
  clearCache() {
    this.cache.clear();
    console.log('[Cache] 已清除');
  }
}

// 创建全局客户端实例
const supabase = new SupabaseClient();
