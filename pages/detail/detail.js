/**
 * 商品详情页面
 * 功能调整：
 * 1. 显示物品编号（itemCode，只读）
 * 2. 商品名称可编辑
 * 【修改】已迁移到 Supabase 后端
 */
const { supabase, TABLES } = require('../../utils/supabase.js');

Page({
  data: {
    goods: null,
    editMode: false,
    loading: false,
    formattedTime: '',
    showPositionPicker: false,
    editData: {
      name: '',
      location: '',
      price: ''
    }
  },

  // 适配商品数据
  adaptGoodsData(item) {
    if (!item) return null;
    return Object.assign({}, item, {
      _id: item.id,
      stock: item.current_stock || item.stock || 0,
      updateTime: item.updated_at || item.updateTime,
      itemCode: item.barcode || ''
    });
  },

  // 格式化时间
  formatTime(date) {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '-';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  },

  onLoad(options) {
    if (options.id) {
      this.loadGoodsById(options.id);
    } else if (options.code) {
      this.loadGoodsByCode(options.code);
    }
  },

  // 根据ID加载商品 - 使用 Supabase
  async loadGoodsById(id) {
    this.setData({ loading: true });
    console.log('[loadGoodsById] 加载商品，id:', id);
    
    try {
      const res = await supabase.request('GET', TABLES.GOODS, {
        select: '*',
        id: `eq.${id}`,
        limit: 1
      });
      
      console.log('[loadGoodsById] Supabase 返回:', JSON.stringify(res));
      
      if (res && res.length > 0) {
        const goods = this.adaptGoodsData(res[0]);
        this.setData({
          goods: goods,
          'editData.name': goods.name || '',
          'editData.location': goods.location || '',
          'editData.price': goods.price || '',
          formattedTime: this.formatTime(goods.updated_at || goods.updateTime),
          loading: false
        });
      } else {
        this.setData({ loading: false });
        wx.showToast({ title: '商品不存在', icon: 'none' });
      }
    } catch (err) {
      console.error('[loadGoodsById] 加载失败:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请检查网络', icon: 'none' });
    }
  },

  // 根据物品编号加载商品 - 使用 Supabase
  async loadGoodsByCode(code) {
    this.setData({ loading: true });
    console.log('[loadGoodsByCode] 加载商品，code:', code);
    
    try {
      const res = await supabase.request('GET', TABLES.GOODS, {
        select: '*',
        barcode: `eq.${code}`,
        limit: 1
      });
      
      console.log('[loadGoodsByCode] Supabase 返回:', JSON.stringify(res));
      
      if (res && res.length > 0) {
        const goods = this.adaptGoodsData(res[0]);
        this.setData({
          goods: goods,
          'editData.name': goods.name || '',
          'editData.location': goods.location || '',
          'editData.price': goods.price || '',
          formattedTime: this.formatTime(goods.updated_at || goods.updateTime),
          loading: false
        });
      } else {
        this.setData({ loading: false });
        wx.showToast({ title: '商品不存在', icon: 'none' });
        setTimeout(() => { wx.navigateBack(); }, 1500);
      }
    } catch (err) {
      console.error('[loadGoodsByCode] 加载失败:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请检查网络', icon: 'none' });
    }
  },

  // 进入编辑模式
  enterEditMode() {
    const { goods } = this.data;
    this.setData({
      editMode: true,
      editData: {
        name: goods.name || '',
        location: goods.location || '',
        price: goods.price || ''
      }
    });
  },

  // 取消编辑
  cancelEdit() {
    this.setData({ editMode: false });
  },

  // 编辑数据输入
  onEditInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`editData.${field}`]: value
    });
  },

  // 选择位置 - 打开位置选择器
  onSelectPosition() {
    this.setData({ showPositionPicker: true });
  },

  // 位置选择确认
  onPositionConfirm(e) {
    const result = e.detail;
    const location = result && result.code;
    if (!location) {
      wx.showToast({ title: '位置选择失败', icon: 'none' });
      return;
    }
    this.setData({
      showPositionPicker: false,
      'editData.location': location
    });
    // 自动保存位置
    this.updateLocationDirect(location);
  },

  // 位置选择取消
  onPositionCancel() {
    this.setData({ showPositionPicker: false });
  },

  // 直接更新位置（不进入编辑模式）- 使用 Supabase
  async updateLocationDirect(location) {
    const { goods } = this.data;
    
    if (!location || location.length < 3) {
      wx.showToast({ title: '请选择有效位置', icon: 'none' });
      return;
    }

    console.log('[updateLocationDirect] 更新商品位置，goodsId:', goods.id || goods._id, 'location:', location);
    
    wx.showLoading({ title: '更新中...' });
    
    try {
      const goodsId = goods.id || goods._id;
      const updateData = {
        location: location,
        updated_at: new Date().toISOString()
      };
      
      const res = await supabase.request('PATCH', `${TABLES.GOODS}?id=eq.${goodsId}`, null, updateData);
      
      console.log('[updateLocationDirect] Supabase 返回:', JSON.stringify(res));
      
      wx.hideLoading();
      
      if (res.error) {
        wx.showToast({ title: '更新失败: ' + res.error.message, icon: 'none' });
        return;
      }
      
      const now = new Date();
      this.setData({
        'goods.location': location,
        'goods.updated_at': now.toISOString(),
        'goods.updateTime': now,
        formattedTime: this.formatTime(now)
      });
      wx.showToast({ title: '位置已更新', icon: 'success' });
    } catch (err) {
      console.error('[updateLocationDirect] 更新失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  // 商品名称编辑输入 - 实时转换为大写字母
  onNameEditInput(e) {
    const value = e.detail.value;
    // 将输入转换为大写
    const upperValue = value.toUpperCase();
    this.setData({
      'editData.name': upperValue
    });
  },

  // 更新商品名称 - 使用 Supabase
  async updateName() {
    const { goods, editData } = this.data;
    const name = editData.name.trim();
    
    if (!name) {
      wx.showToast({ title: '商品名称不能为空', icon: 'none' });
      return;
    }

    console.log('[updateName] 更新商品名称，goodsId:', goods.id || goods._id, 'name:', name);
    
    wx.showLoading({ title: '更新中...' });
    
    try {
      const goodsId = goods.id || goods._id;
      const updateData = {
        name: name,
        updated_at: new Date().toISOString()
      };
      
      const res = await supabase.request('PATCH', `${TABLES.GOODS}?id=eq.${goodsId}`, null, updateData);
      
      console.log('[updateName] Supabase 返回:', JSON.stringify(res));
      
      wx.hideLoading();
      
      if (res.error) {
        wx.showToast({ title: '更新失败: ' + res.error.message, icon: 'none' });
        return;
      }
      
      const now = new Date();
      this.setData({
        'goods.name': name,
        'goods.updated_at': now.toISOString(),
        'goods.updateTime': now,
        formattedTime: this.formatTime(now),
        editMode: false
      });
      wx.showToast({ title: '商品名称已更新', icon: 'success' });
    } catch (err) {
      console.error('[updateName] 更新失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  // 更新位置 - 使用 Supabase
  async updateLocation() {
    const { goods, editData } = this.data;
    const location = editData.location;
    const LOCATION_NEW_REGEX = /^[^-]+-[^-]+(?:-L\d+)?$/;
    
    // 支持新格式 (1F-H03-L2) 或旧格式数字 (1-9999)
    if (LOCATION_NEW_REGEX.test(location)) {
      // 新格式，验证基本格式
      if (location.length < 3) {
        wx.showToast({ title: '位置格式不正确', icon: 'none' });
        return;
      }
    } else {
      // 旧格式数字验证
      const num = parseInt(location) || 0;
      if (num < 1 || num > 9999) {
        wx.showToast({ title: '位置需在1-9999之间', icon: 'none' });
        return;
      }
    }

    console.log('[updateLocation] 更新商品位置，goodsId:', goods.id || goods._id, 'location:', location);
    
    wx.showLoading({ title: '更新中...' });
    
    try {
      const goodsId = goods.id || goods._id;
      const updateData = {
        location: location,
        updated_at: new Date().toISOString()
      };
      
      const res = await supabase.request('PATCH', `${TABLES.GOODS}?id=eq.${goodsId}`, null, updateData);
      
      console.log('[updateLocation] Supabase 返回:', JSON.stringify(res));
      
      wx.hideLoading();
      
      if (res.error) {
        wx.showToast({ title: '更新失败: ' + res.error.message, icon: 'none' });
        return;
      }
      
      const now = new Date();
      this.setData({
        'goods.location': location,
        'goods.updated_at': now.toISOString(),
        'goods.updateTime': now,
        formattedTime: this.formatTime(now),
        editMode: false
      });
      wx.showToast({ title: '位置已更新', icon: 'success' });
    } catch (err) {
      console.error('[updateLocation] 更新失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  // 更新售价 - 使用 Supabase
  async updatePrice() {
    const { goods, editData } = this.data;
    const price = parseFloat(editData.price) || 0;

    console.log('[updatePrice] 更新商品售价，goodsId:', goods.id || goods._id, 'price:', price);
    
    wx.showLoading({ title: '更新中...' });
    
    try {
      const goodsId = goods.id || goods._id;
      const updateData = {
        price: price,
        updated_at: new Date().toISOString()
      };
      
      const res = await supabase.request('PATCH', `${TABLES.GOODS}?id=eq.${goodsId}`, null, updateData);
      
      console.log('[updatePrice] Supabase 返回:', JSON.stringify(res));
      
      wx.hideLoading();
      
      if (res.error) {
        wx.showToast({ title: '更新失败: ' + res.error.message, icon: 'none' });
        return;
      }
      
      const now = new Date();
      this.setData({
        'goods.price': price,
        'goods.updated_at': now.toISOString(),
        'goods.updateTime': now,
        formattedTime: this.formatTime(now),
        editMode: false
      });
      wx.showToast({ title: '售价已更新', icon: 'success' });
    } catch (err) {
      console.error('[updatePrice] 更新失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  // 快速入库
  quickStockIn() {
    wx.showModal({
      title: '入库数量',
      editable: true,
      placeholderText: '请输入入库数量',
      success: async (res) => {
        if (res.confirm && res.content) {
          const qty = parseInt(res.content);
          if (isNaN(qty) || qty <= 0) {
            wx.showToast({ title: '请输入有效数量', icon: 'none' });
            return;
          }
          await this.doStockChange(qty);
        }
      }
    });
  },

  // 快速出库
  quickStockOut() {
    const { goods } = this.data;
    const currentStock = goods.current_stock || goods.stock || 0;
    if (currentStock <= 0) {
      wx.showToast({ title: '库存不足，无法出库', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '出库数量',
      editable: true,
      placeholderText: '请输入出库数量',
      success: async (res) => {
        if (res.confirm && res.content) {
          const qty = parseInt(res.content);
          if (isNaN(qty) || qty <= 0) {
            wx.showToast({ title: '请输入有效数量', icon: 'none' });
            return;
          }
          if (qty > currentStock) {
            wx.showToast({ title: '库存不足，无法出库', icon: 'none' });
            return;
          }
          await this.doStockChange(-qty);
        }
      }
    });
  },

  // 执行库存变动 - 使用 Supabase
  async doStockChange(change) {
    const { goods } = this.data;
    const goodsId = goods.id || goods._id;
    const currentStock = goods.current_stock || goods.stock || 0;
    const newStock = currentStock + change;

    console.log('[doStockChange] 库存变动，goodsId:', goodsId, 'change:', change, 'newStock:', newStock);
    
    wx.showLoading({ title: '处理中...' });
    
    try {
      const updateData = {
        current_stock: newStock,
        updated_at: new Date().toISOString()
      };
      
      const res = await supabase.request('PATCH', `${TABLES.GOODS}?id=eq.${goodsId}`, null, updateData);
      
      console.log('[doStockChange] Supabase 返回:', JSON.stringify(res));
      
      if (res && res.error) {
        wx.hideLoading();
        wx.showToast({ title: '操作失败: ' + res.error.message, icon: 'none' });
        return;
      }
      
      // 如果是出库（change < 0），创建出库记录（不阻塞主流程）
      if (change < 0) {
        const recordData = {
          goods_id: goodsId,
          type: 'out',
          quantity: Math.abs(change),
          before_stock: currentStock,
          after_stock: newStock,
          record_date: new Date().toISOString().split('T')[0]
        };
        
        console.log('[doStockChange] 创建出库记录:', JSON.stringify(recordData));
        try {
          const recordRes = await supabase.request('POST', TABLES.RECORDS, null, recordData);
          console.log('[doStockChange] 出库记录创建结果:', JSON.stringify(recordRes));
        } catch (recordErr) {
          console.error('[doStockChange] 创建出库记录失败（不影响出库）:', recordErr);
        }
      }
      
      const now = new Date();
      this.setData({
        'goods.current_stock': newStock,
        'goods.stock': newStock,
        'goods.updated_at': now.toISOString(),
        'goods.updateTime': now,
        formattedTime: this.formatTime(now)
      });
      wx.showToast({ title: change > 0 ? '入库成功' : '出库成功', icon: 'success' });
      
      // 刷新首页列表
      const pages = getCurrentPages();
      if (pages.length > 1) {
        const prevPage = pages[pages.length - 2];
        if (prevPage && prevPage.loadGoodsList) {
          prevPage.loadGoodsList();
        }
      }
      
      // 如果是出库，通知出库记录页面刷新
      if (change < 0) {
        const eventChannel = this.getOpenerEventChannel();
        if (eventChannel && eventChannel.emit) {
          eventChannel.emit('refreshRecords');
        }
      }
    } catch (err) {
      console.error('[doStockChange] 操作失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 删除商品 - 使用 Supabase
  async deleteGoods() {
    const { goods } = this.data;
    const goodsId = goods.id || goods._id;
    
    if (!goodsId) {
      wx.showToast({ title: '商品信息无效', icon: 'none' });
      return;
    }
    
    console.log('[deleteGoods] 开始删除商品，goodsId:', goodsId);
    
    wx.showModal({
      title: '确认删除',
      content: '删除商品将同步清除所有相关出库记录，此操作不可恢复！',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          
          console.log('[deleteGoods] 调用 Supabase 删除');
          
          try {
            const deleteRes = await supabase.request('DELETE', `${TABLES.GOODS}?id=eq.${goodsId}`);
            
            console.log('[deleteGoods] Supabase 返回:', JSON.stringify(deleteRes));
            
            if (deleteRes && deleteRes.error) {
              console.error('[deleteGoods] 删除失败:', deleteRes.error.message);
              wx.hideLoading();
              wx.showToast({ title: '删除失败: ' + deleteRes.error.message, icon: 'none' });
              return;
            }
            
            console.log('[deleteGoods] 删除成功');
            wx.hideLoading();
            wx.showToast({ title: '删除成功', icon: 'success' });
            
            setTimeout(() => {
              const pages = getCurrentPages();
              if (pages.length > 1) {
                const prevPage = pages[pages.length - 2];
                if (prevPage && prevPage.loadGoodsList) {
                  prevPage.loadGoodsList();
                }
              }
              wx.navigateBack();
            }, 1500);
            
          } catch (err) {
            console.error('[deleteGoods] 捕获到异常:', err);
            wx.hideLoading();
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  }
});
