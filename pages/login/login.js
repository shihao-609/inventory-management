// pages/login/login.js
// 已迁移到 Supabase 认证
const { supabase, TABLES } = require('../../utils/supabase.js');
const app = getApp();

Page({

  /**
   * 页面的初始数据
   */
  data: {
    username: '',
    password: '',
    loading: false,
    adminUsername: '',
    adminPassword: '',
    showAdminDialog: false
  },

  /**
   * 账号输入
   */
  onUsernameInput(e) {
    this.setData({
      username: e.detail.value
    });
  },

  /**
   * 密码输入
   */
  onPasswordInput(e) {
    this.setData({
      password: e.detail.value
    });
  },

  /**
   * 登录验证
   */
  validateLogin() {
    const { username, password } = this.data;
    
    if (!username || !username.trim()) {
      wx.showToast({ title: '请输入账号', icon: 'none' });
      return false;
    }
    
    if (!password || !password.trim()) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return false;
    }
    
    return true;
  },

  /**
   * 登录 - 使用 Supabase 自定义用户表
   */
  async login() {
    if (!this.validateLogin()) {
      return;
    }
    
    this.setData({ loading: true });
    
    try {
      // 使用 Supabase 自定义用户表进行登录
      const result = await supabase.signIn(
        this.data.username.trim(),
        this.data.password
      );
      
      if (!result.success) {
        console.error('[login] 登录失败:', result.error?.message);
        wx.showToast({ 
          title: result.error?.message || '登录失败，请重试', 
          icon: 'none' 
        });
        this.setData({ loading: false });
        return;
      }
      
      // 登录成功，获取用户信息
      const userData = result.data?.user;
      console.log('[login] 登录成功，用户:', userData?.username);
      
      // 保存登录状态
      app.setLoginStatus(true, userData?.role || 'user');
      // 保存用户信息到本地存储
      wx.setStorageSync('userInfo', userData);
      // 清除管理员入口登录标记（普通入口登录都保存状态，下次自动跳转）
      wx.removeStorageSync('isAdminEntry');
      wx.showToast({ 
        title: '登录成功', 
        icon: 'success',
        duration: 1500 
      });
      
      // 普通入口登录统一进入库存管理
      setTimeout(() => {
        wx.reLaunch({
          url: '/pages/index/index'
        });
      }, 1500);
      
    } catch (error) {
      console.error('[login] 登录失败', error);
      wx.showToast({ 
        title: '登录失败，请检查网络', 
        icon: 'none' 
      });
    } finally {
      this.setData({ loading: false });
    }
  },
  
  /**
   * 显示管理员登录对话框
   */
  showAdminLogin() {
    this.setData({
      showAdminDialog: true
    });
  },
  
  /**
   * 关闭管理员登录对话框
   */
  closeAdminDialog() {
    this.setData({
      showAdminDialog: false,
      adminUsername: '',
      adminPassword: ''
    });
  },
  
  /**
   * 管理员账号输入
   */
  onAdminUsernameInput(e) {
    this.setData({
      adminUsername: e.detail.value
    });
  },
  
  /**
   * 管理员密码输入
   */
  onAdminPasswordInput(e) {
    this.setData({
      adminPassword: e.detail.value
    });
  },
  
  /**
   * 阻止事件冒泡
   */
  stopPropagation() {
    // 空函数，仅阻止事件冒泡
    return;
  },
  
  /**
   * 管理员登录 - 使用 Supabase 自定义用户表
   */
  async adminLogin() {
    const { adminUsername, adminPassword } = this.data;
    
    // 验证输入
    if (!adminUsername.trim()) {
      wx.showToast({ title: '请输入管理员账号', icon: 'none' });
      return;
    }
    
    if (!adminPassword) {
      wx.showToast({ title: '请输入管理员密码', icon: 'none' });
      return;
    }
    
    this.setData({ loading: true });
    
    try {
      // 使用 Supabase 自定义用户表进行管理员登录
      const result = await supabase.signIn(
        adminUsername.trim(),
        adminPassword
      );
      
      if (!result.success) {
        console.error('[adminLogin] 管理员登录失败:', result.error?.message);
        wx.showToast({ 
          title: result.error?.message || '登录失败，请重试', 
          icon: 'none' 
        });
        this.setData({ loading: false });
        return;
      }
      
      // 登录成功，验证是否为管理员
      // signIn 已经返回了完整的用户信息
      const userData = result.data?.user;
      const userRole = userData?.role || 'user';
      
      // 验证是否为管理员角色
      if (userRole === 'admin' || userRole === 'master' || userData?.isMaster) {
        // 登录成功
        // 标记为管理员入口登录，不保存永久登录状态
        app.globalData.isLoggedIn = true;
        app.globalData.userRole = 'admin';
        // 保存临时用户信息（用于本次会话）- 确保包含 isMaster 字段
        const adminUserInfo = {
          id: userData?.id || '',
          username: userData?.username || adminUsername.trim(),
          name: userData?.name || '',
          role: userRole,
          isMaster: userData?.isMaster || false
        };
        wx.setStorageSync('adminUserInfo', adminUserInfo);
        // 标记为管理员入口登录，下次打开需要重新输入
        wx.setStorageSync('isAdminEntry', true);
        wx.showToast({ 
          title: '管理员登录成功', 
          icon: 'success',
          duration: 1500 
        });
        
        // 跳转到管理员页面
        setTimeout(() => {
          wx.reLaunch({
            url: '/pages/admin/admin'
          });
        }, 1500);
      } else {
        wx.showToast({ 
          title: '该账号不是管理员', 
          icon: 'none' 
        });
      }
      
    } catch (error) {
      console.error('[adminLogin] 管理员登录失败', error);
      wx.showToast({ 
        title: '登录失败，请检查网络', 
        icon: 'none' 
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 登录页面不自动跳转，让用户自己决定是否登录
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 检查是否需要自动跳转
    const isAdminEntry = wx.getStorageSync('isAdminEntry');
    
    // 如果是管理员入口登录的，不自动跳转，等待用户输入
    if (isAdminEntry) {
      return;
    }
    
    // 检查普通登录状态，自动跳转
    if (app.checkLoginStatus()) {
      const userInfo = wx.getStorageSync('userInfo');
      
      if (userInfo && userInfo.role) {
        // 普通入口登录统一进入库存管理页面
        wx.reLaunch({ url: '/pages/index/index' });
        return;
      }
    }
    
    // 未登录状态，不自动跳转
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  }
})
