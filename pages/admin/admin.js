// pages/admin/admin.js
// ============================================================
// 管理员账号管理页 - 严格三层权限控制系统
// 【修改】已迁移到 Supabase 后端
// ============================================================
const { supabase, TABLES } = require('../../utils/supabase.js');

// ========== 权限账号常量 ==========
Page({

  /**
   * 页面的初始数据
   */
  data: {
    // ========== 表单数据 ==========
    formData: {
      username: '',
      password: '',
      confirmPassword: '',
      name: '',
      role: 'normal'
    },
    passwordForm: {
      username: '',
      oldPassword: '',
      newPassword: '',
      confirmPassword: ''
    },
    resetForm: {
      username: '',
      newPassword: '',
      confirmPassword: ''
    },
    passwordModal: {
      password: ''
    },

    // ========== 列表与状态 ==========
    accountList: [],
    adminList: [],
    showCreateFormFlag: false,
    showUpdateFormFlag: false,
    showResetFormFlag: false,
    showPasswordModal: false,
    showSelectMasterModal: false,
    selectedNewMaster: '',
    pendingAction: null,
    submitting: false,
    currentUser: null,
    loadingAccountList: false,

    // ========== 权限控制标识 ==========
    isMaster: false,
    isAdmin: false,
    canUseTopButtons: false,
    canUseInlineButtons: false,
    isEmployee: false,
    showAccessDenied: false
  },

  // ============================================================
  // 权限判断工具方法
  // ============================================================

  _checkIsMaster() {
    const { currentUser } = this.data;
    if (!currentUser) return false;
    return !!currentUser.isMaster;
  },

  _checkIsAdmin() {
    const { currentUser } = this.data;
    if (!currentUser) return false;
    if (this._checkIsMaster()) return false;
    return currentUser.role === 'admin';
  },

  _checkIsEmployee() {
    var currentUser = this.data.currentUser;
    if (!currentUser) return true;
    return currentUser.role === 'normal';
  },

  _refreshPermissionState() {
    const isMaster = this._checkIsMaster();
    const isAdmin = this._checkIsAdmin();
    const isEmployee = this._checkIsEmployee();

    this.setData({
      isMaster: isMaster,
      isAdmin: isAdmin,
      isEmployee: isEmployee,
      canUseTopButtons: (isMaster || isAdmin),
      canUseInlineButtons: isMaster,
      showAccessDenied: isEmployee
    });
  },

  _computeBtnDisabled(item) {
    const { currentUser } = this.data;
    if (!currentUser) return true;

    if (this._checkIsEmployee()) return true;
    if (this._checkIsAdmin()) return true;
    if (this._checkIsMaster()) {
      return item.username === currentUser.username;
    }
    return true;
  },

  // ============================================================
  // 用户身份保障机制
  // ============================================================

  _ensureCurrentUser() {
    const { currentUser } = this.data;
    if (currentUser && currentUser.username) {
      return currentUser;
    }
    try {
      // 优先从 adminUserInfo 读取
      var cached = wx.getStorageSync('adminUserInfo');
      if (!cached || !cached.username) {
        cached = wx.getStorageSync('userInfo');
      }
      if (cached && cached.username) {
        console.log('[身份恢复] 从本地缓存恢复用户身份:', cached.username);
        this.setData({ currentUser: cached });
        this._refreshPermissionState();
        return cached;
      }
    } catch (e) {
      console.error('[身份恢复] 读取本地缓存失败', e);
    }
    return null;
  },

  _guardIdentity() {
    const user = this._ensureCurrentUser();
    if (!user || !user.username) {
      wx.showModal({
        title: '身份验证失败',
        content: '无法获取您的身份信息，请返回登录页重新登录。',
        showCancel: false,
        confirmText: '去登录',
        success: function() {
          wx.reLaunch({ url: '/pages/login/login' });
        }
      });
      return false;
    }
    return true;
  },

  // ============================================================
  // 表单输入绑定
  // ============================================================

  onInput: function(e) {
    const field = e.currentTarget.dataset.field;
    const formData = this.data.formData;
    formData[field] = e.detail.value;
    this.setData({ formData: formData });
  },

  onPasswordInput: function(e) {
    const field = e.currentTarget.dataset.field;
    const passwordForm = this.data.passwordForm;
    passwordForm[field] = e.detail.value;
    this.setData({ passwordForm: passwordForm });
  },

  onResetInput: function(e) {
    const field = e.currentTarget.dataset.field;
    const resetForm = this.data.resetForm;
    resetForm[field] = e.detail.value;
    this.setData({ resetForm: resetForm });
  },

  selectRole: function(e) {
    const role = e.currentTarget.dataset.role;
    const formData = this.data.formData;
    formData.role = role;
    this.setData({ formData: formData });
  },

  onPasswordModalInput: function(e) {
    const field = e.currentTarget.dataset.field;
    const passwordModal = this.data.passwordModal;
    passwordModal[field] = e.detail.value;
    this.setData({ passwordModal: passwordModal });
  },

  // ============================================================
  // 表单校验
  // ============================================================

  validateForm: function() {
    const { formData } = this.data;

    if (!formData.username || !formData.username.trim()) {
      wx.showToast({ title: '请输入员工账号', icon: 'none' });
      return false;
    }
    const usernameRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,12}$/;
    if (!usernameRegex.test(formData.username)) {
      wx.showToast({ title: '账号必须为 6-12 位字母 + 数字组合', icon: 'none' });
      return false;
    }
    if (!formData.password || formData.password.length < 8) {
      wx.showToast({ title: '密码需 8 位以上，包含字母 + 数字', icon: 'none' });
      return false;
    }
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,16}$/;
    if (!passwordRegex.test(formData.password)) {
      wx.showToast({ title: '密码需包含字母 + 数字组合', icon: 'none' });
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      wx.showToast({ title: '两次输入密码不相同', icon: 'none' });
      return false;
    }
    if (!formData.name || !formData.name.trim()) {
      wx.showToast({ title: '请输入员工真实姓名', icon: 'none' });
      return false;
    }
    return true;
  },

  validatePasswordForm: function() {
    const { passwordForm } = this.data;

    if (!passwordForm.username || !passwordForm.username.trim()) {
      wx.showToast({ title: '请输入账号', icon: 'none' });
      return false;
    }
    if (!passwordForm.oldPassword) {
      wx.showToast({ title: '请输入原密码', icon: 'none' });
      return false;
    }
    if (!passwordForm.newPassword || passwordForm.newPassword.length < 8) {
      wx.showToast({ title: '新密码需 8 位以上', icon: 'none' });
      return false;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      wx.showToast({ title: '两次输入密码不相同', icon: 'none' });
      return false;
    }
    return true;
  },

  validateResetForm: function() {
    const { resetForm } = this.data;

    if (!resetForm.username || !resetForm.username.trim()) {
      wx.showToast({ title: '请输入账号', icon: 'none' });
      return false;
    }
    if (!resetForm.newPassword || resetForm.newPassword.length < 8) {
      wx.showToast({ title: '新密码需 8 位以上', icon: 'none' });
      return false;
    }
    if (resetForm.newPassword !== resetForm.confirmPassword) {
      wx.showToast({ title: '两次输入密码不相同', icon: 'none' });
      return false;
    }
    return true;
  },

  // ============================================================
  // 顶部按钮点击事件
  // ============================================================

  showCreateForm: function() {
    if (!this._guardIdentity()) return;
    if (!this._checkIsMaster() && !this._checkIsAdmin()) {
      wx.showToast({ title: '无操作权限', icon: 'none' });
      return;
    }
    this.setData({
      showCreateFormFlag: true,
      showUpdateFormFlag: false,
      showResetFormFlag: false
    });
  },

  showUpdateForm: function() {
    if (!this._guardIdentity()) return;
    if (!this._checkIsMaster() && !this._checkIsAdmin()) {
      wx.showToast({ title: '无操作权限', icon: 'none' });
      return;
    }
    this.setData({
      showCreateFormFlag: false,
      showUpdateFormFlag: true,
      showResetFormFlag: false
    });
  },

  showResetForm: function() {
    if (!this._guardIdentity()) return;
    if (!this._checkIsMaster() && !this._checkIsAdmin()) {
      wx.showToast({ title: '无操作权限', icon: 'none' });
      return;
    }
    this.setData({
      showCreateFormFlag: false,
      showUpdateFormFlag: false,
      showResetFormFlag: true
    });
  },

  // ============================================================
  // 表单提交事件
  // ============================================================

  submitForm: async function() {
    var self = this;
    if (!this.validateForm()) return;
    if (!this._guardIdentity()) return;
    if (!this._checkIsMaster() && !this._checkIsAdmin()) {
      wx.showToast({ title: '无操作权限', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      var checkRes = await supabase.request('GET', TABLES.USERS, {
        username: 'eq.' + this.data.formData.username,
        limit: 1
      });

      if (checkRes && checkRes.length > 0) {
        wx.showToast({ title: '账号已存在', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }

      var insertData = {
        username: this.data.formData.username,
        password: this.data.formData.password,
        name: this.data.formData.name,
        role: this.data.formData.role,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      console.log('[submitForm] 准备插入的数据:', JSON.stringify(insertData));

      var res = await supabase.request('POST', TABLES.USERS, null, insertData);
      console.log('[submitForm] 创建账号响应:', JSON.stringify(res));

      if (res && res.error) {
        console.error('[submitForm] 创建失败详情:', res.error);
        wx.showToast({ title: '创建失败: ' + (res.error.message || '未知错误'), icon: 'none' });
        this.setData({ submitting: false });
        return;
      }

      wx.showToast({ title: '账号创建成功', icon: 'success' });
      this.setData({
        formData: { username: '', password: '', confirmPassword: '', name: '', role: 'normal' },
        showCreateFormFlag: false
      });
      this.loadAccountList();

    } catch (err) {
      console.error('创建账号失败', err);
      wx.showToast({ title: '创建失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  updatePassword: async function() {
    if (!this.validatePasswordForm()) return;
    if (!this._guardIdentity()) return;
    if (!this._checkIsMaster() && !this._checkIsAdmin()) {
      wx.showToast({ title: '无操作权限', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      var username = this.data.passwordForm.username;
      var oldPassword = this.data.passwordForm.oldPassword;
      var newPassword = this.data.passwordForm.newPassword;

      var userRes = await supabase.request('GET', TABLES.USERS, {
        username: 'eq.' + username,
        limit: 1
      });

      if (!userRes || userRes.length === 0) {
        wx.showToast({ title: '账号不存在', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }

      var user = userRes[0];

      if (user.password !== oldPassword) {
        wx.showToast({ title: '原密码错误', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }

      var updateRes = await supabase.request('PATCH', TABLES.USERS + '?id=eq.' + user.id, null, {
        password: newPassword,
        updated_at: new Date().toISOString()
      });

      if (updateRes && updateRes.error) {
        wx.showToast({ title: '修改失败', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }

      wx.showToast({ title: '密码修改成功', icon: 'success' });
      this.setData({
        passwordForm: { username: '', oldPassword: '', newPassword: '', confirmPassword: '' },
        showUpdateFormFlag: false
      });

    } catch (err) {
      console.error('修改密码失败', err);
      wx.showToast({ title: '修改失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  resetPassword: async function() {
    if (!this.validateResetForm()) return;
    if (!this._guardIdentity()) return;
    if (!this._checkIsMaster() && !this._checkIsAdmin()) {
      wx.showToast({ title: '无操作权限', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      var username = this.data.resetForm.username;
      var newPassword = this.data.resetForm.newPassword;

      var userRes = await supabase.request('GET', TABLES.USERS, {
        username: 'eq.' + username,
        limit: 1
      });

      if (!userRes || userRes.length === 0) {
        wx.showToast({ title: '账号不存在', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }

      var user = userRes[0];

      var updateRes = await supabase.request('PATCH', TABLES.USERS + '?id=eq.' + user.id, null, {
        password: newPassword,
        updated_at: new Date().toISOString()
      });

      if (updateRes && updateRes.error) {
        wx.showToast({ title: '重置失败', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }

      wx.showToast({ title: '密码重置成功', icon: 'success' });
      this.setData({
        resetForm: { username: '', newPassword: '', confirmPassword: '' },
        showResetFormFlag: false
      });

    } catch (err) {
      console.error('重置密码失败', err);
      wx.showToast({ title: '重置失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  // ============================================================
  // 行内操作按钮事件
  // ============================================================

  deleteAccount: function(e) {
    var self = this;
    if (!this._guardIdentity()) return;

    var username = e.currentTarget.dataset.username;
    var isMaster = e.currentTarget.dataset.ismaster;
    var currentUser = this.data.currentUser;

    if (!currentUser || !currentUser.username) {
      wx.showToast({ title: '身份信息丢失', icon: 'none' });
      return;
    }

    if (!this._checkIsMaster()) {
      wx.showToast({ title: '仅主管管理员可进行此操作', icon: 'none' });
      return;
    }

    if (username === currentUser.username) {
      wx.showToast({ title: '不可删除自己的账号', icon: 'none' });
      return;
    }

    if (isMaster) {
      wx.showToast({ title: '主管理员账号不可删除', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '删除账号',
      content: '确定要删除账号 ' + username + ' 吗？',
      success: function(res) {
        if (res.confirm) {
          self.setData({ submitting: true });

          supabase.request('GET', TABLES.USERS, {
            username: 'eq.' + username,
            limit: 1
          }).then(function(userRes) {
            if (!userRes || userRes.length === 0) {
              wx.showToast({ title: '账号不存在', icon: 'none' });
              self.setData({ submitting: false });
              return;
            }

            var userId = userRes[0].id;

            return supabase.request('DELETE', TABLES.USERS + '?id=eq.' + userId);
          }).then(function(deleteRes) {
            if (deleteRes && deleteRes.error) {
              wx.showToast({ title: '删除失败', icon: 'none' });
              self.setData({ submitting: false });
              return;
            }

            wx.showToast({ title: '账号删除成功', icon: 'success' });
            self.loadAccountList();
            self.setData({ submitting: false });
          }).catch(function(err) {
            console.error('[deleteAccount] 删除失败:', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
            self.setData({ submitting: false });
          });
        }
      }
    });
  },

  setAdminRole: function(e) {
    var self = this;
    if (!this._guardIdentity()) return;

    var username = e.currentTarget.dataset.username;
    var currentRole = e.currentTarget.dataset.role;
    var accountList = this.data.accountList;
    var currentUser = this.data.currentUser;

    if (!currentUser || !currentUser.username) {
      wx.showToast({ title: '身份信息丢失', icon: 'none' });
      return;
    }

    if (!this._checkIsMaster()) {
      wx.showToast({ title: '仅主管管理员可进行此操作', icon: 'none' });
      return;
    }

    if (username === currentUser.username) {
      wx.showToast({ title: '不可变更自己的管理员身份', icon: 'none' });
      return;
    }

    var hasMaster = accountList.some(function(acc) { return acc.isMaster; });
    if (!hasMaster) {
      wx.showToast({ title: '需要先设置主管理员', icon: 'none' });
      return;
    }

    var isSettingAdmin = currentRole !== 'admin';
    var targetUser = accountList.find(function(acc) { return acc.username === username; });

    if (!isSettingAdmin && targetUser && targetUser.isMaster) {
      wx.showToast({ title: '主管理员不能取消管理员身份', icon: 'none' });
      return;
    }

    wx.showModal({
      title: isSettingAdmin ? '设为管理员' : '取消管理员',
      content: isSettingAdmin
        ? '确定要将 ' + username + ' 设为管理员吗？'
        : '确定要取消 ' + username + ' 的管理员身份吗？',
      success: function(res) {
        if (res.confirm) {
          self._executeSetAdminRole(username, isSettingAdmin);
        }
      }
    });
  },

  _executeSetAdminRole: async function(username, isSettingAdmin) {
    var self = this;
    this.setData({ submitting: true });

    try {
      var userRes = await supabase.request('GET', TABLES.USERS, {
        username: 'eq.' + username,
        limit: 1
      });

      if (!userRes || userRes.length === 0) {
        wx.showToast({ title: '账号不存在', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }

      var userId = userRes[0].id;

      var updateRes = await supabase.request('PATCH', TABLES.USERS + '?id=eq.' + userId, null, {
        role: isSettingAdmin ? 'admin' : 'normal',
        updated_at: new Date().toISOString()
      });

      if (updateRes && updateRes.error) {
        wx.showToast({ title: '操作失败', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }

      wx.showToast({
        title: isSettingAdmin ? '设为管理员成功' : '取消管理员成功',
        icon: 'success'
      });
      this.loadAccountList();

    } catch (err) {
      console.error('[_executeSetAdminRole] 请求失败:', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  setMasterAccount: function(e) {
    var self = this;
    if (!this._guardIdentity()) return;

    var username = e.currentTarget.dataset.username;
    var isMasterFlag = e.currentTarget.dataset.ismaster;
    var accountList = this.data.accountList;
    var currentUser = this.data.currentUser;

    if (!currentUser || !currentUser.username) {
      wx.showToast({ title: '身份信息丢失', icon: 'none' });
      return;
    }

    if (!username || !username.trim()) {
      wx.showToast({ title: '目标账号信息无效', icon: 'none' });
      return;
    }

    var masterAccount = null;
    for (var i = 0; i < accountList.length; i++) {
      if (accountList[i].isMaster) {
        masterAccount = accountList[i];
        break;
      }
    }
    var isSettingMaster = !isMasterFlag;

    if (masterAccount && !this._checkIsMaster()) {
      wx.showToast({ title: '仅主管管理员可进行此操作', icon: 'none' });
      return;
    }

    if (isSettingMaster) {
      if (!masterAccount) {
        if (!this._checkIsMaster() && !this._checkIsAdmin()) {
          wx.showToast({ title: '仅管理员可进行此操作', icon: 'none' });
          return;
        }

        var targetUser = null;
        for (var i = 0; i < accountList.length; i++) {
          if (accountList[i].username === username) {
            targetUser = accountList[i];
            break;
          }
        }
        var roleLabel = targetUser ? (targetUser.role === 'normal' ? '（将自动升级为管理员）' : '') : '';

        wx.showModal({
          title: '设为主管理员',
          content: '确定要将 ' + username + ' 设为主管理员吗？' + roleLabel,
          success: function(res) {
            if (res.confirm) {
              self._executeSetMasterWithoutPassword(username, true);
            }
          }
        });
      } else {
        if (!this._checkIsMaster()) {
          wx.showToast({ title: '仅主管管理员可进行此操作', icon: 'none' });
          return;
        }

        if (username === currentUser.username) {
          wx.showToast({ title: '不能将主管理员权限转移给自己', icon: 'none' });
          return;
        }

        wx.showModal({
          title: '转移主管理员权限',
          content: '确定要将主管理员权限转移给 ' + username + ' 吗？',
          success: function(res) {
            if (res.confirm) {
              self.setData({
                pendingAction: { username: username, isMaster: true },
                passwordModal: { password: '' },
                showPasswordModal: true
              });
            }
          }
        });
      }
    } else {
      wx.showToast({ title: '主管理员权限只能通过转移方式取消', icon: 'none' });
    }
  },

  _executeSetMasterWithoutPassword: async function(username, isMaster) {
    if (typeof isMaster !== 'boolean') isMaster = true;
    this.setData({ submitting: true });

    try {
      var userRes = await supabase.request('GET', TABLES.USERS, {
        username: 'eq.' + username,
        limit: 1
      });

      if (!userRes || userRes.length === 0) {
        wx.showToast({ title: '账号不存在', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }

      var userId = userRes[0].id;

      var updateRes = await supabase.request('PATCH', TABLES.USERS + '?id=eq.' + userId, null, {
        role: 'admin',
        is_master: true,
        updated_at: new Date().toISOString()
      });

      if (updateRes && updateRes.error) {
        wx.showToast({ title: '操作失败', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }

      wx.showToast({
        title: isMaster ? '设为主管理员成功' : '取消主管理员成功',
        icon: 'success'
      });
      this.loadAccountList();
      this._refreshCurrentUserFromServer();

    } catch (err) {
      console.error('[_executeSetMasterWithoutPassword] 请求异常:', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  // ============================================================
  // 弹窗控制
  // ============================================================

  closePasswordModal: function() {
    this.setData({
      showPasswordModal: false,
      passwordModal: { password: '' },
      pendingAction: null
    });
  },

  confirmPasswordModal: function() {
    var passwordModal = this.data.passwordModal;
    var pendingAction = this.data.pendingAction;
    if (!passwordModal.password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }
    this._executePendingAction(passwordModal.password, null);
  },

  closeSelectMasterModal: function() {
    this.setData({
      showSelectMasterModal: false,
      selectedNewMaster: '',
      pendingAction: null
    });
  },

  selectNewMaster: function(e) {
    this.setData({ selectedNewMaster: e.currentTarget.dataset.username });
  },

  confirmSelectMasterModal: function() {
    var selectedNewMaster = this.data.selectedNewMaster;
    if (!selectedNewMaster) {
      wx.showToast({ title: '请选择新主管理员', icon: 'none' });
      return;
    }
    this._executePendingAction(null, selectedNewMaster);
  },

  _executePendingAction: async function(password, newMasterUsername) {
    var self = this;
    var pendingAction = this.data.pendingAction;
    if (!pendingAction) {
      this.closePasswordModal();
      this.closeSelectMasterModal();
      return;
    }

    this.setData({ submitting: true });

    try {
      var user = this._ensureCurrentUser();
      var currentUserRes = await supabase.request('GET', TABLES.USERS, {
        username: 'eq.' + user.username,
        limit: 1
      });

      if (!currentUserRes || currentUserRes.length === 0 || currentUserRes[0].password !== password) {
        wx.showToast({ title: '密码错误', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }

      var targetUserRes = await supabase.request('GET', TABLES.USERS, {
        username: 'eq.' + pendingAction.username,
        limit: 1
      });

      if (!targetUserRes || targetUserRes.length === 0) {
        wx.showToast({ title: '目标账号不存在', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }

      var targetUserId = targetUserRes[0].id;
      var currentUserId = currentUserRes[0].id;

      await supabase.request('PATCH', TABLES.USERS + '?id=eq.' + currentUserId, null, {
        is_master: false,
        updated_at: new Date().toISOString()
      });

      await supabase.request('PATCH', TABLES.USERS + '?id=eq.' + targetUserId, null, {
        role: 'admin',
        is_master: true,
        updated_at: new Date().toISOString()
      });

      wx.showToast({ title: '主管理员权限转移成功', icon: 'success' });
      this.loadAccountList();
      this._refreshCurrentUserFromServer();

    } catch (err) {
      console.error('[_executePendingAction] 请求异常:', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
      this.closePasswordModal();
      this.closeSelectMasterModal();
    }
  },

  // ============================================================
  // 数据加载
  // ============================================================

  loadAccountList: async function(retryCount) {
    var self = this;
    if (typeof retryCount !== 'number' || retryCount < 0) {
      retryCount = 0;
    }

    var user = this._ensureCurrentUser();
    if (!user || !user.username) {
      console.warn('[loadAccountList] 用户身份为空');
      return;
    }

    if (this.data.loadingAccountList) {
      return;
    }
    this.setData({ loadingAccountList: true });

    try {
      var res = await supabase.request('GET', TABLES.USERS, {
        order: 'created_at.asc',
        limit: 100
      });

      if (res && res.error) {
        wx.showToast({ title: '加载失败', icon: 'none' });
        this.setData({ loadingAccountList: false });
        return;
      }

      var rawData = res || [];
      var accountList = [];

      for (var i = 0; i < rawData.length; i++) {
        var item = rawData[i];
        accountList.push({
          id: item.id,
          username: item.username || '',
          name: item.name || '',
          role: item.role || 'normal',
          isMaster: !!item.is_master,
          createTime: item.created_at || '',
          btnDisabled: this._computeBtnDisabled({ username: item.username, isMaster: !!item.is_master })
        });
      }

      this.setData({ accountList: accountList });
      console.log('[loadAccountList] 加载成功，共', accountList.length, '个账号');

    } catch (err) {
      console.error('[loadAccountList] 请求异常:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loadingAccountList: false });
    }
  },

  _loadCurrentUser: function() {
    try {
      var userInfo = wx.getStorageSync('adminUserInfo');
      if (!userInfo || !userInfo.username) {
        userInfo = wx.getStorageSync('userInfo');
      }
      if (userInfo && userInfo.username) {
        this.setData({ currentUser: userInfo });
        var app = getApp();
        if (app) {
          app.globalData.userInfo = userInfo;
          app.globalData.isLoggedIn = true;
          app.globalData.userRole = userInfo.role || 'normal';
        }
      }
    } catch (e) {
      console.error('[_loadCurrentUser] 获取当前用户信息失败', e);
    }
  },

  _refreshCurrentUserFromServer: async function(callback) {
    console.log('[_refreshCurrentUserFromServer] 开始从服务器刷新用户信息');
    var self = this;

    var cachedUser = wx.getStorageSync('adminUserInfo');
    if (!cachedUser || !cachedUser.username) {
      cachedUser = wx.getStorageSync('userInfo');
    }

    if (!cachedUser || !cachedUser.username) {
      this._loadCurrentUser();
      if (callback) callback(null);
      return;
    }

    try {
      var res = await supabase.request('GET', TABLES.USERS, {
        username: 'eq.' + cachedUser.username,
        limit: 1
      });

      if (res && res.length > 0) {
        var userInfo = {
          id: res[0].id,
          username: res[0].username,
          name: res[0].name,
          role: res[0].role,
          isMaster: !!res[0].is_master
        };

        wx.setStorageSync('userInfo', userInfo);
        wx.setStorageSync('adminUserInfo', userInfo);

        this.setData({ currentUser: userInfo }, function() {
          var app = getApp();
          if (app) {
            app.globalData.userInfo = userInfo;
            app.globalData.isLoggedIn = true;
            app.globalData.userRole = userInfo.role || 'normal';
          }

          self._refreshPermissionState();
          console.log('[_refreshCurrentUserFromServer] 刷新成功 isMaster:', userInfo.isMaster);
          if (callback) callback(userInfo);
        });
      } else {
        this._loadCurrentUser();
        if (callback) callback(null);
      }
    } catch (err) {
      console.error('[_refreshCurrentUserFromServer] 调用失败:', err);
      this._loadCurrentUser();
      if (callback) callback(null);
    }
  },

  // ============================================================
  // 页面登录与权限拦截
  // ============================================================

  handleAdminLogout: function() {
    var self = this;
    wx.showModal({
      title: '确认退出',
      content: '确定要退出管理员账号吗？',
      confirmText: '退出',
      cancelText: '取消',
      success: function(res) {
        if (res.confirm) {
          var isAdminEntry = wx.getStorageSync('isAdminEntry');

          wx.removeStorageSync('adminUserInfo');
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('isLoggedIn');
          wx.removeStorageSync('userRole');

          var app = getApp();
          if (app) {
            app.globalData.isLoggedIn = false;
            app.globalData.userRole = 'normal';
            app.globalData.userInfo = null;
          }

          if (isAdminEntry) {
            wx.setStorageSync('isAdminEntry', true);
          } else {
            wx.removeStorageSync('isAdminEntry');
          }

          wx.reLaunch({
            url: '/pages/login/login'
          });
        }
      }
    });
  },

  onLoad: function(options) {
    this._checkLoginStatus();
  },

  _checkLoginStatus: function() {
    var self = this;
    wx.showLoading({ title: '验证身份...', mask: true });

    try {
      var userInfo = wx.getStorageSync('adminUserInfo');
      if (!userInfo || !userInfo.username) {
        userInfo = wx.getStorageSync('userInfo');
      }

      if (userInfo && userInfo.username) {
        if (userInfo.role === 'normal') {
          wx.hideLoading();
          this.setData({ currentUser: userInfo });
          this._showAccessDenied();
          return;
        }

        this.setData({ currentUser: userInfo }, function() {
          var app = getApp();
          if (app) {
            app.globalData.userInfo = userInfo;
            app.globalData.isLoggedIn = true;
            app.globalData.userRole = userInfo.role || 'normal';
          }

          self._refreshPermissionState();
          self.loadAccountList();
          wx.hideLoading();
        });
        return;
      }
    } catch (e) {
      console.error('获取本地用户信息失败', e);
    }

    wx.hideLoading();
    this._redirectToLogin();
  },

  _showAccessDenied: function() {
    this.setData({ showAccessDenied: true });
    wx.showModal({
      title: '无权限访问',
      content: '员工账号无权进入管理页面，请联系管理员获取权限。',
      showCancel: false,
      confirmText: '返回登录',
      success: function() {
        this._redirectToLogin();
      }.bind(this)
    });
  },

  _redirectToLogin: function() {
    wx.reLaunch({ url: '/pages/login/login' });
  },

  // ============================================================
  // 页面生命周期
  // ============================================================

  onReady: function() {},

  onShow: function() {
    var self = this;
    this._refreshCurrentUserFromServer(function(userInfo) {
      if (userInfo && userInfo.username) {
        if (!self._checkIsEmployee()) {
          self.loadAccountList();
        }
      } else {
        self._checkLoginStatus();
      }
    });
  },

  onHide: function() {},

  onUnload: function() {},

  onPullDownRefresh: function() {
    this.setData({
      showCreateFormFlag: false,
      showUpdateFormFlag: false,
      showResetFormFlag: false,
      showPasswordModal: false,
      showSelectMasterModal: false,
      formData: { username: '', password: '', confirmPassword: '', name: '', role: 'normal' },
      passwordForm: { username: '', oldPassword: '', newPassword: '', confirmPassword: '' },
      resetForm: { username: '', newPassword: '', confirmPassword: '' },
      passwordModal: { password: '' },
      pendingAction: null,
      selectedNewMaster: ''
    });

    var user = this._ensureCurrentUser();
    if (user && !this._checkIsEmployee()) {
      this._refreshPermissionState();
      this.loadAccountList();
    } else {
      this._checkLoginStatus();
    }

    setTimeout(function() { wx.stopPullDownRefresh(); }, 1000);
  },

  onReachBottom: function() {},

  onShareAppMessage: function() {}
});
