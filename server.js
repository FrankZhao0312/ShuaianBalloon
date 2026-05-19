require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

// 中间件配置 - 简化CORS配置，确保所有来源都能访问
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

// ===================== PostgreSQL 数据库连接 =====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 初始化数据库表
const initDatabase = async () => {
  try {
    // 创建 contacts 表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        company TEXT,
        phone TEXT,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建 inquiries 表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inquiries (
        id SERIAL PRIMARY KEY,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ PostgreSQL 数据库表初始化完成');
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err);
  }
};

// 启动时初始化数据库
initDatabase();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendEmail = async (options) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_TO,
      subject: options.subject,
      html: options.html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('📧 邮件发送成功:', info.messageId);
  } catch (error) {
    console.error('❌ 邮件发送失败:', error);
  }
};

// 根路径测试路由
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Shuaian Balloon API is running!' });
});

// 1. 联系表单提交接口
app.post('/api/contact', async (req, res) => {
  console.log('📨 收到联系表单提交:', req.body);
  const { name, email, company, phone, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Please fill in all required fields' });

  try {
    // 使用 PostgreSQL 参数化查询
    await pool.query(
      'INSERT INTO contacts (name, email, company, phone, message) VALUES ($1, $2, $3, $4, $5)',
      [name, email, company, phone, message]
    );

    // 返回成功响应
    res.json({ success: true, message: 'Thank you! We will contact you within 24 hours.' });

    // 异步发送邮件通知
    sendEmail({
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

  } catch (err) {
    console.error('❌ 联系表单数据库写入失败:', err);
    return res.status(500).json({ error: 'Failed to save data' });
  }
});

// 2. 询价表单提交接口
app.post('/api/inquiry', async (req, res) => {
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
    // 使用 PostgreSQL 参数化查询
    await pool.query(
      'INSERT INTO inquiries (contact_name, company_name, email, whatsapp_wechat, country_region, business_type, product_series, quantity, custom_requirement, message, sample_request) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
      [contactName, companyName, email, whatsapp, country, businessType, products, quantity, custom, message, sampleRequest ? 1 : 0]
    );

    // 先返回成功响应
    res.json({ success: true, message: 'Thank you! Our sales team will contact you within 24 working hours.' });

    // 异步发送邮件通知
    sendEmail({
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
    });

  } catch (err) {
    console.error('❌ 询价表单数据库写入失败:', err);
    return res.status(500).json({ error: 'Failed to save data' });
  }
});

// 密码验证中间件
const authenticate = (req, res, next) => {
  const password = req.query.password || req.headers['x-admin-password'];
  if (password === process.env.ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Invalid password' });
  }
};

// 3. 查询联系表单数据（管理员接口，需要密码）
app.get('/api/contacts', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contacts ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('❌ 查询联系表单数据失败:', err);
    return res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// 4. 查询询价表单数据（管理员接口，需要密码）
app.get('/api/inquiries', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM inquiries ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('❌ 查询询价表单数据失败:', err);
    return res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// 启动服务器
app.listen(port, () => {
  console.log(`🚀 后端服务已启动，运行在 http://localhost:${port}`);
});
