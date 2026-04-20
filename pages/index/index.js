/**
 * 首页 - 库存管理主页面
 * 使用 Supabase 替代微信云开发
 * 排序：仅按最新更新排序
 */
const app = getApp();
const { supabase, TABLES } = require('../../utils/supabase.js');

// 兼容字段名转换
function adaptGoodsData(item) {
  return Object.assign({}, item, {
    _id: item.id,
    stock: item.current_stock || item.stock || 0,
    updateTime: item.updated_at || item.created_at,
    itemCode: item.barcode || ''
  });
}

Page({
  data: {
    goodsList: [],
    allGoodsList: [],
    loading: false,
    loadingMore: false,
    hasMore: true,
    pageSize: 20,
    currentPage: 0,
    searchKey: '',
    searchMode: false,
    searchTimer: null,
    searchLoading: false,
    adminTapCount: 0,
    adminTapTimer: null,
    currentUser: null
  },

  onLoad() {
    this.loadGoodsList();
  },

  onShow() {
    const app = getApp();
    if (!app.checkLoginStatus()) {
      wx.reLaunch({
        url: '/pages/login/login'
      });
      return;
    }
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ currentUser: userInfo });
    }
    this.loadGoodsList();
  },

  // 加载商品列表 - 按最新更新排序
  async loadGoodsList(loadMore = false) {
    if (loadMore) {
      this.setData({ loadingMore: true });
    } else {
      this.setData({ 
        loading: true, 
        currentPage: 0,
        goodsList: [],
        allGoodsList: []
      });
    }

    const pageSize = this.data.pageSize;
    const currentPage = loadMore ? this.data.currentPage + 1 : 0;
    const offset = currentPage * pageSize;

    console.log('[loadGoodsList] 开始加载，page:', currentPage);

    try {
      // 使用 Supabase 服务器端排序
      // 语法：字段名.desc.nullslast（降序，null值排最后）
      const url = `${TABLES.GOODS}?select=*&offset=${offset}&limit=${pageSize + 1}&order=updated_at.desc.nullslast,created_at.desc`;
      console.log('[loadGoodsList] 请求:', url);

      const data = await supabase.request('GET', url);

      console.log('[loadGoodsList] 返回数据条数:', data ? data.length : 0);

      if (!data) {
        this.setData({ loading: false, loadingMore: false });
        wx.showToast({ title: '服务器无响应', icon: 'none' });
        return;
      }

      // 判断是否有更多数据
      const hasMore = data.length > pageSize;
      let newList = hasMore ? data.slice(0, pageSize) : data;
      
      // 转换字段名
      newList = newList.map(adaptGoodsData);
      
      console.log('[loadGoodsList] 第一条:', newList[0] ? newList[0].name : '无', 'updated_at:', newList[0] ? newList[0].updated_at : '无');

      if (loadMore) {
        this.setData({
          goodsList: this.data.goodsList.concat(newList),
          allGoodsList: this.data.allGoodsList.concat(newList),
          currentPage,
          loadingMore: false,
          hasMore
        });
      } else {
        this.setData({
          goodsList: newList,
          allGoodsList: newList,
          currentPage: 0,
          loading: false,
          hasMore
        });
      }
      console.log('[loadGoodsList] 加载成功，共', newList.length, '条');
    } catch (err) {
      console.error('[loadGoodsList] 加载失败:', err);
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onReachBottom() {
    if (!this.data.loadingMore && this.data.hasMore) {
      this.loadGoodsList(true);
    }
  },

  onPullDownRefresh() {
    this.setData({ searchMode: false });
    this.loadGoodsList().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onSearch(e) {
    const key = e.detail.value;
    this.setData({ searchKey: key });
    
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    
    this.searchTimer = setTimeout(() => {
      if (!key || !key.trim()) {
        this.setData({ 
          searchMode: false,
          searchLoading: false,
          currentPage: 0
        });
        this.loadGoodsList();
      } else {
        this.searchGoods(key.trim());
      }
    }, 400);
  },

  // 搜索商品
  async searchGoods(keyword, loadMore = false) {
    if (loadMore) {
      this.setData({ loadingMore: true });
    } else {
      this.setData({ 
        loading: true, 
        currentPage: 0, 
        goodsList: [], 
        allGoodsList: [],
        searchLoading: true 
      });
    }

    const pageSize = this.data.pageSize;
    const currentPage = loadMore ? this.data.currentPage + 1 : 0;
    const offset = currentPage * pageSize;

    console.log('[searchGoods] 搜索:', keyword);

    try {
      // 搜索时也使用服务器端排序
      const url = `${TABLES.GOODS}?select=*&offset=${offset}&limit=${pageSize + 1}&name=ilike.*${keyword}*&order=updated_at.desc.nullslast,created_at.desc`;

      const data = await supabase.request('GET', url);

      if (!data) {
        this.setData({ loading: false, loadingMore: false, searchLoading: false });
        wx.showToast({ title: '服务器无响应', icon: 'none' });
        return;
      }

      const hasMore = data.length > pageSize;
      let newList = hasMore ? data.slice(0, pageSize) : data;
      
      newList = newList.map(adaptGoodsData);

      if (loadMore) {
        this.setData({
          goodsList: this.data.goodsList.concat(newList),
          allGoodsList: this.data.allGoodsList.concat(newList),
          currentPage,
          loadingMore: false,
          hasMore
        });
      } else {
        this.setData({
          goodsList: newList,
          allGoodsList: newList,
          currentPage: 0,
          loading: false,
          hasMore,
          searchMode: true,
          searchLoading: false
        });
      }
      console.log('[searchGoods] 搜索成功，共', newList.length, '条');
    } catch (err) {
      console.error('[searchGoods] 搜索失败:', err);
      this.setData({ loading: false, loadingMore: false, searchLoading: false });
      wx.showToast({ title: '搜索失败', icon: 'none' });
    }
  },

  clearSearch() {
    this.setData({
      searchKey: '',
      searchMode: false,
      searchLoading: false,
      currentPage: 0,
      goodsList: [],
      allGoodsList: []
    });
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.loadGoodsList();
  },

  goToStockIn() {
    wx.navigateTo({
      url: '/pages/scan/scan?mode=stockIn'
    });
  },

  goToQuery() {
    wx.navigateTo({
      url: '/pages/scan/scan?mode=query'
    });
  },

  goToAdd() {
    wx.navigateTo({
      url: '/pages/scan/scan?mode=add'
    });
  },

  goToOutRecords() {
    wx.navigateTo({
      url: '/pages/outRecords/outRecords'
    });
  },

  preventScroll() {
    return;
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    });
  },

  onTitleDoubleTap() {
    wx.showModal({
      title: '开发者入口',
      placeholderText: '请输入访问密码',
      editable: true,
      success: res => {
        if (res.confirm && res.content) {
          if (res.content === 'admin888') {
            wx.navigateTo({
              url: '/pages/hidden/hidden'
            });
          } else {
            wx.showToast({
              title: '密码错误',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  onAdminTap() {
    let count = this.data.adminTapCount + 1;
    
    if (this.data.adminTapTimer) {
      clearTimeout(this.data.adminTapTimer);
    }
    
    const timer = setTimeout(() => {
      this.setData({ adminTapCount: 0 });
    }, 3000);
    
    this.setData({
      adminTapCount: count,
      adminTapTimer: timer
    });
    
    if (count === 5) {
      wx.navigateTo({
        url: '/pages/admin/admin'
      });
      this.setData({ adminTapCount: 0 });
      if (this.data.adminTapTimer) {
        clearTimeout(this.data.adminTapTimer);
      }
    }
  },

  handleLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出当前账号吗？',
      confirmText: '退出',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          const app = getApp();
          app.logout();
        }
      }
    });
  }
});
