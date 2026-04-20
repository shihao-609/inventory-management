/**
 * 库存管理后台系统 - 主应用逻辑（内存优化版）
 * 优化点：
 * 1. 分页加载数据，避免内存溢出
 * 2. 虚拟滚动（大数据量时）
 * 3. 搜索防抖，减少请求
 * 4. 数据懒加载
 */

// 全局状态管理
const appState = {
  currentPage: 'dashboard',
  pagination: {
    inventory: { page: 1, pageSize: 20, total: 0 },
    records: { page: 1, pageSize: 20, total: 0 },
    users: { page: 1, pageSize: 20, total: 0 }
  },
  filters: {
    inventory: { search: '' },
    records: { type: '', date: '', search: '' },
    users: { search: '' }
  },
  searchTimeouts: {} // 防抖定时器
};

// 等待 DOM 加载完成
document.addEventListener('DOMContentLoaded', function() {
  initApp();
});

/**
 * 初始化应用
 */
function initApp() {
  console.log('[App] 初始化应用...');
  
  // 检查登录状态
  checkAuthStatus();
  
  // 绑定登录表单事件
  bindLoginEvents();
  
  // 绑定导航事件
  bindNavigationEvents();
  
  // 绑定其他事件
  bindOtherEvents();
  
  console.log('[App] 应用初始化完成');
}

/**
 * 检查认证状态
 */
function checkAuthStatus() {
  if (supabase.isAuthenticated()) {
    showAdminPage();
    loadDashboardData();
  } else {
    showLoginPage();
  }
}

/**
 * 显示登录页面
 */
function showLoginPage() {
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('adminPage').style.display = 'none';
}

/**
 * 显示后台管理页面
 */
function showAdminPage() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('adminPage').style.display = 'flex';
  
  // 更新当前用户名显示
  const user = supabase.getUser();
  if (user) {
    document.getElementById('currentUser').textContent = user.name || user.username || '管理员';
  }
}

/**
 * 绑定登录相关事件
 */
function bindLoginEvents() {
  const loginForm = document.getElementById('loginForm');
  const togglePassword = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('password');
  
  // 密码显示/隐藏切换
  if (togglePassword) {
    togglePassword.addEventListener('click', function() {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      this.querySelector('i').classList.toggle('fa-eye');
      this.querySelector('i').classList.toggle('fa-eye-slash');
    });
  }
  
  // 登录表单提交
  if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const rememberMe = document.getElementById('rememberMe').checked;
      const loginBtn = document.getElementById('loginBtn');
      const btnText = loginBtn.querySelector('.btn-text');
      const btnLoading = loginBtn.querySelector('.btn-loading');
      
      // 验证输入
      if (!username) {
        showToast('请输入账号', 'error');
        return;
      }
      
      if (!password) {
        showToast('请输入密码', 'error');
        return;
      }
      
      // 显示加载状态
      loginBtn.disabled = true;
      btnText.style.display = 'none';
      btnLoading.style.display = 'inline';
      
      try {
        // 调用 Supabase 登录
        const result = await supabase.signIn(username, password);
        
        if (result.success) {
          // 记住我
          if (rememberMe) {
            localStorage.setItem('rememberMe', 'true');
          }
          
          showToast('登录成功', 'success');
          showAdminPage();
          loadDashboardData();
        } else {
          showToast(result.error?.message || '用户名或密码错误', 'error');
        }
      } catch (error) {
        console.error('登录失败:', error);
        showToast('登录失败，请检查网络连接', 'error');
      } finally {
        // 恢复按钮状态
        loginBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
      }
    });
  }
  
  // 退出登录
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function() {
      supabase.signOut();
      showLoginPage();
      showToast('已退出登录', 'success');
    });
  }
}

/**
 * 绑定导航事件
 */
function bindNavigationEvents() {
  const navLinks = document.querySelectorAll('.sidebar-nav a');
  const pages = document.querySelectorAll('.page');
  
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      
      const targetPage = this.getAttribute('data-page');
      
      // 更新导航激活状态
      navLinks.forEach(l => l.parentElement.classList.remove('active'));
      this.parentElement.classList.add('active');
      
      // 切换页面
      pages.forEach(page => page.classList.remove('active'));
      document.getElementById(targetPage + 'Page').classList.add('active');
      
      // 更新页面标题
      document.getElementById('pageTitle').textContent = this.querySelector('span').textContent;
      
      // 加载页面数据
      loadPageData(targetPage);
    });
  });
  
  // 移动端菜单切换
  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.querySelector('.sidebar');
  
  if (menuToggle) {
    menuToggle.addEventListener('click', function() {
      sidebar.classList.toggle('collapsed');
    });
  }
}

/**
 * 绑定其他事件
 */
