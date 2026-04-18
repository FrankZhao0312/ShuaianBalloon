require('dotenv').config();
const express = require('express');
const cors = require('cors');
// 替换：使用 Node 内置数据库，无需安装 sqlite3
const { DatabaseSync } = require('node:sqlite');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

// 中间件配置
app.use(cors({ origin: process.env.ALLOWED_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// ===================== 修复：内置数据库（零依赖，全平台兼容）=====================
const db = new DatabaseSync('/tmp/database.db');
console.log('✅ 数据库连接成功');

// 自动创建表（和原来逻辑完全一样）
db.exec(`CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp_wechat TEXT,
  country_region TEXT NOT NULL,
  business_type TEXT NOT NULL,
  product_series TEXT NOT NULL,
  quantity TEXT,
  custom_requirement TEXT,
  message TEXT,
  sample_request INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// 邮件发送器配置（不变）
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// ------------------- API接口（完全不变）-------------------
// 【关键修改1】数据库路径改成 Render 可写的 /tmp 目录
const db = new DatabaseSync('/tmp/database.db');

// 1. 联系表单提交接口
app.post('/api/contact', (req, res) => {
  const { name, email, company, phone, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Please fill in all required fields' });

  try {
    // 保存到数据库
    db.run(`INSERT INTO contacts (name, email, company, phone, message) VALUES (?, ?, ?, ?, ?)`,
      [name, email, company, phone, message]);

    // 发送邮件通知
    transporter.sendMail({
      from: `"Shuaian Balloons 网站通知" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_TO,
      subject: '📩 新的客户联系表单提交',
      html: `
        <h3>收到新的客户联系</h3>
        <p><strong>姓名：</strong>${name}</p>
        <p><strong>邮箱：</strong>${email}</p>
        <p><strong>公司：</strong>${company || '未填写'}</p>
        <p><strong>电话：</strong>${phone || '未填写'}</p>
        <p><strong>留言：</strong>${message}</p>
        <p><strong>提交时间：</strong>${new Date().toLocaleString('zh-CN')}</p>
      `
    }, (err) => {
      if (err) console.error('❌ 邮件发送失败:', err);
      res.json({ success: true, message: 'Thank you! We will contact you within 24 hours.' });
    });
  } catch (err) {
    // 【关键修改2】添加错误日志
    console.error('❌ 联系表单数据库写入失败:', err);
    return res.status(500).json({ error: 'Failed to save data' });
  }
});

// 2. 询价表单提交接口
app.post('/api/inquiry', (req, res) => {
  const {
    contactName,
    companyName,
    email,
    whatsapp,
    country,
    businessType,
    products,
    quantity,
    custom,
    message,
    sampleRequest
  } = req.body;

  if (!contactName || !companyName || !email || !country || !businessType || !products) {
    return res.status(400).json({ error: 'Please fill in all required fields' });
  }

  try {
    // 保存到数据库
    db.run(`INSERT INTO inquiries (contact_name, company_name, email, whatsapp_wechat, country_region, business_type, product_series, quantity, custom_requirement, message, sample_request) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [contactName, companyName, email, whatsapp, country, businessType, products, quantity, custom, message, sampleRequest ? 1 : 0]);

    // 发送邮件通知
    transporter.sendMail({
      from: `"Shuaian Balloons 询价通知" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_TO,
      subject: '💰 新的客户询价请求！',
      html: `
        <h3>收到新的客户询价</h3>
        <p><strong>联系人：</strong>${contactName}</p>
        <p><strong>公司名称：</strong>${companyName}</p>
        <p><strong>邮箱：</strong>${email}</p>
        <p><strong>WhatsApp/微信：</strong>${whatsapp || '未填写'}</p>
        <p><strong>国家/地区：</strong>${country}</p>
        <p><strong>业务类型：</strong>${businessType}</p>
        <p><strong>感兴趣的产品：</strong>${products}</p>
        <p><strong>预计数量：</strong>${quantity || '未填写'}</p>
        <p><strong>定制需求：</strong>${custom}</p>
        <p><strong>是否需要样品：</strong>${sampleRequest ? '是' : '否'}</p>
        <p><strong>详细需求：</strong>${message || '未填写'}</p>
        <p><strong>提交时间：</strong>${new Date().toLocaleString('zh-CN')}</p>
      `
    }, (err) => {
      if (err) console.error('❌ 邮件发送失败:', err);
      res.json({ success: true, message: 'Thank you! Our sales team will contact you within 24 working hours.' });
    });
  } catch (err) {
    // 【关键修改2】添加错误日志
    console.error('❌ 询价表单数据库写入失败:', err);
    return res.status(500).json({ error: 'Failed to save data' });
  }
});

// 启动服务器
app.listen(port, () => {
  console.log(`🚀 后端服务已启动，运行在 http://localhost:${port}`);
});