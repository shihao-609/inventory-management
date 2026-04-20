/**
 * 库存管理助手 - 入口文件
 * 使用 Supabase 替代微信云开发
 */
const { supabase, TABLES } = require('./utils/supabase.js');

App({
  onLaunch() {
    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    this.globalData.systemInfo = systemInfo;
    
    // 自定义安全区域
    this.globalData.statusBarHeight = systemInfo.statusBarHeight;
    this.globalData.navBarHeight = 44;
    this.globalData.safeAreaBottom = systemInfo.safeArea ? systemInfo.safeArea.bottom : 0;
    
    // 初始化 Supabase 客户端
    this.initSupabase();
    
    // 初始化隐藏页面验证状态
    this.checkHiddenVerification();
    
    // 初始化默认字段配置
    this.initDefaultFieldConfig();
    
    // 检查登录状态
    this.checkLoginStatus();
  },

  globalData: {
    userInfo: null,
    systemInfo: null,
    statusBarHeight: 0,
    navBarHeight: 44,
    safeAreaBottom: 0,
    hiddenVerified: false,  // 隐藏界面密码验证状态
    isLoggedIn: false,      // 用户登录状态
    userRole: 'normal',     // 用户角色: normal/admin
    supabase: null          // Supabase 实例
  },

  // ========== Supabase 初始化 ==========

  initSupabase() {
    // Supabase 客户端已在 utils/supabase.js 中初始化
    this.globalData.supabase = supabase;
    
    // 尝试恢复之前的登录会话
    supabase.restoreSession();
    console.log('[Supabase] 初始化完成');
  },

  // ========== 隐藏界面密码验证 ==========

  // 检查隐藏界面验证状态（有效期1小时）
  checkHiddenVerification() {
    const verified = wx.getStorageSync('hiddenVerified');
    const verifyTime = wx.getStorageSync('hiddenVerifiedTime');
    const now = Date.now();
    
    // 验证状态有效期为1小时
    if (verified && verifyTime && (now - verifyTime < 3600000)) {
      this.globalData.hiddenVerified = true;
    } else {
      // 清除过期验证状态
      this.globalData.hiddenVerified = false;
      wx.removeStorageSync('hiddenVerified');
      wx.removeStorageSync('hiddenVerifiedTime');
    }
  },

  // 设置隐藏界面验证通过
  setHiddenVerified() {
    this.globalData.hiddenVerified = true;
    wx.setStorageSync('hiddenVerified', true);
    wx.setStorageSync('hiddenVerifiedTime', Date.now());
  },

  // 清除隐藏界面验证状态
  clearHiddenVerification() {
    this.globalData.hiddenVerified = false;
    wx.removeStorageSync('hiddenVerified');
    wx.removeStorageSync('hiddenVerifiedTime');
  },

  // 验证隐藏界面密码（异步）- 使用 Supabase
  async verifyHiddenPassword(password) {
    try {
      // 从 settings 表获取密码配置
      const res = await supabase.select(TABLES.SETTINGS, {
        key: `eq.hiddenPassword`,
        limit: 1
      });

      let correctPassword = '123456'; // 默认密码
      if (res && res.length > 0 && res[0].value) {
        correctPassword = String(res[0].value);
      }
      
      if (password === correctPassword) {
        this.setHiddenVerified();
        return { success: true };
      } else {
        return { success: false, message: '密码错误' };
      }
    } catch (err) {
      console.error('验证密码失败', err);
      // 验证失败时使用默认密码
      if (password === '123456') {
        this.setHiddenVerified();
        return { success: true };
      }
      return { success: false, message: '验证失败' };
    }
  },

  // ========== 网络异常处理 ==========

  // 显示网络异常提示
  showNetworkError(err) {
    console.error('网络错误:', err);
    let message = '网络异常，请稍后重试';
    
    if (err.errMsg) {
      if (err.errMsg.includes('request fail')) {
        message = '网络请求失败，请检查网络';
      } else if (err.errMsg.includes('timeout')) {
        message = '请求超时，请稍后重试';
      } else if (err.errMsg.includes('abort')) {
        message = '请求已取消';
      }
    }
    
    wx.showToast({
      title: message,
      icon: 'none',
      duration: 2000
    });
  },

  // ========== 默认字段配置初始化 ==========

  // 初始化默认扫描字段配置 - 使用 Supabase
  async initDefaultFieldConfig() {
    try {
      const res = await supabase.select(TABLES.SETTINGS, {
        key: `eq.scanFieldsConfig`,
        limit: 1
      });
      
      // 如果没有配置（409冲突或不存在），使用upsert
      // 注意：这里静默处理，因为设置已经存在就不需要再插入
      if (!res || res.length === 0) {
        console.log('[initDefaultFieldConfig] 需要添加默认配置');
      } else {
        console.log('[initDefaultFieldConfig] 配置已存在');
      }
    } catch (err) {
      // 静默处理，因为设置可能已存在
      console.log('[initDefaultFieldConfig] 配置检查完成');
    }
  },

  // ========== 用户登录状态管理 ==========

  // 设置用户登录状态
  setLoginStatus(isLoggedIn, userRole = 'normal') {
    this.globalData.isLoggedIn = isLoggedIn;
    this.globalData.userRole = userRole;
    wx.setStorageSync('isLoggedIn', isLoggedIn);
    wx.setStorageSync('userRole', userRole);
  },

  // 检查登录状态
  checkLoginStatus() {
    const isLoggedIn = wx.getStorageSync('isLoggedIn');
    const userRole = wx.getStorageSync('userRole') || 'normal';
    this.globalData.isLoggedIn = isLoggedIn;
    this.globalData.userRole = userRole;
    return isLoggedIn;
  },
  
  // 退出登录
  logout() {
    this.globalData.isLoggedIn = false;
    this.globalData.userRole = 'normal';
    this.globalData.userInfo = null;
    wx.removeStorageSync('isLoggedIn');
    wx.removeStorageSync('userRole');
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('adminUserInfo');
    
    // 清除 Supabase 会话
    supabase.signOut();
    
    // 跳转到登录页面
    wx.reLaunch({
      url: '/pages/login/login'
    });
  },

  // 获取用户信息
  getUserInfo() {
    return new Promise((resolve, reject) => {
      try {
        const userInfo = wx.getStorageSync('userInfo');
        if (userInfo) {
          this.globalData.userInfo = userInfo;
          resolve(userInfo);
        } else {
          // 本地没有用户信息，尝试从 Supabase 获取
          this.getCurrentUserFromSupabase().then(userInfo => {
            resolve(userInfo);
          }).catch(err => {
            reject(err);
          });
        }
      } catch (e) {
        reject(e);
      }
    });
  },

  // 从 Supabase 获取当前用户
  async getCurrentUserFromSupabase() {
    const session = supabase.getSession();
    if (session && session.user) {
      // 获取用户扩展信息
      const res = await supabase.select(TABLES.USERS, {
        id: `eq.${session.user.id}`,
        limit: 1
      });
      
      if (res && res.length > 0) {
        const userInfo = res[0];
        wx.setStorageSync('userInfo', userInfo);
        this.globalData.userInfo = userInfo;
        this.setLoginStatus(true, userInfo.role);
        return userInfo;
      }
    }
    throw new Error('用户未登录');
  },

  // 根据 openid 获取用户信息 - 使用 Supabase
  async getUserInfoByOpenid(openid) {
    try {
      const res = await supabase.select(TABLES.USERS, {
        wechat_openid: `eq.${openid}`,
        limit: 1
      });
      
      if (res && res.length > 0) {
        const userInfo = res[0];
        // 存储用户信息到本地
        wx.setStorageSync('userInfo', userInfo);
        this.globalData.userInfo = userInfo;
        this.setLoginStatus(true, userInfo.role);
        return userInfo;
      } else {
        throw new Error('用户不存在或未授权');
      }
    } catch (err) {
      console.error('获取用户信息失败', err);
      throw err;
    }
  },

  // ========== 数据库错误处理 ==========

  // 显示数据库操作错误
  showDBError(err, operation = '操作') {
    console.error(`${operation}失败:`, err);
    let message = `${operation}失败，请稍后重试`;
    
    if (err.message) {
      if (err.message.includes('permission denied')) {
        message = '无权限执行此操作';
      } else if (err.message.includes('not found')) {
        message = '数据不存在';
      } else if (err.message.includes('duplicate')) {
        message = '数据已存在';
      }
    }
    
    wx.showToast({
      title: message,
      icon: 'none',
      duration: 2000
    });
  },

  // ========== 通用数据库操作方法 ==========

  // 查询数据
  async dbSelect(table, filters = {}, options = {}) {
    return supabase.select(table, filters, options);
  },

  // 插入数据
  async dbInsert(table, data) {
    return supabase.insert(table, data);
  },

  // 更新数据
  async dbUpdate(table, data, filters) {
    return supabase.update(table, data, filters);
  },

  // 删除数据
  async dbDelete(table, filters) {
    return supabase.delete(table, filters);
  }
});