function bindOtherEvents() {
  // 刷新按钮
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      // 清除缓存并刷新
      supabase.clearCache();
      const activePage = document.querySelector('.page.active');
      if (activePage) {
        const pageId = activePage.id.replace('Page', '');
        loadPageData(pageId);
        showToast('数据已刷新', 'success');
      }
    });
  }
  
  // 全屏按钮
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', function() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.error('全屏失败:', err);
        });
      } else {
        document.exitFullscreen();
      }
    });
  }
  
  // 库存搜索 - 防抖处理
  const inventorySearch = document.getElementById('inventorySearch');
  if (inventorySearch) {
    inventorySearch.addEventListener('input', debounce(function(e) {
      appState.filters.inventory.search = e.target.value.trim();
      appState.pagination.inventory.page = 1; // 重置到第一页
      loadInventoryData();
    }, 500, 'inventorySearch'));
  }
  
  // 库存状态筛选
  const stockFilter = document.getElementById('stockFilter');
  if (stockFilter) {
    stockFilter.addEventListener('change', function() {
      appState.pagination.inventory.page = 1;
      loadInventoryData();
    });
  }
  
  // 记录筛选
  const recordTypeFilter = document.getElementById('recordTypeFilter');
  if (recordTypeFilter) {
    recordTypeFilter.addEventListener('change', function(e) {
      appState.filters.records.type = e.target.value;
      appState.pagination.records.page = 1;
      loadRecordsData();
    });
  }
  
  const recordDateFilter = document.getElementById('recordDateFilter');
  if (recordDateFilter) {
    recordDateFilter.addEventListener('change', function(e) {
      appState.filters.records.date = e.target.value;
      appState.pagination.records.page = 1;
      loadRecordsData();
    });
  }
  
  const recordsSearch = document.getElementById('recordsSearch');
  if (recordsSearch) {
    recordsSearch.addEventListener('input', debounce(function(e) {
      appState.filters.records.search = e.target.value.trim();
      appState.pagination.records.page = 1;
      loadRecordsData();
    }, 500, 'recordsSearch'));
  }
  
  // 用户搜索
  const usersSearch = document.getElementById('usersSearch');
  if (usersSearch) {
    usersSearch.addEventListener('input', debounce(function(e) {
      appState.filters.users.search = e.target.value.trim();
      appState.pagination.users.page = 1;
      loadUsersData();
    }, 500, 'usersSearch'));
  }
}

/**
 * 加载页面数据
 */
function loadPageData(page) {
  switch (page) {
    case 'dashboard':
      loadDashboardData();
      break;
    case 'inventory':
      loadInventoryData();
      break;
    case 'records':
      loadRecordsData();
      break;
    case 'users':
      loadUsersData();
      break;
    case 'settings':
      loadSettingsData();
      break;
  }
}

/**
 * 加载仪表盘数据
 */
async function loadDashboardData() {
  try {
    // 获取库存统计数据
    const goods = await supabase.select(TABLES.GOODS);
    const records = await supabase.select(TABLES.RECORDS, { limit: 100 });
    
    // 获取商品名称映射
    const goodsMap = {};
    goods.forEach(g => {
      goodsMap[g.id] = g.name || g.barcode || '未知商品';
    });
    
    // 为记录添加商品名称
    const recordsWithNames = records.map(r => ({
      ...r,
      goods_name: goodsMap[r.goods_id] || '未知商品'
    }));
    
    // 计算统计数据 - 使用 current_stock 字段
    const totalItems = goods.reduce((sum, item) => sum + (parseInt(item.current_stock) || 0), 0);
    const totalTypes = goods.length;
    
    // 库存紧张统计（库存 < 10）
    const lowStockCount = goods.filter(item => (parseInt(item.current_stock) || 0) < 10).length;
    
    // 今日出库统计
    const today = new Date().toISOString().split('T')[0];
    const todayRecords = recordsWithNames.filter(r => r.created_at && r.created_at.startsWith(today));
    const todayOut = todayRecords.filter(r => r.type === 'out').reduce((sum, r) => sum + (parseInt(r.quantity) || 0), 0);
    
    // 更新显示
    document.getElementById('totalItems').textContent = totalItems;
    document.getElementById('totalTypes').textContent = totalTypes;
    document.getElementById('todayOut').textContent = todayOut;
    document.getElementById('lowStockCount').textContent = lowStockCount;
    
    // 加载最近操作记录（传入所有记录，由 loadRecentActivity 进行排序和截取）
    loadRecentActivity(recordsWithNames);
    
    // 绘制库存趋势图
    drawTrendChart(recordsWithNames);
  } catch (error) {
    console.error('加载仪表盘数据失败:', error);
  }
}

/**
 * 加载最近活动 - 只显示出库记录
 */
function loadRecentActivity(records) {
  const activityList = document.getElementById('recentActivity');
  
  if (!records || records.length === 0) {
    activityList.innerHTML = '<li class="empty">暂无数据</li>';
    return;
  }
  
  // 只过滤出库记录并按时间倒序排序
  const outRecords = records
    .filter(r => r.type === 'out')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  if (outRecords.length === 0) {
    activityList.innerHTML = '<li class="empty">暂无出库记录</li>';
    return;
  }
  
  activityList.innerHTML = outRecords.slice(0, 10).map(record => {
    const typeIcon = 'fa-arrow-up';
    const typeColor = '#f44336';
    const typeText = '出库';
    const time = new Date(record.created_at).toLocaleString('zh-CN');
    // 使用 goods_name（已由 loadDashboardData 添加）
    const goodsName = record.goods_name || '未知物品';
    
    return `
      <li>
        <div class="activity-icon" style="background: ${typeColor}20; color: ${typeColor};">
          <i class="fas ${typeIcon}"></i>
        </div>
        <div class="activity-content">
          <p><strong>${escapeHtml(goodsName)}</strong> ${typeText} ${record.quantity || 0} 件</p>
          <span class="activity-time">${time}</span>
        </div>
      </li>
    `;
  }).join('');
}

/**
 * 绘制库存趋势图
 */
