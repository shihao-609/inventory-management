/**
 * 扫描录入页面
 * 核心功能重构：
 * 1. 入库扫描模式：扫码入库，支持库存修改
 * 2. 物品查询模式：仅查询信息，隐藏进价，库存警示
 * 3. 新增模式：手动新增商品
 * 
 * 已迁移到 Supabase 后端
 */
const { supabase, TABLES } = require('../../utils/supabase.js');

// 适配商品数据字段（Supabase -> 小程序兼容格式）
function adaptGoodsData(item) {
  if (!item) return null;
  return Object.assign({}, item, {
    _id: item.id,
    stock: item.current_stock || item.stock || 0,
    updateTime: item.updated_at || item.updateTime,
    itemCode: item.barcode || ''
  });
}

// 适配搜索结果
function adaptSearchResults(items) {
  if (!items || !Array.isArray(items)) return [];
  return items.map(item => adaptGoodsData(item));
}

Page({
  data: {
    // 主模式：stockIn-入库扫描, query-物品查询, add-手动新增
    mainMode: 'stockIn',
    
    // 扫码状态
    isFromScan: false,
    scanResult: '',
    
    // 表单数据
    formData: {
      itemCode: '',
      name: '',
      location: '',
      price: '',
      costPrice: '',
      stock: 0
    },
    
    
    
    // 新增：本次进货数量（默认显示）
    purchaseQuantity: '',
    
    // 新增：库存修改开关（盘库专用，默认关闭）
    enableStockEdit: false,
    
    // 进价相关
    showCostPrice: true,      // 进价折叠面板展开状态（默认展开）
    
    // 物品查询模式：进价触发相关
    clickCount: 0,             // 库存区域点击次数计数
    lastClickTime: 0,          // 上次点击时间（用于判断连续点击）
    
    // 现有商品信息
    existingGoods: null,
    isNewGoods: true,
    
    // 加载状态
    loading: false,

    // 手动入库模式：下拉搜索相关
    searchKeyword: '',         // 搜索关键词
    searchResults: [],         // 搜索结果列表
    showDropdown: false,       // 是否显示下拉列表
    selectedIndex: -1,         // 选中的索引
    dropdownClosing: false,    // 下拉框是否正在等待关闭

    // 位置选择相关
    showPositionPicker: false,  // 是否显示位置选择弹窗

    // 出库弹窗相关
    showOutboundModal: false,   // 是否显示出库弹窗
    outboundQuantity: 1,        // 出库数量
    outboundPrice: 0,           // 出库售价
    enablePriceEdit: false      // 售价编辑开关
  },

  onLoad(options) {
    // 处理传入参数 - 支持从首页传入mode
    let mainMode = 'stockIn';
    if (options.mode === 'stockIn') {
      mainMode = 'stockIn';
      this.setData({ mainMode });
      // 入库扫描模式：自动启动扫码
      if (options.autoScan === '1') {
        setTimeout(() => {
          this.scanCode();
        }, 500);
      }
    } else if (options.mode === 'query') {
      mainMode = 'query';
      this.setData({ mainMode });
    } else if (options.mode === 'add') {
      mainMode = 'add';
      this.setData({ mainMode });
    } else if (options.code) {
      // 有code参数时，先扫码再处理
      this.handleScanResult(options.code);
    }
    
    // 更新页面标题
    let title = '';
    switch(mainMode) {
      case 'stockIn':
        title = '入库扫描';
        break;
      case 'query':
        title = '物品查询';
        break;
      case 'add':
        title = '手动入库';
        break;
    }
    wx.setNavigationBarTitle({ title });
  },

  // 阻止触摸滚动事件传递
  preventScroll() {
    // 空函数，仅阻止事件冒泡
    return;
  },

  // 容器点击事件，关闭下拉框
  onContainerTap() {
    this.setData({ showDropdown: false });
  },

  // 阻止事件冒泡
  stopPropagation() {},



  // 重置表单状态
  resetForm(mainMode) {
    this.setData({ 
      mainMode,
      isFromScan: false,
      scanResult: '',
      existingGoods: null,
      isNewGoods: true,
      formData: {
        itemCode: '',
        name: '',
        location: '',
        price: '',
        costPrice: '',
        stock: 0
      },

      showCostPrice: false,
      clickCount: 0,
      lastClickTime: 0,
      // 新增字段初始化
      purchaseQuantity: '',
      enableStockEdit: false,
      // 下拉搜索相关重置
      searchKeyword: '',
      searchResults: [],
      showDropdown: false,
      selectedIndex: -1,
      dropdownClosing: false,
      // 出库弹窗相关重置
      showOutboundModal: false,
      outboundQuantity: 1,
      outboundPrice: 0,
      enablePriceEdit: false
    });
  },

  // 扫码 - 增强版：限制类型、清洗结果、校验数据
  scanCode() {
    wx.scanCode({
      // 仅允许相机扫码，禁止从相册选择（提升安全性与准确度）
      onlyFromCamera: true,
      
      // 限制扫码类型为条形码（barCode）
      scanType: ['barCode'],
      
      success: res => {
        console.log('[scanCode] 原始扫码结果:', res.result);

        // ========== 第一步：清洗结果 ==========
        // 移除所有空白字符：空格、换行、制表符等
        let cleanedResult = (res.result || '').replace(/[\s\n\t\r]/g, '');
        console.log('[scanCode] 清洗后结果:', cleanedResult);

        // ========== 第二步：数据校验 ==========
        // 校验1：是否为空
        if (!cleanedResult || cleanedResult.length === 0) {
          wx.showModal({
            title: '扫码异常',
            content: '扫码结果为空，请重新扫描',
            confirmText: '重新扫描',
            cancelText: '返回',
            success: (modalRes) => {
              if (modalRes.confirm) {
                this.scanCode();
              } else {
                this.goBack();
              }
            }
          });
          return;
        }

        // 校验2：是否为纯数字
        if (!/^\d+$/.test(cleanedResult)) {
          wx.showModal({
            title: '扫码异常',
            content: '扫码结果包含非法字符，请重新扫描',
            confirmText: '重新扫描',
            cancelText: '返回',
            success: (modalRes) => {
              if (modalRes.confirm) {
                this.scanCode();
              } else {
                this.goBack();
              }
            }
          });
          return;
        }

        // 校验3：长度检查（固定 13 位）
        if (cleanedResult.length !== 13) {
          wx.showModal({
            title: '扫码异常',
            content: `条形码长度异常（${cleanedResult.length}位），应为13位，请重新扫描`,
            confirmText: '重新扫描',
            cancelText: '返回',
            success: (modalRes) => {
              if (modalRes.confirm) {
                this.scanCode();
              } else {
                this.goBack();
              }
            }
          });
          return;
        }

        // ========== 第三步：校验通过，处理结果 ==========
        console.log('[scanCode] 校验通过，条形码:', cleanedResult);
        this.handleScanResult(cleanedResult);
      },

      fail: err => {
        console.error('[scanCode] 扫码失败', err);
        
        // 用户取消扫码不提示错误
        if (err.errMsg && err.errMsg.includes('cancel')) {
          console.log('[scanCode] 用户取消扫码');
          return;
        }

        wx.showModal({
          title: '扫码失败',
          content: '扫码遇到问题，请重试',
          confirmText: '重新扫描',
          cancelText: '返回',
          success: (modalRes) => {
            if (modalRes.confirm) {
              this.scanCode();
            } else {
              this.goBack();
            }
          }
        });
      }
    });
  },



  // 处理扫描结果 - 使用 Supabase 查询
  async handleScanResult(result) {
    const { mainMode } = this.data;
    
    // 合并所有数据更新，减少重绘次数
    const updateData = { 
      scanResult: result,
      isFromScan: true,
      loading: true,
      'formData.itemCode': result
    };
    
    // 一次性更新，避免多次重绘
    this.setData(updateData);

    try {
      // 根据物品编号查询商品
      const params = {
        select: '*',
        barcode: `eq.${result}`,
        limit: 1
      };
      
      const res = await supabase.request('GET', TABLES.GOODS, params);
      
      if (res && res.length > 0) {
        // 商品已存在
        const goods = adaptGoodsData(res[0]);
        this.setData({
          existingGoods: goods,
          isNewGoods: false,
          formData: {
            itemCode: goods.barcode || result,
            name: goods.name || '',
            location: goods.location || '',
            price: goods.price || '',
            costPrice: goods.cost_price || goods.costPrice || '',
            stock: goods.current_stock || goods.stock || 0
          },
          loading: false
        });
        
        // 物品查询模式且库存不足时提示
        if (mainMode === 'query' && (goods.current_stock || goods.stock || 0) < 10) {
          wx.showToast({ title: '库存不足！', icon: 'none' });
        }
      } else {
        // 新商品
        this.setData({
          existingGoods: null,
          isNewGoods: true,
          loading: false
        });
        
        if (mainMode === 'query') {
          wx.showToast({ title: '未找到该商品', icon: 'none' });
        }
      }
    } catch (err) {
      console.error('[handleScanResult] 查询失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '查询失败，请重试', icon: 'none' });
    }
  },

  // 物品查询模式：库存区域点击事件（连续点击5次触发进价查看）
  onStockClick() {
    const { mainMode, clickCount, lastClickTime, formData } = this.data;
    if (mainMode !== 'query') return;

    const now = Date.now();
    // 如果距离上次点击超过1.5秒，重置计数
    if (now - lastClickTime > 1500) {
      this.setData({ 
        clickCount: 1,
        lastClickTime: now
      });
    } else {
      const newCount = clickCount + 1;
      this.setData({ 
        clickCount: newCount,
        lastClickTime: now
      });
      
      // 连续点击5次，弹出进价
      if (newCount >= 5) {
        this.showCostPriceModal();
      }
    }
  },

  // 物品查询模式：库存区域长按事件（3秒触发进价查看）
  onStockLongPress() {
    const { mainMode, formData } = this.data;
    if (mainMode !== 'query') return;
    
    // 长按3秒触发
    this.showCostPriceModal();
  },

  // 显示进价弹窗
  showCostPriceModal() {
    const { formData } = this.data;
    wx.showModal({
      title: '进价信息',
      content: `该商品进价为：¥${formData.costPrice || 0}`,
      showCancel: false,
      confirmText: '确定',
      success: () => {
        // 重置点击计数
        this.setData({ clickCount: 0 });
      }
    });
  },

  // 入库扫描模式：折叠面板切换
  toggleCostPrice() {
    const { mainMode } = this.data;
    if (mainMode === 'stockIn' || mainMode === 'add') {
      this.setData({ showCostPrice: !this.data.showCostPrice });
    }
  },



  // 新增：库存修改开关（盘库专用）
  onStockEditSwitchChange(e) {
    this.setData({ 
      enableStockEdit: e.detail.value
    });
  },

  // 新增：本次进货数量输入
  onPurchaseQuantityInput(e) {
    this.setData({ purchaseQuantity: e.detail.value });
  },

  // 新增：总库存直接修改输入
  onTotalStockInput(e) {
    this.setData({ 'formData.stock': parseInt(e.detail.value) || 0 });
  },



  // 输入框绑定
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const formData = this.data.formData;
    formData[field] = value;
    this.setData({ formData });
  },

  // 商品名称输入框绑定 - 实时转换为大写字母
  onNameInput(e) {
    const value = e.detail.value;
    // 将输入转换为大写
    const upperValue = value.toUpperCase();
    const formData = this.data.formData;
    formData.name = upperValue;
    this.setData({ formData });
  },
  
  // 位置输入框失焦校验
  onLocationBlur(e) {
    const { mainMode, formData } = this.data;
    if ((mainMode === 'stockIn' || mainMode === 'add') && !formData.location) {
      wx.showToast({ title: '请填写商品位置信息', icon: 'none' });
    }
  },

  // 物品查询模式：出库按钮点击 - 显示自定义弹窗
  onOutStock() {
    const { existingGoods, formData, mainMode } = this.data;
    if (mainMode !== 'query' || !existingGoods) return;

    // 显示出库弹窗，初始化数据
    this.setData({
      showOutboundModal: true,
      outboundQuantity: 1,
      outboundPrice: formData.price || 0,
      enablePriceEdit: false
    });
  },

  // 关闭出库弹窗
  closeOutboundModal() {
    this.setData({
      showOutboundModal: false
    });
  },

  // 出库数量输入
  onOutboundQuantityInput(e) {
    this.setData({
      outboundQuantity: parseInt(e.detail.value) || 0
    });
  },

  // 售价编辑开关切换
  onPriceEditSwitchChange(e) {
    this.setData({
      enablePriceEdit: e.detail.value
    });
  },

  // 出库售价输入
  onOutboundPriceInput(e) {
    this.setData({
      outboundPrice: parseFloat(e.detail.value) || 0
    });
  },

  // 确认出库 - 使用 Supabase
  async confirmOutbound() {
    const { existingGoods, outboundQuantity, outboundPrice, enablePriceEdit, formData } = this.data;
    const currentStock = formData.stock || existingGoods?.current_stock || existingGoods?.stock || 0;

    // 验证数量
    if (isNaN(outboundQuantity) || outboundQuantity <= 0) {
      wx.showToast({ title: '请输入有效数量', icon: 'none' });
      return;
    }

    if (outboundQuantity > currentStock) {
      wx.showToast({ title: '库存不足，无法出库', icon: 'none' });
      return;
    }

    // 验证售价
    if (enablePriceEdit && (isNaN(outboundPrice) || outboundPrice < 0)) {
      wx.showToast({ title: '请输入有效售价', icon: 'none' });
      return;
    }

    console.log('[confirmOutbound] 开始出库，goodsId:', existingGoods.id || existingGoods._id, 'outQty:', outboundQuantity, 'newPrice:', enablePriceEdit ? outboundPrice : '未修改');
    wx.showLoading({ title: '处理中...' });

    try {
      const goodsId = existingGoods.id || existingGoods._id;
      const newStock = currentStock - outboundQuantity;
      
      // 准备更新数据
      const updateData = {
        current_stock: newStock,
        updated_at: new Date().toISOString()
      };
      
      // 如果开启了售价编辑，同时更新价格
      if (enablePriceEdit) {
        updateData.price = outboundPrice;
      }

      // 调用 Supabase 更新
      const res = await supabase.request('PATCH', `${TABLES.GOODS}?id=eq.${goodsId}`, null, updateData);

      console.log('[confirmOutbound] Supabase 返回:', JSON.stringify(res));

      if (res.error) {
        wx.hideLoading();
        wx.showToast({ title: '出库失败: ' + res.error.message, icon: 'none' });
        return;
      }

      wx.hideLoading();
      
      // 创建出库记录
      try {
        const recordData = {
          goods_id: goodsId,
          type: 'out',
          quantity: outboundQuantity,
          before_stock: currentStock,
          after_stock: newStock,
          record_date: new Date().toISOString().split('T')[0]
        };
        console.log('[confirmOutbound] 创建出库记录:', JSON.stringify(recordData));
        await supabase.request('POST', TABLES.RECORDS, null, recordData);
      } catch (recordErr) {
        console.error('[confirmOutbound] 创建出库记录失败:', recordErr);
      }
      
      // 更新本地数据
      this.setData({
        'formData.stock': newStock,
        'existingGoods.current_stock': newStock,
        'existingGoods.stock': newStock,
        'formData.price': enablePriceEdit ? outboundPrice : formData.price,
        'existingGoods.price': enablePriceEdit ? outboundPrice : formData.price,
        showOutboundModal: false
      });

      wx.showToast({ 
        title: enablePriceEdit ? '出库成功，售价已更新' : '出库成功', 
        icon: 'success' 
      });
    } catch (err) {
      console.error('[confirmOutbound] 出库失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '出库失败', icon: 'none' });
    }
  },

  // 搜索输入处理（支持手动入库和物品查询模式）
  onSearchInput(e) {
    const keyword = e.detail.value;
    const { mainMode } = this.data;
    if (mainMode !== 'add' && mainMode !== 'query') return;

    this.setData({ searchKeyword: keyword });

    // 清空之前的匹配状态
    this.setData({
      'formData.name': keyword,
      'formData.itemCode': '',
      'formData.location': '',
      'formData.price': '',
      'formData.costPrice': '',
      'formData.stock': 0,
      existingGoods: null,
      isNewGoods: true,
      selectedIndex: -1,
      purchaseQuantity: ''
    });

    // 防抖：延迟200ms后执行搜索，提高响应速度
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }

    if (keyword && keyword.trim()) {
      this.searchTimer = setTimeout(() => {
        this.searchGoods(keyword.trim());
      }, 200);
    } else {
      this.setData({
        searchResults: [],
        showDropdown: false
      });
    }
  },

  // 搜索输入处理（支持手动入库和物品查询模式）- 实时转换为大写字母
  onSearchInputUpper(e) {
    const keyword = e.detail.value;
    // 将输入转换为大写
    const upperKeyword = keyword.toUpperCase();
    const { mainMode } = this.data;
    if (mainMode !== 'add' && mainMode !== 'query') return;

    this.setData({ searchKeyword: upperKeyword });

    // 清空之前的匹配状态
    this.setData({
      'formData.name': upperKeyword,
      'formData.itemCode': '',
      'formData.location': '',
      'formData.price': '',
      'formData.costPrice': '',
      'formData.stock': 0,
      existingGoods: null,
      isNewGoods: true,
      selectedIndex: -1,
      purchaseQuantity: ''
    });

    // 防抖：延迟200ms后执行搜索，提高响应速度
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }

    if (upperKeyword && upperKeyword.trim()) {
      this.searchTimer = setTimeout(() => {
        this.searchGoods(upperKeyword.trim());
      }, 200);
    } else {
      this.setData({
        searchResults: [],
        showDropdown: false
      });
    }
  },

  // 搜索商品（支持手动入库和物品查询模式）- 使用 Supabase
  async searchGoods(keyword) {
    const { mainMode } = this.data;
    if (mainMode !== 'add' && mainMode !== 'query') return;

    this.setData({ loading: true, showDropdown: true });

    try {
      // 使用 Supabase 的 ilike 进行模糊搜索（PostgreSQL 默认不区分大小写）
      const params = {
        select: '*',
        name: `ilike.*${keyword}*`,
        limit: 10
      };
      
      const res = await supabase.request('GET', TABLES.GOODS, params);
      
      console.log('[searchGoods] 返回数据:', JSON.stringify(res));
      
      this.setData({
        searchResults: adaptSearchResults(res || []),
        loading: false,
        showDropdown: true
      });
    } catch (err) {
      console.error('[searchGoods] 搜索失败', err);
      this.setData({
        searchResults: [],
        loading: false,
        showDropdown: true
      });
    }
  },

  // 展开/收起下拉列表
  toggleDropdown() {
    const { showDropdown, searchResults } = this.data;
    if (!showDropdown && searchResults.length > 0) {
      this.setData({ showDropdown: true });
    } else {
      this.setData({ showDropdown: false });
    }
  },

  // 搜索框获得焦点
  onSearchFocus() {
    const { searchResults } = this.data;
    if (searchResults.length > 0) {
      this.setData({ showDropdown: true });
    }
  },

  // 搜索框失焦时不关闭下拉框，让用户可以滑动选择
  // 下拉框通过点击下拉项、点击箭头或重新获取焦点来控制

  // 选择下拉列表中的商品
  selectGoods(e) {
    const index = e.currentTarget.dataset.index;
    const { searchResults } = this.data;
    
    if (index < 0 || index >= searchResults.length) return;

    // 取消延迟关闭
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }

    const goods = searchResults[index];
    
    this.setData({
      selectedIndex: index,
      searchKeyword: '',  // 清空搜索框
      formData: {
        itemCode: goods.barcode || '',
        name: goods.name || '',
        location: goods.location || '',
        price: goods.price || '',
        costPrice: goods.cost_price || goods.costPrice || '',
        stock: goods.current_stock || goods.stock || 0
      },
      existingGoods: goods,
      isNewGoods: false,
      showDropdown: false,
      dropdownClosing: false,
      purchaseQuantity: ''
    });
  },



  // 生成唯一物品编号（8位日期+3位序号）
  generateItemCode() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = year.toString() + month + day; // 8位日期：YYYYMMDD
    const seq = Math.floor(Math.random() * 1000).toString().padStart(3, '0'); // 3位序号
    return dateStr + seq; // 例如：20260401123
  },

  // 保存商品 - 使用 Supabase
  async saveGoods() {
    const { formData, isNewGoods, existingGoods, isFromScan, mainMode, purchaseQuantity, enableStockEdit } = this.data;
    
    console.log('[saveGoods] 开始保存商品');
    console.log('[saveGoods] isNewGoods:', isNewGoods);
    console.log('[saveGoods] formData:', JSON.stringify(formData));
    console.log('[saveGoods] purchaseQuantity:', purchaseQuantity);
    
    // 入库扫描模式：必须先扫码
    if (mainMode === 'stockIn' && isFromScan && !formData.itemCode) {
      wx.showToast({ title: '请先扫码', icon: 'none' });
      return;
    }

    // 商品名称必填
    if (!formData.name || !formData.name.trim()) {
      wx.showToast({ title: '请输入商品名称', icon: 'none' });
      return;
    }
    
    // 位置必填
    if (!formData.location) {
      wx.showToast({ title: '请填写商品位置信息', icon: 'none' });
      wx.nextTick(() => {
        wx.createSelectorQuery().select('.input-field').focus();
      });
      return;
    }

    // 手动入库模式：确保物品编号存在
    if (mainMode === 'add' && !formData.itemCode) {
      formData.itemCode = this.generateItemCode();
    }

    // 位置校验（兼容新旧格式）
    if (formData.location) {
      const locationStr = String(formData.location).trim();
      // 新格式正则：1F-H03-L2 或 1F-DA区
      const newFormatRegex = /^[^-]+-[^-]+(?:-L\d+)?$/;
      if (!newFormatRegex.test(locationStr)) {
        // 不是新格式，检查是否是旧格式数字
        const loc = parseInt(formData.location);
        if (isNaN(loc) || loc < 1 || loc > 9999) {
          wx.showToast({ title: '位置格式不正确', icon: 'none' });
          return;
        }
      }
    }

    // 售价校验
    if (formData.price && isNaN(parseFloat(formData.price))) {
      wx.showToast({ title: '请输入有效售价', icon: 'none' });
      return;
    }

    // 计算新库存
    const purchaseQty = parseInt(purchaseQuantity) || 0;
    const currentStock = formData.stock || existingGoods?.current_stock || existingGoods?.stock || 0;
    
    wx.showLoading({ title: '保存中...', mask: true });
    
    try {
      if (isNewGoods) {
        // ========== 新增商品：直接插入 Supabase ==========
        console.log('[saveGoods] 插入新商品到 Supabase');
        
        const insertData = {
          barcode: formData.itemCode || '',
          name: formData.name.trim(),
          location: formData.location,
          price: formData.price ? parseFloat(formData.price) : 0,
          cost_price: formData.costPrice ? parseFloat(formData.costPrice) : 0,
          current_stock: purchaseQty || formData.stock || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        const res = await supabase.request('POST', TABLES.GOODS, null, insertData);
        
        console.log('[saveGoods] 新增返回:', JSON.stringify(res));
        
        if (res && res.error) {
          console.error('[saveGoods] 新增失败:', res.error.message);
          wx.hideLoading();
          wx.showToast({ title: '入库失败: ' + res.error.message, icon: 'none' });
          return;
        }
        
        console.log('[saveGoods] 新增成功，商品ID:', res && res[0] ? res[0].id : 'unknown');
        wx.hideLoading();
        wx.showToast({ title: '入库成功', icon: 'success' });
        
      } else {
        // ========== 更新商品：直接更新 Supabase ==========
        console.log('[saveGoods] 更新 Supabase 商品');
        console.log('[saveGoods] existingGoods.id:', existingGoods.id || existingGoods._id);
        
        const goodsId = existingGoods.id || existingGoods._id;
        
        // 盘库模式：直接设置库存；累加模式：增加库存
        let newStock;
        if (enableStockEdit) {
          newStock = formData.stock || 0;
        } else {
          newStock = currentStock + purchaseQty;
        }
        
        const updateData = {
          name: formData.name.trim(),
          location: formData.location,
          price: formData.price ? parseFloat(formData.price) : 0,
          cost_price: formData.costPrice ? parseFloat(formData.costPrice) : 0,
          current_stock: newStock,
          updated_at: new Date().toISOString()
        };
        
        console.log('[saveGoods] updateData:', JSON.stringify(updateData));
        
        const res = await supabase.request('PATCH', `${TABLES.GOODS}?id=eq.${goodsId}`, null, updateData);
        
        console.log('[saveGoods] 更新返回:', JSON.stringify(res));
        
        if (res && res.error) {
          console.error('[saveGoods] 更新失败:', res.error.message);
          wx.hideLoading();
          wx.showToast({ title: '更新失败: ' + res.error.message, icon: 'none' });
          return;
        }
        
        console.log('[saveGoods] 更新成功，新库存:', newStock);
        wx.hideLoading();
        wx.showToast({ title: '更新成功', icon: 'success' });
      }
      
      // 保存成功后，清空表单
      setTimeout(() => {
        const pages = getCurrentPages();
        if (pages.length > 1) {
          const prevPage = pages[pages.length - 2];
          if (prevPage && prevPage.loadGoodsList) {
            prevPage.loadGoodsList();
          }
        }
        this.resetForm(mainMode);
        if (mainMode === 'add') {
          wx.nextTick(() => {
            wx.createSelectorQuery().select('.search-input').focus();
          });
        }
      }, 1000);
      
    } catch (err) {
      // ========== 捕获异常 ==========
      console.error('[saveGoods] 捕获到异常:', err);
      console.error('[saveGoods] 错误类型:', typeof err);
      console.error('[saveGoods] 错误信息:', err.message || JSON.stringify(err));
      
      wx.hideLoading();
      
      // 错误分类处理
      if (err.message && err.message.indexOf('timeout') > -1) {
        wx.showToast({ title: '请求超时，请重试', icon: 'none', duration: 3000 });
      } else if (err.message && err.message.indexOf('network') > -1) {
        wx.showToast({ title: '网络连接失败，请检查网络', icon: 'none', duration: 3000 });
      } else {
        wx.showToast({ title: '保存失败：' + (err.message?.substring(0, 30) || '未知错误'), icon: 'none', duration: 3000 });
      }
    }
  },

  // 返回
  goBack() {
    wx.navigateBack();
  },

  // ========== 位置选择相关方法 ==========

  // 点击选择位置按钮
  onSelectPosition() {
    this.setData({ showPositionPicker: true });
  },

  // 位置选择弹窗确认
  onPositionConfirm(e) {
    const { code } = e.detail;
    console.log('[onPositionConfirm] 选择了位置:', code);
    this.setData({
      'formData.location': code,
      showPositionPicker: false
    });
  },

  // 位置选择弹窗取消
  onPositionCancel() {
    this.setData({ showPositionPicker: false });
  }
});
