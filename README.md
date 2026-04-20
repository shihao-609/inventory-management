# 库存管理助手

基于微信小程序的库存管理应用，使用 Supabase 作为后端数据库，支持商品扫码入库、库存管理、数据导出等功能。

## 技术栈

- 微信小程序
- Supabase（云端数据库）
- Vue 3 + Element Plus（Web后台）

## 项目结构

```
├── pages/              # 小程序页面
│   ├── index/          # 首页 - 商品列表
│   ├── scan/           # 扫码页 - 扫码/手动添加商品
│   ├── detail/         # 详情页 - 商品详情与编辑
│   ├── hidden/         # 隐藏页 - 开发者选项
│   ├── admin/          # 管理员页面 - 账号管理
│   └── outRecords/     # 出库记录
├── utils/              # 工具函数
│   ├── supabase.js     # Supabase API客户端
│   └── supabase-config.js  # Supabase配置
├── components/         # 小程序组件
└── web-admin/          # Web后台管理系统（Vue 3）
```

## 数据库配置

数据库配置在 `utils/supabase-config.js` 文件中：

```javascript
const SUPABASE_URL = 'https://xxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJxxx';
```

## 功能说明

### 小程序端
- 商品列表展示（名称、位置、库存、售价）
- 扫码入库/出库
- 商品搜索、筛选
- 出库记录查询
- 账号管理与权限控制
- 数据导出（JSON/CSV）
- 开发者选项（成本价管理）

### Web后台
- 商品管理（增删改查）
- 数据导出Excel
- 部署地址：待配置

## 部署说明

### 小程序
直接在微信开发者工具中打开项目即可。

### Web后台
1. 进入 `web-admin` 目录
2. 执行 `npm install`
3. 执行 `npm run dev` 本地预览
4. 执行 `npm run build` 构建生产版本

## 版本信息

- 当前版本：v2.0.0
- 数据库：Supabase
- 最后更新：2026-04-17
