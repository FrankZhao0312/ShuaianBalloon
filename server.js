require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { DatabaseSync } = require('node:sqlite');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

// 中间件配置 - 简化CORS配置，确保所有来源都能访问
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

// ===================== 数据库初始化（/tmp目录，Render可写）=====================
const db = new DatabaseSync('/tmp/database.db');
console.log('✅ 数据库连接成功');

// 自动创建表
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

// 邮件发送器配置
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true,
  family: 4,  // 强制使用 IPv4（解决 Render IPv6 连接问题）
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// 根路径测试路由
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Shuaian Balloon API is running!' });
});

// 1. 联系表单提交接口（修正db.run错误）
app.post('/api/contact', async (req, res) => {
  console.log('📨 收到联系表单提交:', req.body);
  const { name, email, company, phone, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Please fill in all required fields' });

  try {
    // ✅ 正确写法：使用prepare()和run()执行参数化查询
    const stmt = db.prepare(`INSERT INTO contacts (name, email, company, phone, message) VALUES (?, ?, ?, ?, ?)`);
    stmt.run(name, email, company, phone, message);

    console.log('📧 开始发送邮件...');
    console.log('📧 发件人:', process.env.EMAIL_USER);
    console.log('📧 收件人:', process.env.EMAIL_TO);
    console.log('📧 SMTP服务器:', process.env.EMAIL_HOST, ':', process.env.EMAIL_PORT);
    
    // 同步发送邮件（确保能看到完整日志）
    try {
      await transporter.sendMail({
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
      });
      console.log('✅ 邮件发送成功');
    } catch (mailErr) {
      console.error('❌ 邮件发送失败:', mailErr);
      console.error('❌ 错误详情:', mailErr.code, mailErr.message);
    }
    
    // 返回成功响应
    res.json({ success: true, message: 'Thank you! We will contact you within 24 hours.' });

  } catch (err) {
    console.error('❌ 联系表单数据库写入失败:', err);
    return res.status(500).json({ error: 'Failed to save data' });
  }
});

// 2. 询价表单提交接口（修正db.run错误）
app.post('/api/inquiry', (req, res) => {
  console.log('💰 收到询价表单提交:', req.body);
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
    // ✅ 正确写法：使用prepare()和run()执行参数化查询
    const stmt = db.prepare(`INSERT INTO inquiries (contact_name, company_name, email, whatsapp_wechat, country_region, business_type, product_series, quantity, custom_requirement, message, sample_request) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(contactName, companyName, email, whatsapp, country, businessType, products, quantity, custom, message, sampleRequest ? 1 : 0);

    // 先返回成功响应，邮件异步发送（不阻塞请求）
    res.json({ success: true, message: 'Thank you! Our sales team will contact you within 24 working hours.' });

    // 异步发送邮件通知
    setTimeout(() => {
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
        if (err) {
          console.error('❌ 邮件发送失败:', err);
        } else {
          console.log('✅ 邮件发送成功');
        }
      });
    }, 100);
  } catch (err) {
    console.error('❌ 询价表单数据库写入失败:', err);
    return res.status(500).json({ error: 'Failed to save data' });
  }
});

// 启动服务器
app.listen(port, () => {
  console.log(`🚀 后端服务已启动，运行在 http://localhost:${port}`);
});