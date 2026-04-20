/**
 * 设置页面
 * 【修改】已迁移到 Supabase 后端
 */
const { supabase, TABLES } = require('../../utils/supabase.js');

Page({
  data: {
    // 扫描字段配置
    scanFields: [],
    
    // 隐藏界面密码
    hiddenPassword: '',
    
    // 弹窗状态
    showAddFieldModal: false,
    showEditFieldModal: false,
    showPasswordModal: false,
    showClearDataModal: false,
    
    // 临时数据
    tempField: { field: '', label: '', enabled: true, required: false },
    editingFieldIndex: -1,
    newPassword: '',
    confirmPassword: ''
  },

  onLoad() {
    this.loadSettings();
  },

  // 加载设置
  async loadSettings() {
    try {
      // 加载扫描字段配置
      const fieldsRes = await supabase.request('GET', TABLES.SETTINGS, {
        key: `eq.scanFieldsConfig`,
        limit: 1
      });
      
      if (fieldsRes && fieldsRes.length > 0 && fieldsRes[0].value) {
        this.setData({ scanFields: fieldsRes[0].value });
      } else {
        // 默认配置
        this.setData({
          scanFields: [
            { field: 'name', label: '商品名称', enabled: true, required: true },
            { field: 'batchNo', label: '批次号', enabled: true, required: false }
          ]
        });
      }
      
      // 加载隐藏界面密码
      const passwordRes = await supabase.request('GET', TABLES.SETTINGS, {
        key: `eq.hiddenPassword`,
        limit: 1
      });
      
      if (passwordRes && passwordRes.length > 0) {
        this.setData({ hiddenPassword: passwordRes[0].value });
      }
    } catch (err) {
      console.error('加载设置失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 保存扫描字段配置
  async saveScanFields() {
    try {
      // 查询是否已有配置
      const res = await supabase.request('GET', TABLES.SETTINGS, {
        key: `eq.scanFieldsConfig`,
        limit: 1
      });
      
      if (res && res.length > 0) {
        // 更新
        const settingId = res[0].id;
        await supabase.request('PATCH', `${TABLES.SETTINGS}?id=eq.${settingId}`, null, {
          value: this.data.scanFields,
          updated_at: new Date().toISOString()
        });
      } else {
        // 新增
        await supabase.request('POST', TABLES.SETTINGS, null, {
          key: 'scanFieldsConfig',
          value: this.data.scanFields,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (err) {
      console.error('保存失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // ========== 字段管理 ==========

  // 显示添加字段弹窗
  showAddFieldModal() {
    this.setData({
      showAddFieldModal: true,
      tempField: { field: '', label: '', enabled: true, required: false }
    });
  },

  // 关闭添加字段弹窗
  closeAddFieldModal() {
    this.setData({ showAddFieldModal: false });
  },

  // 字段key输入
  onFieldKeyInput(e) {
    this.setData({ 'tempField.field': e.detail.value });
  },

  // 字段标签输入
  onFieldLabelInput(e) {
    this.setData({ 'tempField.label': e.detail.value });
  },

  // 临时字段开关
  onTempFieldSwitch(e) {
    this.setData({ 'tempField.enabled': e.detail.value });
  },

  // 添加字段
  addField() {
    const { tempField, scanFields } = this.data;
    
    if (!tempField.field || !tempField.label) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }
    
    // 检查字段key是否已存在
    if (scanFields.some(f => f.field === tempField.field)) {
      wx.showToast({ title: '字段key已存在', icon: 'none' });
      return;
    }
    
    this.setData({
      scanFields: scanFields.concat([Object.assign({}, tempField)]),
      showAddFieldModal: false
    });
    
    this.saveScanFields();
  },

  // 显示编辑字段弹窗
  showEditFieldModal(e) {
    const index = e.currentTarget.dataset.index;
    const field = this.data.scanFields[index];
    
    this.setData({
      showEditFieldModal: true,
      editingFieldIndex: index,
      tempField: Object.assign({}, field)
    });
  },

  // 关闭编辑字段弹窗
  closeEditFieldModal() {
    this.setData({ showEditFieldModal: false, editingFieldIndex: -1 });
  },

  // 编辑字段标签输入
  onEditFieldLabelInput(e) {
    this.setData({ 'tempField.label': e.detail.value });
  },

  // 编辑字段开关
  onEditFieldSwitch(e) {
    this.setData({ 'tempField.enabled': e.detail.value });
  },

  // 保存编辑
  saveFieldEdit() {
    const { tempField, editingFieldIndex, scanFields } = this.data;
    
    if (!tempField.field || !tempField.label) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }
    
    const newFields = scanFields.slice();
    newFields[editingFieldIndex] = Object.assign({}, tempField);
    
    this.setData({
      scanFields: newFields,
      showEditFieldModal: false,
      editingFieldIndex: -1
    });
    
    this.saveScanFields();
  },

  // 删除字段
  deleteField(e) {
    const index = e.currentTarget.dataset.index;
    const field = this.data.scanFields[index];
    
    if (field.required) {
      wx.showToast({ title: '必填字段不能删除', icon: 'none' });
      return;
    }
    
    const that = this;
    wx.showModal({
      title: '确认删除',
      content: `确定要删除字段"${field.label}"吗？`,
      success(res) {
        if (res.confirm) {
          const newFields = that.data.scanFields.slice();
          newFields.splice(index, 1);
          that.setData({ scanFields: newFields });
          that.saveScanFields();
        }
      }
    });
  },

  // 切换字段启用状态
  toggleFieldEnabled(e) {
    const index = e.currentTarget.dataset.index;
    const scanFields = this.data.scanFields.slice();
    scanFields[index].enabled = !scanFields[index].enabled;
    
    this.setData({ scanFields });
    this.saveScanFields();
  },

  // ========== 密码管理 ==========

  // 显示修改密码弹窗
  showPasswordModal() {
    this.setData({
      showPasswordModal: true,
      newPassword: '',
      confirmPassword: ''
    });
  },

  // 关闭修改密码弹窗
  closePasswordModal() {
    this.setData({ showPasswordModal: false });
  },

  // 新密码输入
  onNewPasswordInput(e) {
    this.setData({ newPassword: e.detail.value });
  },

  // 确认密码输入
  onConfirmPasswordInput(e) {
    this.setData({ confirmPassword: e.detail.value });
  },

  // 保存新密码
  async savePassword() {
    const { newPassword, confirmPassword } = this.data;
    
    if (!newPassword || newPassword.length < 6) {
      wx.showToast({ title: '密码至少6位', icon: 'none' });
      return;
    }
    
    if (newPassword !== confirmPassword) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' });
      return;
    }
    
    try {
      // 查询是否已有设置
      const res = await supabase.request('GET', TABLES.SETTINGS, {
        key: `eq.hiddenPassword`,
        limit: 1
      });
      
      if (res && res.length > 0) {
        // 更新
        const settingId = res[0].id;
        await supabase.request('PATCH', `${TABLES.SETTINGS}?id=eq.${settingId}`, null, {
          value: newPassword,
          updated_at: new Date().toISOString()
        });
      } else {
        // 新增
        await supabase.request('POST', TABLES.SETTINGS, null, {
          key: 'hiddenPassword',
          value: newPassword,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      
      this.setData({
        hiddenPassword: newPassword,
        showPasswordModal: false
      });
      
      wx.showToast({ title: '密码已修改', icon: 'success' });
    } catch (err) {
      console.error('修改密码失败', err);
      wx.showToast({ title: '修改失败', icon: 'none' });
    }
  },

  // ========== 数据管理 ==========

  // 清空所有数据
  showClearDataModal() {
    this.setData({ showClearDataModal: true });
  },

  // 关闭清空数据弹窗
  closeClearDataModal() {
    this.setData({ showClearDataModal: false });
  },

  // 确认清空数据
  async clearAllData() {
    try {
      // 先获取所有商品
      const goodsRes = await supabase.request('GET', TABLES.GOODS, {
        select: 'id',
        limit: 1000
      });
      
      if (!goodsRes || goodsRes.length === 0) {
        wx.showToast({ title: '暂无数据', icon: 'none' });
        this.setData({ showClearDataModal: false });
        return;
      }
      
      // 逐个删除
      for (const item of goodsRes) {
        await supabase.request('DELETE', `${TABLES.GOODS}?id=eq.${item.id}`);
      }
      
      this.setData({ showClearDataModal: false });
      wx.showToast({ title: '数据已清空', icon: 'success' });
    } catch (err) {
      console.error('清空数据失败', err);
      wx.showToast({ title: '清空失败', icon: 'none' });
    }
  },

  // 清除本地缓存
  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除本地缓存吗？',
      success: res => {
        if (res.confirm) {
          wx.clearStorageSync();
          wx.showToast({ title: '已清除', icon: 'success' });
        }
      }
    });
  },

  // 关于
  showAbout() {
    wx.showModal({
      title: '关于',
      content: '库存管理助手 v2.0.0\n\n基于 Supabase 后端',
      showCancel: false
    });
  }
});