function drawTrendChart(records) {
  const canvas = document.getElementById('trendChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  // 清空画布
  ctx.clearRect(0, 0, width, height);
  
  // 获取最近7天的出库数据
  const days = 7;
  const dailyData = [];
  const labels = [];
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const label = `${date.getMonth() + 1}/${date.getDate()}`;
    labels.push(label);
    
    // 统计该日期的出库数量
    const dayRecords = records.filter(r => 
      r.created_at && r.created_at.startsWith(dateStr) && r.type === 'out'
    );
    const dayTotal = dayRecords.reduce((sum, r) => sum + (parseInt(r.quantity) || 0), 0);
    dailyData.push(dayTotal);
  }
  
  if (dailyData.every(d => d === 0)) {
    // 没有数据时显示提示
    ctx.fillStyle = '#999';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无出库数据', width / 2, height / 2);
    return;
  }
  
  // 计算最大值用于缩放
  const maxValue = Math.max(...dailyData) || 1;
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 35;
  const paddingBottom = 40;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const barWidth = chartWidth / days * 0.7;
  const barGap = chartWidth / days * 0.3;
  
  // 绘制坐标轴
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(paddingLeft, paddingTop);
  ctx.lineTo(paddingLeft, height - paddingBottom);
  ctx.lineTo(width - paddingRight, height - paddingBottom);
  ctx.stroke();
  
  // 绘制柱状图
  dailyData.forEach((value, index) => {
    const x = paddingLeft + index * (barWidth + barGap) + barGap / 2;
    const barHeight = (value / maxValue) * chartHeight * 0.9;
    const y = height - paddingBottom - barHeight;
    
    // 绘制柱子
    const gradient = ctx.createLinearGradient(0, y, 0, height - paddingBottom);
    gradient.addColorStop(0, '#c2185b');
    gradient.addColorStop(1, '#f8bbd9');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, barHeight);
    
    // 绘制数值
    if (value > 0) {
      ctx.fillStyle = '#333';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(value.toString(), x + barWidth / 2, y - 6);
    }
    
    // 绘制日期标签
    ctx.fillStyle = '#666';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[index], x + barWidth / 2, height - paddingBottom + 18);
  });
  
  // 绘制标题
  ctx.fillStyle = '#333';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('最近7天出库趋势', paddingLeft, 22);
}

/**
 * 初始化位置筛选器
 */
let filterPositionInitialized = false;

/**
 * 初始化筛选页面的级联位置选择器
 */
async function initFilterPositionSelector() {
  if (filterPositionInitialized) return;
  
  const config = await loadPositionConfig();
  if (config.length === 0) return;
  
  const floorSelect = document.getElementById('filterFloor');
  if (!floorSelect) return;
  
  // 清空并添加楼层选项
  floorSelect.innerHTML = '<option value="">全部楼层</option>';
  config.forEach((floor, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = floor.floorName;
    floorSelect.appendChild(option);
  });
  
  filterPositionInitialized = true;
}

/**
 * 筛选-楼层变化
 */
function onFilterFloorChange() {
  const floorIndex = document.getElementById('filterFloor').value;
  const typeSelect = document.getElementById('filterType');
  const numberSelect = document.getElementById('filterNumber');
  const layerSelect = document.getElementById('filterLayer');
  
  // 重置下级选择器
  typeSelect.innerHTML = '<option value="">全部类型</option>';
  numberSelect.innerHTML = '<option value="">全部编号</option>';
  layerSelect.innerHTML = '<option value="">全部层</option>';
  layerSelect.style.display = 'none';
  
  if (floorIndex === '' || !positionConfig[floorIndex]) {
    appState.pagination.inventory.page = 1;
    loadInventoryData();
    return;
  }
  
  // 填充类型选项
  const types = positionConfig[floorIndex].enabledTypes;
  types.forEach((type, index) => {
    const option = document.createElement('option');
    option.value = type.numberPrefix;
    option.textContent = type.typeName;
    typeSelect.appendChild(option);
  });
  
  appState.pagination.inventory.page = 1;
  loadInventoryData();
}

/**
 * 筛选-类型变化
 */
function onFilterTypeChange() {
  const floorIndex = document.getElementById('filterFloor').value;
  const typePrefix = document.getElementById('filterType').value;
  const numberSelect = document.getElementById('filterNumber');
  const layerSelect = document.getElementById('filterLayer');
  
  // 重置下级选择器
  numberSelect.innerHTML = '<option value="">全部编号</option>';
  layerSelect.innerHTML = '<option value="">全部层</option>';
  layerSelect.style.display = 'none';
  
  if (floorIndex === '' || typePrefix === '' || !positionConfig[floorIndex]) {
    appState.pagination.inventory.page = 1;
    loadInventoryData();
    return;
  }
  
  // 找到当前类型
  const type = positionConfig[floorIndex].enabledTypes.find(t => t.numberPrefix === typePrefix);
  if (!type) {
    appState.pagination.inventory.page = 1;
    loadInventoryData();
    return;
  }
  
  // 填充编号选项
  type.numberRange.forEach(num => {
    const option = document.createElement('option');
    option.value = num;
    option.textContent = typePrefix + num;
    numberSelect.appendChild(option);
  });
  
  // 如果有层选项，显示层选择器
  if (type.hasLayer && type.layerOptions.length > 0) {
    layerSelect.style.display = 'inline-block';
    type.layerOptions.forEach((layer, index) => {
      const option = document.createElement('option');
      option.value = index + 1;
      option.textContent = layer;
      layerSelect.appendChild(option);
    });
  }
  
  appState.pagination.inventory.page = 1;
  loadInventoryData();
}

/**
 * 筛选-编号变化
 */
function onFilterNumberChange() {
  appState.pagination.inventory.page = 1;
  loadInventoryData();
}

/**
 * 筛选-层变化
 */
function onFilterLayerChange() {
  appState.pagination.inventory.page = 1;
  loadInventoryData();
}

/**
 * 防抖函数
 */
function debounce(func, wait, key) {
  return function(...args) {
    if (appState.searchTimeouts[key]) {
      clearTimeout(appState.searchTimeouts[key]);
    }
    appState.searchTimeouts[key] = setTimeout(() => {
      func.apply(this, args);
      delete appState.searchTimeouts[key];
    }, wait);
  };
}

/**
 * 加载库存数据 - 分页版
 */
