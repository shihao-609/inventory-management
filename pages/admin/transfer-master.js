// pages/admin/transfer-master.js
// 【修改】已迁移到 Supabase 后端
const { supabase, TABLES } = require('../../utils/supabase.js');

Page({

  /**
   * 页面的初始数据
   */
  data: {
    adminList: [],
    currentUser: null,
    showConfirmModal: false,
    selectedUserId: '',
    selectedUserNickname: '',
    submitting: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.loadCurrentUser();
    this.loadAdminList();
  },

  /**
   * 加载当前登录用户信息
   */
  loadCurrentUser() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo) {
        this.setData({
          currentUser: userInfo
        });
      } else {
        wx.redirectTo({
          url: '/pages/login/login'
        });
      }
    } catch (e) {
      console.error('获取当前用户信息失败', e);
      wx.showToast({
        title: '获取用户信息失败',
        icon: 'none'
      });
    }
  },

  /**
   * 加载管理员列表 - 使用 Supabase
   */
  async loadAdminList() {
    wx.showLoading({
      title: '加载中...',
      mask: true
    });

    try {
      // 获取所有管理员/主管
      const res = await supabase.request('GET', TABLES.USERS, {
        role: `in.(admin,master)`,
        order: 'created_at.asc',
        limit: 100
      });

      if (res && res.error) {
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
        return;
      }

      // 适配数据格式
      const adminList = (res || []).map(item => ({
        id: item.id,
        username: item.username,
        name: item.name || '',
        role: item.role,
        isMaster: !!item.is_master
      }));

      this.setData({
        adminList: adminList
      });

    } catch (err) {
      console.error('加载管理员列表失败', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 转移主管理员权限
   */
  transferMaster(e) {
    const id = e.currentTarget.dataset.id;
    const nickname = e.currentTarget.dataset.nickname;
    const { currentUser } = this.data;

    // 权限判断
    if (!currentUser || currentUser.role !== 'master') {
      wx.showToast({
        title: '只有主管理员可以执行此操作',
        icon: 'none'
      });
      return;
    }

    // 不能转移给自己
    if (id === currentUser.id) {
      wx.showToast({
        title: '不能转移给自己',
        icon: 'none'
      });
      return;
    }

    // 显示确认弹窗
    this.setData({
      showConfirmModal: true,
      selectedUserId: id,
      selectedUserNickname: nickname
    });
  },

  /**
   * 关闭确认弹窗
   */
  closeConfirmModal() {
    this.setData({
      showConfirmModal: false,
      selectedUserId: '',
      selectedUserNickname: ''
    });
  },

  /**
   * 确认转移 - 使用 Supabase
   */
  async confirmTransfer() {
    const { selectedUserId, currentUser } = this.data;

    if (!selectedUserId) {
      wx.showToast({
        title: '请选择新的主管理员',
        icon: 'none'
      });
      return;
    }

    this.setData({ submitting: true });

    try {
      const currentUserId = currentUser.id;

      // 1. 当前主管理员降级
      await supabase.request('PATCH', `${TABLES.USERS}?id=eq.${currentUserId}`, {
        role: 'admin',
        is_master: false,
        updated_at: new Date().toISOString()
      });

      // 2. 目标用户升级为主管理员
      await supabase.request('PATCH', `${TABLES.USERS}?id=eq.${selectedUserId}`, {
        role: 'admin',
        is_master: true,
        updated_at: new Date().toISOString()
      });

      wx.showToast({
        title: '主管理员权限转移成功',
        icon: 'success'
      });
      
      // 更新本地用户信息
      const updatedUser = Object.assign({}, currentUser, { role: 'admin', isMaster: false });
      wx.setStorageSync('userInfo', updatedUser);
      this.setData({ currentUser: updatedUser });
      
      // 重新加载管理员列表
      this.loadAdminList();

    } catch (err) {
      console.error('转移主管理员权限失败', err);
      wx.showToast({
        title: '转移失败',
        icon: 'none'
      });
    } finally {
      this.setData({ 
        submitting: false,
        showConfirmModal: false,
        selectedUserId: '',
        selectedUserNickname: ''
      });
    }
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    this.loadCurrentUser();
    this.loadAdminList();
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    this.loadCurrentUser();
    this.loadAdminList();
    
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1000);
  },

  onReachBottom() {},

  onShareAppMessage() {}
});
