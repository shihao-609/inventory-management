/**
 * 出库记录页面
 * 【修改】已迁移到 Supabase 后端
 */
const { supabase, TABLES } = require('../../utils/supabase.js');

Page({
  data: {
    recordList: [],
    allRecordList: [],
    loading: false,
    loadingMore: false,
    hasMore: true,
    pageSize: 20,
    currentPage: 0,
    searchKey: ''
  },

  onLoad() {
    this.loadRecords();
  },

  onShow() {
    this.loadRecords();
  },

  onPullDownRefresh() {
    this.loadRecords().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 适配记录数据
  adaptRecordData(item) {
    if (!item) return null;
    return Object.assign({}, item, {
      _id: item.id,
      goodsId: item.goods_id || item.goodsId
    });
  },

  // 加载出库记录 - 实时关联商品库存
  async loadRecords(loadMore = false) {
    if (loadMore) {
      this.setData({ loadingMore: true });
    } else {
      this.setData({ loading: true, currentPage: 0 });
    }

    try {
      const pageSize = this.data.pageSize;
      const currentPage = loadMore ? this.data.currentPage + 1 : 0;
      const offset = currentPage * pageSize;

      // 从 Supabase 获取出库记录
      const res = await supabase.request('GET', TABLES.RECORDS, {
        order: 'created_at.desc',
        offset: offset,
        limit: pageSize + 1  // 多查一条判断是否有更多
      });

      let newList = res || [];
      const total = newList.length;
      const hasMore = total > pageSize;
      
      if (hasMore) {
        newList = newList.slice(0, pageSize);
      }

      // 适配数据格式
      newList = newList.map(item => this.adaptRecordData(item));

      // 收集所有 goodsId，用于批量查询商品库存
      const tempMap = {};
      newList.map(item => item.goods_id || item.goodsId).filter(id => id).forEach(id => { tempMap[id] = true; });
      const goodsIds = Object.keys(tempMap);
      
      // 批量查询商品当前库存和名称
      let goodsStockMap = {};
      let goodsNameMap = {};
      let goodsCodeMap = {};
      if (goodsIds.length > 0) {
        try {
          const goodsRes = await supabase.request('GET', TABLES.GOODS, {
            select: 'id,name,barcode,current_stock',
            limit: 1000
          });
          
          if (goodsRes) {
            // 构建 id -> stock、name、code 的映射
            goodsRes.forEach(goods => {
              if (goods.id) {
                goodsStockMap[goods.id] = goods.current_stock || 0;
                goodsNameMap[goods.id] = goods.name || '未知商品';
                goodsCodeMap[goods.id] = goods.barcode || '-';
              }
            });
            console.log('[loadRecords] 商品映射:', JSON.stringify(goodsNameMap));
          }
        } catch (goodsErr) {
          console.error('[loadRecords] 获取商品库存失败:', goodsErr);
        }
      }

      // 格式化数据，实时显示商品当前库存
      newList = newList.map(item => {
        // 格式化时间
        let outTime = '-';
        if (item.created_at) {
          const date = new Date(item.created_at);
          if (!isNaN(date.getTime())) {
            outTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
          }
        }
        
        // 使用实时库存
        const currentStock = goodsStockMap[item.goods_id] !== undefined 
          ? goodsStockMap[item.goods_id] 
          : (item.after_stock !== undefined ? item.after_stock : 0);
        
        // 使用映射获取商品名称和编号
        const goodsName = goodsNameMap[item.goods_id] || item.goods_name || item.goodsName || '未知商品';
        const itemCode = goodsCodeMap[item.goods_id] || '-';
        
        // 添加商品名称和编号的兼容字段
        return Object.assign({}, item, {
          outTime: outTime,
          currentStock: currentStock,
          goodsName: goodsName,
          itemCode: itemCode
        });
      });

      if (loadMore) {
        this.setData({
          recordList: this.data.recordList.concat(newList),
          allRecordList: this.data.allRecordList.concat(newList),
          currentPage,
          loadingMore: false,
          hasMore
        });
      } else {
        this.setData({
          recordList: newList,
          allRecordList: newList,
          currentPage: 0,
          loading: false,
          hasMore
        });
      }
    } catch (err) {
      console.error('加载出库记录失败', err);
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: '加载失败，请检查网络', icon: 'none' });
    }
  },

  // 搜索
  onSearch(e) {
    const key = e.detail.value;
    this.setData({ searchKey: key });
    this.filterRecords();
  },

  // 筛选记录
  filterRecords() {
    const { allRecordList, searchKey } = this.data;
    let filtered = allRecordList;

    if (searchKey) {
      const key = searchKey.toLowerCase();
      filtered = allRecordList.filter(item => 
        (item.goods_name && item.goods_name.toLowerCase().includes(key)) ||
        (item.barcode && item.barcode.toLowerCase().includes(key)) ||
        (item.itemCode && item.itemCode.toLowerCase().includes(key))
      );
    }

    this.setData({ recordList: filtered });
  },

  // 上拉加载更多
  onReachBottom() {
    if (!this.data.loadingMore && this.data.hasMore) {
      this.loadRecords(true);
    }
  },

  // 长按删除
  onLongPress(e) {
    const { id, goodsid, quantity } = e.currentTarget.dataset;
    
    console.log('[onLongPress] 获取到的参数: id=', id, 'goodsid=', goodsid, 'quantity=', quantity);
    
    wx.showModal({
      title: '确认删除',
      content: '确定删除该条出库记录？删除后将自动回滚对应商品库存。',
      confirmText: '删除',
      confirmColor: '#e64340',
      success: async (res) => {
        if (res.confirm) {
          await this.deleteRecord(id, goodsid, parseInt(quantity));
        }
      }
    });
  },

  // 删除记录并回滚库存 - 使用 Supabase
  async deleteRecord(recordId, goodsId, quantity) {
    wx.showLoading({ title: '删除中...' });

    console.log('[deleteRecord] 删除出库记录，recordId:', recordId, 'goodsId:', goodsId, 'quantity:', quantity);

    try {
      // 1. 先获取商品当前库存
      const goodsRes = await supabase.request('GET', TABLES.GOODS, {
        id: `eq.${goodsId}`,
        limit: 1
      });
      
      if (!goodsRes || goodsRes.length === 0) {
        wx.hideLoading();
        wx.showToast({ title: '商品不存在', icon: 'none' });
        return;
      }
      
      const currentStock = goodsRes[0].current_stock || 0;
      const newStock = currentStock + quantity;  // 回滚：加回删除的数量
      
      // 2. 更新商品库存
      const updateGoodsRes = await supabase.request('PATCH', `${TABLES.GOODS}?id=eq.${goodsId}`, null, {
        current_stock: newStock,
        updated_at: new Date().toISOString()
      });
      
      if (updateGoodsRes && updateGoodsRes.error) {
        wx.hideLoading();
        wx.showToast({ title: '回滚库存失败', icon: 'none' });
        return;
      }
      
      // 3. 删除出库记录
      const deleteRes = await supabase.request('DELETE', `${TABLES.RECORDS}?id=eq.${recordId}`);
      
      if (deleteRes && deleteRes.error) {
        wx.hideLoading();
        wx.showToast({ title: '删除记录失败', icon: 'none' });
        return;
      }

      console.log('[deleteRecord] 删除成功');
      wx.hideLoading();
      wx.showToast({ title: '删除成功', icon: 'success' });
      this.loadRecords();

    } catch (err) {
      wx.hideLoading();
      console.error('[deleteRecord] 删除记录失败:', err);
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  }
});
