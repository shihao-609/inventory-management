/**
 * Supabase 配置文件
 * 替换微信云开发为 Supabase
 * 
 * 使用说明：
 * 1. 在 Supabase Dashboard 创建项目
 * 2. 获取 Project URL 和 anon public key
 * 3. 在数据库中创建相应的表结构
 * 4. 配置 RLS (Row Level Security) 策略
 */

// Supabase 项目配置
const SUPABASE_URL = 'https://bvgtenrrxdhczlvebjxj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2Z3RlbnJyeGRoY3psdmVianhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMjk5NTEsImV4cCI6MjA5MTkwNTk1MX0.K4HBL1_sGg-79N5CoF_M6V-YlPibSrdoVvd9k515D28';

module.exports = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  
  // 表名配置
  TABLES: {
    GOODS: 'goods',           // 商品表
    CATEGORIES: 'categories', // 分类表
    RECORDS: 'records',       // 进出库记录表
    USERS: 'users',           // 用户表
    SETTINGS: 'settings',     // 设置表
    BARCODES: 'barcodes',     // 条码表
    POSITION_CONFIG: 'position_config' // 位置配置表
  }
};
