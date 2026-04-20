/**
 * 隐藏界面页 - 开发者选项
 * 【修改】已迁移到 Supabase 后端
 */
const { supabase, TABLES } = require('../../utils/supabase.js');

Page({
  data: {
    isVerified: false,
    goodsList: [],
    loading: false,
    showCostModal: false,
    editingGoods: null,
    editingCost: '',
    showPasswordModal: false,
    newPassword: '',
    confirmPassword: ''
  },

  onLoad() {
    this.checkVerification();
  },

  // 检查密码验证状态
  checkVerification() {
    const verified = wx.getStorageSync('hiddenVerified');
    const verifyTime = wx.getStorageSync('hiddenVerifiedTime');
    
    if (verified && verifyTime && (Date.now() - verifyTime < 3600000)) {
      this.setData({ isVerified: true });
      this.loadGoodsList();
    } else {
      this.showPasswordInput();
    }
  },

  // 弹出密码输入框
  showPasswordInput() {
    const that = this;
    
    wx.showModal({
      title: '请输入密码',
      placeholderText: '请输入访问密码',
      editable: true,
      success(res) {
        if (res.confirm && res.content) {
          that.verifyPassword(res.content);
        } else {
          wx.navigateBack();
        }
      }
    });
  },

  // 验证密码 - 使用 Supabase
  async verifyPassword(password) {
    try {
      // 从 settings 表获取密码
      const res = await supabase.request('GET', TABLES.SETTINGS, {
        key: `eq.hiddenPassword`,
        limit: 1
      });
      
      let correctPassword = '123456';
      if (res && res.length > 0 && res[0].value) {
        correctPassword = res[0].value;
      }
      
      if (password === correctPassword) {
        wx.setStorageSync('hiddenVerified', true);
        wx.setStorageSync('hiddenVerifiedTime', Date.now());
        
        this.setData({ isVerified: true });
        this.loadGoodsList();
        
        wx.showToast({ title: '验证成功', icon: 'success' });
      } else {
        wx.showToast({ title: '密码错误', icon: 'none' });
        setTimeout(() => { wx.navigateBack(); }, 1500);
      }
    } catch (err) {
      console.error('验证失败', err);
      if (password === '123456') {
        wx.setStorageSync('hiddenVerified', true);
        wx.setStorageSync('hiddenVerifiedTime', Date.now());
        this.setData({ isVerified: true });
        this.loadGoodsList();
      } else {
        wx.showToast({ title: '密码错误', icon: 'none' });
        setTimeout(() => { wx.navigateBack(); }, 1500);
      }
    }
  },

  // 加载商品列表 - 使用 Supabase
  async loadGoodsList() {
    this.setData({ loading: true });
    console.log('[loadGoodsList] 开始加载商品列表');
    
    try {
      const res = await supabase.request('GET', TABLES.GOODS, {
        limit: 1000
      });
      
      console.log('[loadGoodsList] Supabase 返回:', JSON.stringify(res));
      
      if (res && res.length > 0) {
        // 适配数据格式
        const adaptedList = res.map(item => Object.assign({}, item, {
          _id: item.id,
          stock: item.current_stock || item.stock || 0,
          costPrice: item.cost_price || item.costPrice,
          itemCode: item.barcode || ''
        }));
        
        this.setData({
          goodsList: adaptedList,
          loading: false
        });
        console.log('[loadGoodsList] 加载成功，共', res.length, '条');
      } else {
        console.error('[loadGoodsList] 加载失败');
        this.setData({ loading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    } catch (err) {
      console.error('[loadGoodsList] 加载失败:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 点击进价，弹出编辑框
  showCostEdit(e) {
    const goods = e.currentTarget.dataset.goods;
    this.setData({
      showCostModal: true,
      editingGoods: goods,
      editingCost: goods.costPrice || goods.cost_price || ''
    });
  },

  // 关闭进价弹窗
  closeCostModal() {
    this.setData({
      showCostModal: false,
      editingGoods: null,
      editingCost: ''
    });
  },

  // 进价输入
  onCostInput(e) {
    this.setData({ editingCost: e.detail.value });
  },

  // 保存进价 - 使用 Supabase
  async saveCost() {
    const { editingGoods, editingCost } = this.data;
    const goodsId = editingGoods.id || editingGoods._id;
    if (!goodsId) return;
    
    const cost = parseFloat(editingCost) || 0;
    
    console.log('[saveCost] 更新进价，goodsId:', goodsId, 'cost:', cost);
    
    wx.showLoading({ title: '更新中...' });
    
    try {
      const updateData = {
        cost_price: cost,
        updated_at: new Date().toISOString()
      };
      
      const res = await supabase.request('PATCH', `${TABLES.GOODS}?id=eq.${goodsId}`, null, updateData);
      
      console.log('[saveCost] Supabase 返回:', JSON.stringify(res));
      
      wx.hideLoading();
      
      if (res && res.error) {
        wx.showToast({ title: '更新失败: ' + res.error.message, icon: 'none' });
        return;
      }
      
      // 更新本地数据
      const goodsList = this.data.goodsList.map(item => {
        if ((item.id || item._id) === goodsId) {
          return Object.assign({}, item, { cost_price: cost, costPrice: cost, updateTime: new Date().toLocaleString() });
        }
        return item;
      });
      
      this.setData({
        goodsList,
        showCostModal: false,
        editingGoods: null,
        editingCost: ''
      });
      
      wx.showToast({ title: '进价已更新', icon: 'success' });
    } catch (err) {
      console.error('[saveCost] 更新进价失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

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
    this.setData({
      showPasswordModal: false,
      newPassword: '',
      confirmPassword: ''
    });
  },

  // 新密码输入
  onNewPasswordInput(e) {
    this.setData({ newPassword: e.detail.value });
  },

  // 确认密码输入
  onConfirmPasswordInput(e) {
    this.setData({ confirmPassword: e.detail.value });
  },

  // 保存新密码 - 使用 Supabase
  async saveNewPassword() {
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
      
      wx.setStorageSync('hiddenVerified', true);
      wx.setStorageSync('hiddenVerifiedTime', Date.now());
      
      this.setData({ showPasswordModal: false });
      wx.showToast({ title: '密码已修改', icon: 'success' });
    } catch (err) {
      console.error('修改密码失败', err);
      wx.showToast({ title: '修改失败', icon: 'none' });
    }
  },

  // 导出数据 - 使用 Supabase
  async exportData() {
    wx.showLoading({ title: '正在导出...' });
    
    try {
      const res = await supabase.request('GET', TABLES.GOODS, {
        limit: 1000
      });
      
      wx.hideLoading();
      
      if (!res || res.length === 0) {
        wx.showToast({ title: '获取数据失败', icon: 'none' });
        return;
      }
      
      const goodsList = res || [];
      
      if (goodsList.length === 0) {
        wx.showToast({ title: '没有数据可导出', icon: 'none' });
        return;
      }

      const jsonData = JSON.stringify(goodsList, null, 2);
      
      const headers = ['名称', '批次号', '条码', '位置', '库存', '售价', '进价', '更新时间'];
      const csvRows = [headers.join(',')];
      
      goodsList.forEach(item => {
        const row = [
          item.name || '',
          item.batch_no || item.batchNo || '',
          item.barcode || item.itemCode || '',
          item.location || '',
          item.current_stock || item.stock || '',
          item.price || '',
          item.cost_price || item.costPrice || '',
          item.updated_at || item.updateTime || ''
        ];
        csvRows.push(row.map(val => `"${val}"`).join(','));
      });
      const csvData = csvRows.join('\n');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      const jsonFileName = `goods_export_${timestamp}.json`;
      const jsonFilePath = `${wx.env.USER_DATA_PATH}/${jsonFileName}`;
      
      const fs = wx.getFileSystemManager();
      await fs.writeFile({
        filePath: jsonFilePath,
        data: jsonData,
        encoding: 'utf8'
      });

      const csvFileName = `goods_export_${timestamp}.csv`;
      const csvFilePath = `${wx.env.USER_DATA_PATH}/${csvFileName}`;
      
      await fs.writeFile({
        filePath: csvFilePath,
        data: '\ufeff' + csvData,
        encoding: 'utf8'
      });

      wx.showModal({
        title: '导出成功',
        content: `文件已保存:\n${jsonFileName}\n${csvFileName}`,
        showCancel: false
      });
      
    } catch (err) {
      console.error('导出失败', err);
      wx.hideLoading();
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },

  // 清除所有数据 - 使用 Supabase
  async clearAllData() {
    wx.showModal({
      title: '确认清除',
      content: '将清除所有商品数据，此操作不可恢复！',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '清除中...' });
          
          console.log('[clearAllData] 开始清除所有商品');
          
          try {
            // 获取所有商品
            const listRes = await supabase.request('GET', TABLES.GOODS, {
              select: 'id',
              limit: 1000
            });
            
            if (!listRes || listRes.length === 0) {
              wx.hideLoading();
              wx.showToast({ title: '获取商品列表失败', icon: 'none' });
              return;
            }
            
            const goodsList = listRes || [];
            console.log('[clearAllData] 找到', goodsList.length, '条商品');
            
            // 逐个删除
            for (const goods of goodsList) {
              await supabase.request('DELETE', `${TABLES.GOODS}?id=eq.${goods.id}`);
            }
            
            wx.hideLoading();
            wx.showToast({ title: '清除成功', icon: 'success' });
            this.loadGoodsList();
            
          } catch (err) {
            console.error('[clearAllData] 清除失败:', err);
            wx.hideLoading();
            wx.showToast({ title: '清除失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 测试 Supabase 连接
  testConnection() {
    supabase.request('GET', TABLES.GOODS, { limit: 1 }).then(res => {
      console.log('Supabase 返回', res);
      wx.showToast({ title: '连接成功', icon: 'success' });
    }).catch(err => {
      console.error('连接失败', err);
      wx.showToast({ title: '连接失败', icon: 'none' });
    });
  }
});