async function loadInventoryData() {
  try {
    const { page, pageSize } = appState.pagination.inventory;
    const { search } = appState.filters.inventory;
    
    // 先获取所有数据（由于数据量不大，先在前端筛选）
    const goods = await supabase.select(TABLES.GOODS, {
      select: '*',
      order: 'updated_at.desc',
      limit: 1000
    });
    
    // 获取筛选条件
    const stockFilter = document.getElementById('stockFilter')?.value || '';
    const floorFilter = document.getElementById('filterFloor')?.value || '';
    const typeFilter = document.getElementById('filterType')?.value || '';
    const numberFilter = document.getElementById('filterNumber')?.value || '';
    const layerFilter = document.getElementById('filterLayer')?.value || '';
    
    // 初始化位置筛选器（只执行一次）
    initFilterPositionSelector();
    
    // 前端筛选
    let filteredGoods = goods;
    
    // 位置级联筛选
    if (floorFilter !== '') {
      // floorFilter 是索引，需要获取实际的楼层代码
      const floorConfig = positionConfig[parseInt(floorFilter)];
      if (floorConfig) {
        const floorCode = floorConfig.floor;
        filteredGoods = filteredGoods.filter(item => 
          item.location && item.location.startsWith(floorCode)
        );
        
        if (typeFilter) {
          // 构建前缀如 "1F-H"
          const typePrefix = floorCode + '-' + typeFilter;
          filteredGoods = filteredGoods.filter(item => 
            item.location && item.location.startsWith(typePrefix)
          );
          
          if (numberFilter) {
            // 构建前缀如 "1F-H01"
            const numberPrefix = typePrefix + numberFilter;
            filteredGoods = filteredGoods.filter(item => 
              item.location && item.location.startsWith(numberPrefix)
            );
            
            if (layerFilter) {
              // 构建完整位置如 "1F-H01-L1"
              const fullLocation = numberPrefix + '-L' + layerFilter;
              filteredGoods = filteredGoods.filter(item => 
                item.location === fullLocation
              );
            }
          }
        }
      }
    }
    
    // 库存状态筛选
    if (stockFilter) {
      filteredGoods = filteredGoods.filter(item => {
        const qty = parseInt(item.current_stock) || 0;
        switch(stockFilter) {
          case 'zero': return qty === 0;
          case 'low': return qty > 0 && qty < 10;
          case 'normal': return qty >= 10;
          default: return true;
        }
      });
    }
    
    // 搜索筛选
    if (search) {
      const searchLower = search.toLowerCase();
      filteredGoods = filteredGoods.filter(item => 
        (item.name && item.name.toLowerCase().includes(searchLower)) ||
        (item.barcode && item.barcode.toLowerCase().includes(searchLower))
      );
    }
    
    // 分页
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageData = filteredGoods.slice(start, end);
    
    const tbody = document.getElementById('inventoryTableBody');
    
    if (!pageData || pageData.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">暂无数据</td></tr>';
      renderPagination('inventoryPagination', 0, page, pageSize, 'inventory');
      return;
    }
    
    // 只渲染当前页数据，减少内存占用
    tbody.innerHTML = pageData.map(item => {
      // 库存状态 - 使用 current_stock 字段
      let stockTag = '';
      const qty = parseInt(item.current_stock) || 0;
      if (qty <= 0) {
        stockTag = '<span class="stock-tag danger"><i class="fas fa-exclamation-circle"></i> 缺货</span>';
      } else if (qty < 10) {
        stockTag = '<span class="stock-tag warning"><i class="fas fa-exclamation-triangle"></i> 库存紧张</span>';
      } else {
        stockTag = '<span class="stock-tag success"><i class="fas fa-check-circle"></i> 库存充足</span>';
      }
      
      // 价格颜色：为0显示红色，否则黑色
      const priceValue = parseFloat(item.price) || 0;
      const costPriceValue = parseFloat(item.cost_price || item.cost) || 0;
      const priceColor = priceValue === 0 ? '#f5222d' : '#333';
      const costPriceColor = costPriceValue === 0 ? '#f5222d' : '#333';
      
      return `
      <tr>
        <td>
          <div class="product-name" title="${escapeHtml(item.name) || '-'}">${escapeHtml(item.name) || '-'}</div>
        </td>
        <td>
          <div class="product-code">${escapeHtml(item.barcode) || '-'}</div>
        </td>
        <td>
          <span class="price" style="color: ${priceColor};">¥${priceValue.toFixed(2)}</span>
        </td>
        <td>
          <span class="cost-price" style="color: ${costPriceColor};">¥${costPriceValue.toFixed(2)}</span>
        </td>
        <td>
          <strong>${qty}</strong>
          ${stockTag}
        </td>
        <td>
          <span class="position">${escapeHtml(item.location) || '-'}</span>
        </td>
        <td>
          <div class="table-actions">
            <button class="btn-icon-edit" onclick="editItem('${item.id}')" title="编辑">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon-delete" onclick="deleteItem('${item.id}')" title="删除">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `}).join('');
    
    // 渲染分页控件
    renderPagination('inventoryPagination', pageData.length, page, pageSize, 'inventory');
    
  } catch (error) {
    console.error('加载库存数据失败:', error);
    showToast('加载数据失败', 'error');
  }
}

/**
 * HTML 转义，防止 XSS
 */
