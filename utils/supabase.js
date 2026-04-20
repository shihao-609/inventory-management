/**
 * Supabase 客户端 (微信小程序适配版)
 * 使用 HTTP REST API 方式连接 Supabase
 */

const { SUPABASE_URL, SUPABASE_ANON_KEY, TABLES } = require('./supabase-config.js');

class SupabaseClient {
  constructor() {
    this.url = SUPABASE_URL;
    this.headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  /**
   * 通用请求方法
   * @param {string} method - HTTP 方法 (GET, POST, PATCH, DELETE)
   * @param {string} endpoint - 端点，可能是 "table" 或 "table?query=xxx"
   * @param {object} params - 查询参数对象（可选）
   * @param {object} body - 请求体（POST/PATCH 用）
   */
  async request(method, endpoint, params = null, body = null) {
    return new Promise((resolve, reject) => {
      // 分离 endpoint 中的查询参数
      let endpointParams = '';
      let baseEndpoint = endpoint;
      if (endpoint.includes('?')) {
        const parts = endpoint.split('?');
        baseEndpoint = parts[0];  // 表名
        endpointParams = parts[1] || '';  // 查询参数
      }
      
      // 构建 URL（不包含查询参数）
      let url = `${this.url}/rest/v1/${baseEndpoint}`;
      
      // 合并所有查询参数
      const queryParts = [];
      
      // 先添加 endpoint 中的查询参数
      if (endpointParams) {
        // endpoint 中的参数通常是 eq.xxx 格式，不需要编码
        queryParts.push(endpointParams);
      }
      
      // 再添加 params 对象中的参数
      if (params) {
        for (const key in params) {
          if (params[key] !== undefined && params[key] !== null) {
            let value = params[key];
            // 对于包含 * 的值（如 ilike.*keyword*），不进行编码
            // 对于包含 . 的值（如 eq.xxx），不进行编码
            // 对于 order 字段（如 updated_at.desc），不进行编码
            // 其他值进行标准编码
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

      console.log('[Supabase Request]', method, url, body ? JSON.stringify(body) : '');
      
      wx.request({
        url,
        method,
        header: this.headers,
        data: body,
        success: (res) => {
          console.log('[Supabase Response]', res.statusCode, JSON.stringify(res.data));
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else {
            console.error('Supabase request error:', res);
            reject(res.data || { message: `Request failed with status ${res.statusCode}` });
          }
        },
        fail: (err) => {
          console.error('Network error:', err);
          reject(err);
        },
        timeout: 15000
      });
    });
  }

  // ========== 基础 CRUD 操作 ==========

  /**
   * 查询数据
   * @param {string} table - 表名
   * @param {object} params - 查询参数 { field: value, select: '*', order: 'xxx.desc', limit: 10 }
   */
  async select(table, params = {}) {
    return this.request('GET', table, params);
  }

  /**
   * 插入数据
   * @param {string} table - 表名
   * @param {object|array} data - 要插入的数据
   */
  async insert(table, data) {
    return this.request('POST', table, null, data);
  }

  /**
   * 更新数据 (使用 PATCH)
   * @param {string} table - 表名
   * @param {object} data - 要更新的数据
   */
  async update(table, data) {
    return this.request('PATCH', table, null, data);
  }

  /**
   * 删除数据
   * @param {string} table - 表名
   * @param {object} params - 查询参数
   */
  async delete(table, params) {
    return this.request('DELETE', table, params);
  }

  // ========== 认证相关（使用自定义用户表）==========

  /**
   * 用户登录 - 使用自定义 users 表验证
   */
  async signIn(email, password) {
    try {
      // 查询 users 表，验证用户名和密码
      const res = await this.select(TABLES.USERS, {
        username: `eq.${email}`,
        password: `eq.${password}`,
        limit: 1
      });
      
      if (res && res.length > 0) {
        const user = res[0];
        // 保存用户信息
        const userData = {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          isMaster: user.is_master
        };
        wx.setStorageSync('supabase_session', { user: userData });
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
    return wx.getStorageSync('supabase_session');
  }

  /**
   * 恢复会话
   */
  restoreSession() {
    const session = this.getSession();
    if (session && session.user) {
      return true;
    }
    return false;
  }

  /**
   * 退出登录
   */
  signOut() {
    wx.removeStorageSync('supabase_session');
  }

  /**
   * 获取当前用户
   */
  getUser() {
    const session = this.getSession();
    return session?.user || null;
  }
}

// 单例模式导出
const supabase = new SupabaseClient();

module.exports = {
  supabase,
  TABLES
};