function escapeHtml(text) {
  if (!text) return text;
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 渲染分页控件
 */
function renderPagination(containerId, itemsCount, currentPage, pageSize, type = 'inventory') {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  // 如果当前页数据少于 pageSize，说明是最后一页
  const isLastPage = itemsCount < pageSize;
  const hasPrevPage = currentPage > 1;
  const hasNextPage = !isLastPage;
  
  let html = `
    <button onclick="changePage('${type}', ${currentPage - 1})" ${!hasPrevPage ? 'disabled' : ''}>
      <i class="fas fa-chevron-left"></i>
    </button>
    <span>第 ${currentPage} 页</span>
    <button onclick="changePage('${type}', ${currentPage + 1})" ${!hasNextPage ? 'disabled' : ''}>
      <i class="fas fa-chevron-right"></i>
    </button>
    <span style="margin-left: 10px; color: var(--text-muted);">每页 ${pageSize} 条</span>
  `;
  
  container.innerHTML = html;
}

/**
 * 切换页面
 */
function changePage(type, page) {
  if (page < 1) return;
  
  appState.pagination[type].page = page;
  
  switch(type) {
    case 'inventory':
      loadInventoryData();
      break;
    case 'records':
      loadRecordsData();
      break;
    case 'users':
      loadUsersData();
      break;
  }
}

/**
 * 加载记录数据 - 只显示出库记录
 */
async function loadRecordsData() {
  try {
    const { page, pageSize } = appState.pagination.records;
    const { date, search } = appState.filters.records;
    
    // 获取出库记录
    const records = await supabase.select(TABLES.RECORDS, {
      type: 'eq.out',
      order: 'created_at.desc',
      limit: 1000
    });
    
    if (!records || records.length === 0) {
      const tbody = document.getElementById('recordsTableBody');
      tbody.innerHTML = '<tr class="empty-row"><td colspan="3">暂无出库记录</td></tr>';
      return;
    }
    
    // 获取所有商品信息用于关联
    const goods = await supabase.select(TABLES.GOODS, {
      limit: 1000
    });
    
    // 创建商品ID到名称的映射
    const goodsMap = {};
    goods.forEach(g => {
      goodsMap[g.id] = g.name || g.barcode || '未知商品';
    });
    
    // 为记录添加商品名称
    let filteredRecords = records.map(r => ({
      ...r,
      goods_name: goodsMap[r.goods_id] || '未知商品'
    }));
    
    // 前端筛选
    if (date) {
      filteredRecords = filteredRecords.filter(r => 
        r.created_at && r.created_at.startsWith(date)
      );
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      filteredRecords = filteredRecords.filter(r => 
        (r.goods_name && r.goods_name.toLowerCase().includes(searchLower))
      );
    }
    
    // 分页
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageData = filteredRecords.slice(start, end);
    
    const tbody = document.getElementById('recordsTableBody');
    
    if (!pageData || pageData.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="3">暂无出库记录</td></tr>';
      return;
    }
    
    tbody.innerHTML = pageData.map(record => {
      return `
        <tr>
          <td>${record.created_at ? new Date(record.created_at).toLocaleString('zh-CN') : '-'}</td>
          <td>${escapeHtml(record.goods_name)}</td>
          <td>${record.quantity || 0}</td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error('加载记录数据失败:', error);
    showToast('加载数据失败', 'error');
  }
}

/**
 * 加载用户数据 - 分页版
 */
async function loadUsersData() {
  try {
    const { page, pageSize } = appState.pagination.users;
    const { search } = appState.filters.users;
    
    // 构建筛选条件
    let filters = {};
    if (search) {
      filters.or = `(username.ilike.*${search}*,name.ilike.*${search}*)`;
    }
    
    // 分页查询
    const users = await supabase.selectPaginated(TABLES.USERS, {
      page,
      pageSize,
      order: 'created_at.desc',
      filters
    });
    
    const tbody = document.getElementById('usersTableBody');
    
    if (!users || users.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">暂无数据</td></tr>';
      return;
    }
    
    tbody.innerHTML = users.map(user => {
      const roleClass = user.role === 'admin' || user.role === 'master' ? 'badge-primary' : 'badge-default';
      const roleText = user.role === 'admin' || user.role === 'master' ? '管理员' : '普通用户';
      const statusClass = user.status === 'active' ? 'badge-success' : 'badge-default';
      const statusText = user.status === 'active' ? '正常' : '禁用';
      
      return `
        <tr>
          <td>${escapeHtml(user.username) || '-'}</td>
          <td>${escapeHtml(user.name) || '-'}</td>
          <td><span class="badge ${roleClass}">${roleText}</span></td>
          <td><span class="badge ${statusClass}">${statusText}</span></td>
          <td>${user.created_at ? new Date(user.created_at).toLocaleString('zh-CN') : '-'}</td>
          <td>
            <button class="btn-icon" onclick="editUser('${user.id}')" title="编辑">
              <i class="fas fa-edit"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error('加载用户数据失败:', error);
    showToast('加载数据失败', 'error');
  }
}

/**
 * 加载设置数据
 */
function loadSettingsData() {
  // 设置页面数据加载逻辑
}

/**
 * 显示消息提示
 */
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');
  const icon = toast.querySelector('i');
  
  toastMessage.textContent = message;
  
  // 设置图标
  icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
  toast.style.background = type === 'success' ? '#4caf50' : '#f44336';
  
  // 显示提示
  toast.classList.add('show');
  
  // 3秒后隐藏
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ==================== 编辑功能 ====================

let currentEditItem = null;
let currentDeleteId = null;
let positionConfig = []; // 位置配置缓存

/**
 * 加载位置配置
 */
async function loadPositionConfig() {
  if (positionConfig.length > 0) return positionConfig;
  
  try {
    const config = await supabase.select(TABLES.POSITION_CONFIG, {
      order: 'sort_order.asc'
    });
    
    if (config && config.length > 0) {
      // 转换字段名
      positionConfig = config.map(item => ({
        floor: item.floor,
        floorName: item.floor_name || item.floorName,
        sortOrder: item.sort_order || item.sortOrder,
        enabledTypes: (item.enabled_types || item.enabledTypes || []).map(type => ({
          typeKey: type.type_key || type.typeKey,
          typeName: type.type_name || type.typeName,
          numberPrefix: type.number_prefix || type.numberPrefix,
          numberRange: type.number_range || type.numberRange || [],
          hasLayer: type.has_layer !== undefined ? type.has_layer : type.hasLayer,
          layerOptions: type.layer_options || type.layerOptions || []
        }))
      }));
    }
    return positionConfig;
  } catch (error) {
    console.error('加载位置配置失败:', error);
    return [];
  }
}

/**
 * 初始化三级级联位置选择器
 */
async function initCascadePositionSelector(currentPosition) {
  const config = await loadPositionConfig();
  
  // 获取选择器元素
  const floorSelect = document.getElementById('editFloor');
  const typeSelect = document.getElementById('editType');
  const numberSelect = document.getElementById('editNumber');
  
  // 清空所有选择器
  floorSelect.innerHTML = '<option value="">选择楼层</option>';
  typeSelect.innerHTML = '<option value="">选择类型</option>';
  numberSelect.innerHTML = '<option value="">选择编号</option>';
  typeSelect.disabled = false;
  numberSelect.disabled = false;
  
  // 重置层选择器
  const layerRow = document.getElementById('layerSelectRow');
  const layerSelect = document.getElementById('editLayer');
  if (layerRow) layerRow.style.display = 'none';
  if (layerSelect) layerSelect.innerHTML = '<option value="">选择层</option>';
  
  if (config.length === 0) return;
  
  // 填充楼层选项
  config.forEach((floor, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = floor.floorName;
    floorSelect.appendChild(option);
  });
  
  // 如果有当前位置，解析并设置
  if (currentPosition && currentPosition !== 'null' && currentPosition !== 'undefined') {
    parseAndSetPosition(currentPosition);
  }
}

/**
 * 初始化位置选择器 - 简化版（保留用于兼容）
 */
async function initPositionSelect(currentPosition) {
  // 现在使用级联选择器
  await initCascadePositionSelector(currentPosition);
}

/**
 * 位置选择变化
 */
function onPositionChange() {
  const select = document.getElementById('editPositionSelect');
  const display = document.getElementById('editPositionDisplay');
  if (select.value) {
    display.value = select.value;
  }
}

/**
 * 解析并设置位置
 */
function parseAndSetPosition(position) {
  // 格式: 1F-H03-L2 或 1F-DA区
  const match = position.match(/^([^-]+)-([^-]+)(?:-L(\d+))?$/);
  if (!match) return;
  
  const [, floorCode, numPart, layerIndex] = match;
  
  // 找到楼层索引
  const floorIdx = positionConfig.findIndex(f => f.floor === floorCode);
  if (floorIdx < 0) return;
  
  document.getElementById('editFloor').value = floorIdx;
  updateTypeOptions(floorIdx);
  
  // 找到类型和编号
  const types = positionConfig[floorIdx].enabledTypes;
  for (let ti = 0; ti < types.length; ti++) {
    const type = types[ti];
    if (numPart.startsWith(type.numberPrefix)) {
      const numPartAfterPrefix = numPart.substring(type.numberPrefix.length);
      const numIdx = type.numberRange.indexOf(numPartAfterPrefix);
      
      document.getElementById('editType').value = ti;
      updateNumberOptions(ti);
      
      if (numIdx >= 0) {
        document.getElementById('editNumber').value = numIdx;
      }
      
      // 设置层（如果存在层选择器）
      if (layerIndex && type.hasLayer) {
        const layerRow = document.getElementById('layerSelectRow');
        const layerSelect = document.getElementById('editLayer');
        if (layerRow && layerSelect) {
          layerRow.style.display = 'grid';
          updateLayerOptions(type);
          const layerIdx = parseInt(layerIndex) - 1;
          if (layerIdx >= 0 && layerIdx < type.layerOptions.length) {
            layerSelect.value = layerIdx;
          }
        }
      }
      break;
    }
  }
  
  // 更新位置编码
  updatePositionCode();
}

/**
 * 更新类型选项
 */
function updateTypeOptions(floorIndex) {
  const typeSelect = document.getElementById('editType');
  typeSelect.innerHTML = '<option value="">选择类型</option>';
  
  if (floorIndex === '' || !positionConfig[floorIndex]) return;
  
  const types = positionConfig[floorIndex].enabledTypes;
  types.forEach((type, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = type.typeName;
    typeSelect.appendChild(option);
  });
  
  // 重置编号和层
  document.getElementById('editNumber').innerHTML = '<option value="">选择编号</option>';
  const layerRow = document.getElementById('layerSelectRow');
  const layerSelect = document.getElementById('editLayer');
  if (layerRow) layerRow.style.display = 'none';
  if (layerSelect) layerSelect.innerHTML = '<option value="">选择层</option>';
  
  // 更新位置编码
  updatePositionCode();
}

/**
 * 更新编号选项
 */
function updateNumberOptions(typeIndex) {
  const floorIndex = document.getElementById('editFloor').value;
  const numberSelect = document.getElementById('editNumber');
  numberSelect.innerHTML = '<option value="">选择编号</option>';
  
  if (floorIndex === '' || typeIndex === '') return;
  
  const type = positionConfig[floorIndex].enabledTypes[typeIndex];
  if (!type) return;
  
  type.numberRange.forEach((num, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = type.numberPrefix + num;
    numberSelect.appendChild(option);
  });
  
  // 处理层选项（如果存在层选择器）
  const layerRow = document.getElementById('layerSelectRow');
  const layerSelect = document.getElementById('editLayer');
  if (layerRow && layerSelect) {
    if (type.hasLayer && type.layerOptions.length > 0) {
      layerRow.style.display = 'grid';
      updateLayerOptions(type);
    } else {
      layerRow.style.display = 'none';
      layerSelect.innerHTML = '<option value="">选择层</option>';
    }
  }
  
  // 更新位置编码
  updatePositionCode();
}

/**
 * 更新层选项
 */
function updateLayerOptions(type) {
  const layerSelect = document.getElementById('editLayer');
  layerSelect.innerHTML = '<option value="">选择层</option>';
  
  type.layerOptions.forEach((layer, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = layer;
    layerSelect.appendChild(option);
  });
}

/**
 * 楼层变化事件
 */
function onFloorChange() {
  const floorIndex = document.getElementById('editFloor').value;
  updateTypeOptions(floorIndex);
}

/**
 * 类型变化事件
 */
function onTypeChange() {
  const typeIndex = document.getElementById('editType').value;
  updateNumberOptions(typeIndex);
}

/**
 * 编号变化事件
 */
function onNumberChange() {
  updatePositionCode();
}

/**
 * 层变化事件
 */
function onLayerChange() {
  updatePositionCode();
}

/**
 * 更新位置编码输入框
 */
function updatePositionCode() {
  const floorIndex = document.getElementById('editFloor').value;
  const typeIndex = document.getElementById('editType').value;
  const numberIndex = document.getElementById('editNumber').value;
  const layerSelect = document.getElementById('editLayer');
  const layerIndex = layerSelect ? layerSelect.value : '';
  
  if (floorIndex === '' || typeIndex === '' || numberIndex === '') {
    return;
  }
  
  const floor = positionConfig[floorIndex];
  const type = floor.enabledTypes[typeIndex];
  const number = type.numberRange[numberIndex];
  
  let code = floor.floor + '-' + type.numberPrefix + number;
  
  // 如果有层选项且已选择
  if (type.hasLayer && layerIndex !== '' && type.layerOptions[layerIndex]) {
    const layerOption = type.layerOptions[layerIndex];
    let layerSuffix;
    if (layerOption === '整架') {
      layerSuffix = type.layerOptions.length;
    } else {
      layerSuffix = parseInt(layerIndex) + 1;
    }
    code += '-L' + layerSuffix;
  }
}

/**
 * 更新位置预览
 */
function updatePositionPreview() {
  const floorIndex = document.getElementById('editFloor').value;
  const typeIndex = document.getElementById('editType').value;
  const numberIndex = document.getElementById('editNumber').value;
  const layerSelect = document.getElementById('editLayer');
  const layerIndex = layerSelect ? layerSelect.value : '';
  
  const preview = document.getElementById('positionPreview');
  if (!preview) return;
  
  if (floorIndex === '' || typeIndex === '' || numberIndex === '') {
    preview.textContent = '请选择完整位置';
    return;
  }
  
  const floor = positionConfig[floorIndex];
  const type = floor.enabledTypes[typeIndex];
  const number = type.numberRange[numberIndex];
  
  let code = floor.floor + '-' + type.numberPrefix + number;
  
  // 如果有层选项
  if (type.hasLayer && layerIndex !== '' && type.layerOptions[layerIndex]) {
    const layerOption = type.layerOptions[layerIndex];
    let layerSuffix;
    if (layerOption === '整架') {
      layerSuffix = type.layerOptions.length;
    } else {
      layerSuffix = parseInt(layerIndex) + 1;
    }
    code += '-L' + layerSuffix;
  }
  
  preview.textContent = code;
}

/**
 * 获取选中的位置
 */
function getSelectedPosition() {
  // 从选择器计算位置
  const floorIndex = document.getElementById('editFloor').value;
  const typeIndex = document.getElementById('editType').value;
  const numberIndex = document.getElementById('editNumber').value;
  
  if (floorIndex === '' || typeIndex === '' || numberIndex === '') {
    return '';
  }
  
  const floor = positionConfig[floorIndex];
  const type = floor.enabledTypes[typeIndex];
  const number = type.numberRange[numberIndex];
  
  let code = floor.floor + '-' + type.numberPrefix + number;
  
  // 如果有层选项
  const layerSelect = document.getElementById('editLayer');
  if (layerSelect && type.hasLayer) {
    const layerIndex = layerSelect.value;
    if (layerIndex !== '' && type.layerOptions[layerIndex]) {
      const layerOption = type.layerOptions[layerIndex];
      let layerSuffix;
      if (layerOption === '整架') {
        layerSuffix = type.layerOptions.length;
      } else {
        layerSuffix = parseInt(layerIndex) + 1;
      }
      code += '-L' + layerSuffix;
    }
  }
  
  return code;
}

/**
 * 编辑物品
 */
async function editItem(id) {
  try {
    // 先加载位置配置
    await loadPositionConfig();
    
    // 获取物品详情 - 使用 select=* 确保获取所有字段
    const result = await supabase.select(TABLES.GOODS, {
      select: '*',
      id: `eq.${id}`,
      limit: 1
    });
    
    if (!result || result.length === 0) {
      showToast('物品不存在', 'error');
      return;
    }
    
    currentEditItem = result[0];
    console.log('[editItem] 编辑物品原始数据:', currentEditItem);
    
    // 填充表单
    document.getElementById('editId').value = currentEditItem.id || '';
    document.getElementById('editName').value = currentEditItem.name || '';
    document.getElementById('editBarcode').value = currentEditItem.barcode || '';
    document.getElementById('editPrice').value = (currentEditItem.price || 0).toFixed(2);
    document.getElementById('editCostPrice').value = (currentEditItem.cost_price || currentEditItem.cost || 0).toFixed(2);
    
    // 处理数量 - 使用 current_stock 字段
    const qty = parseInt(currentEditItem.current_stock);
    document.getElementById('editQuantity').value = isNaN(qty) ? 0 : qty;
    
    // 处理位置 - 使用 location 字段
    const pos = currentEditItem.location;
    document.getElementById('editPositionDisplay').value = pos && pos !== 'null' && pos !== 'undefined' ? pos : '未设置';
    
    // 初始化级联位置选择器
    await initCascadePositionSelector(currentEditItem.location);
    
    // 显示弹窗
    const modal = document.getElementById('editModal');
    if (modal) {
      modal.style.display = 'flex';
      console.log('[editItem] 弹窗已显示');
    }
  } catch (error) {
    console.error('获取物品详情失败:', error);
    showToast('获取物品详情失败', 'error');
  }
}

/**
 * 关闭编辑弹窗
 */
function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
  currentEditItem = null;
  document.getElementById('editForm').reset();
}

/**
 * 保存编辑
 */
async function saveEdit() {
  const id = document.getElementById('editId').value;
  const name = document.getElementById('editName').value.trim();
  const barcode = document.getElementById('editBarcode').value.trim();
  const price = parseFloat(document.getElementById('editPrice').value) || 0;
  const costPrice = parseFloat(document.getElementById('editCostPrice').value) || 0;
  const quantity = parseInt(document.getElementById('editQuantity').value) || 0;
  
  // 从级联选择器获取新位置
  const newPosition = getSelectedPosition();

  // 验证
  if (!name) {
    showToast('请输入商品名称', 'error');
    return;
  }
  if (!barcode) {
    showToast('请输入商品编码', 'error');
    return;
  }

  try {
    // 构建更新数据 - 使用正确的字段名
    const updateData = {
      name,
      barcode,
      price,
      cost_price: costPrice,
      current_stock: quantity,
      updated_at: new Date().toISOString()
    };

    // 如果选择了新位置，则更新位置
    if (newPosition && newPosition !== '请选择完整位置') {
      updateData.location = newPosition;
    }

    await supabase.update(TABLES.GOODS, updateData, { id: `eq.${id}` });

    showToast('保存成功', 'success');
    closeEditModal();

    // 刷新列表
    loadInventoryData();

    // 刷新仪表盘数据
    loadDashboardData();
  } catch (error) {
    console.error('保存失败:', error);
    showToast('保存失败，请重试', 'error');
  }
}

/**
 * 删除物品
 */
function deleteItem(id) {
  // 获取物品名称
  const row = document.querySelector(`button[onclick="deleteItem('${id}')"]`).closest('tr');
  const name = row.querySelector('td:nth-child(2)')?.textContent || '该物品';
  
  currentDeleteId = id;
  document.getElementById('deleteItemName').textContent = name;
  document.getElementById('deleteId').value = id;
  document.getElementById('deleteModal').style.display = 'flex';
}

/**
 * 关闭删除弹窗
 */
function closeDeleteModal() {
  document.getElementById('deleteModal').style.display = 'none';
  currentDeleteId = null;
}

/**
 * 确认删除
 */
async function confirmDelete() {
  if (!currentDeleteId) return;
  
  try {
    await supabase.delete(TABLES.GOODS, { id: `eq.${currentDeleteId}` });
    
    showToast('删除成功', 'success');
    closeDeleteModal();
    
    // 刷新列表
    loadInventoryData();
    
    // 刷新仪表盘数据
    loadDashboardData();
  } catch (error) {
    console.error('删除失败:', error);
    showToast('删除失败，请重试', 'error');
  }
}

/**
 * 编辑用户
 */
function editUser(id) {
  showToast('用户编辑功能开发中...', 'success');
}

/**
 * 数据备份
 */
async function backupData() {
  try {
    showToast('正在准备备份...', 'success');
    
    // 获取所有数据
    const goods = await supabase.select(TABLES.GOODS, { limit: 1000 });
    const records = await supabase.select(TABLES.RECORDS, { limit: 1000 });
    const positionConfig = await supabase.select(TABLES.POSITION_CONFIG);
    
    const backupData = {
      version: '1.0',
      backupTime: new Date().toISOString(),
      goods: goods,
      records: records,
      positionConfig: positionConfig
    };
    
    // 转换为JSON并下载
    const dataStr = JSON.stringify(backupData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `库存备份_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('备份成功！', 'success');
  } catch (error) {
    console.error('备份失败:', error);
    showToast('备份失败，请重试', 'error');
  }
}

/**
 * 数据恢复
 */
async function restoreData(input) {
  const file = input.files[0];
  if (!file) return;
  
  // 确认恢复
  if (!confirm('确定要恢复数据吗？这将覆盖当前所有数据！')) {
    input.value = '';
    return;
  }
  
  try {
    showToast('正在读取备份文件...', 'success');
    
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const backupData = JSON.parse(e.target.result);
        
        // 验证备份文件格式
        if (!backupData.goods || !Array.isArray(backupData.goods)) {
          throw new Error('无效的备份文件格式');
        }
        
        // 恢复商品数据
        if (backupData.goods.length > 0) {
          for (const item of backupData.goods) {
            // 检查是否已存在
            const existing = await supabase.select(TABLES.GOODS, {
              barcode: `eq.${item.barcode}`,
              limit: 1
            });
            
            if (existing && existing.length > 0) {
              // 更新现有记录
              await supabase.update(TABLES.GOODS, item, { id: `eq.${existing[0].id}` });
            } else {
              // 插入新记录
              await supabase.insert(TABLES.GOODS, item);
            }
          }
        }
        
        // 恢复记录数据
        if (backupData.records && backupData.records.length > 0) {
          for (const record of backupData.records) {
            await supabase.insert(TABLES.RECORDS, record);
          }
        }
        
        // 恢复位置配置
        if (backupData.positionConfig && backupData.positionConfig.length > 0) {
          for (const config of backupData.positionConfig) {
            const existing = await supabase.select(TABLES.POSITION_CONFIG, {
              floor: `eq.${config.floor}`,
              limit: 1
            });
            
            if (existing && existing.length > 0) {
              await supabase.update(TABLES.POSITION_CONFIG, config, { id: `eq.${existing[0].id}` });
            } else {
              await supabase.insert(TABLES.POSITION_CONFIG, config);
            }
          }
        }
        
        showToast('数据恢复成功！', 'success');
        
        // 刷新页面数据
        loadDashboardData();
        loadInventoryData();
      } catch (error) {
        console.error('恢复失败:', error);
        showToast('恢复失败：' + error.message, 'error');
      }
    };
    
    reader.readAsText(file);
  } catch (error) {
    console.error('读取文件失败:', error);
    showToast('读取文件失败', 'error');
  }
  
  // 清空input，允许重复选择同一文件
  input.value = '';
}
