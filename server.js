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

// 邮件发送配置
const emailConfig = {
  from: process.env.EMAIL_FROM || 'no-reply@shuaianballoon.com',
  to: process.env.EMAIL_TO || '89737892@qq.com'
};

console.log('✅ 邮件配置已加载:', {
  from: emailConfig.from,
  to: emailConfig.to
});

const sendEmail = async (options) => {
  // 优先尝试 Resend（如果配置了）
  if (process.env.RESEND_API_KEY) {
    try {
      const emailData = {
        from: emailConfig.from,
        to: emailConfig.to,
        subject: options.subject,
        html: options.html
      };

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailData),
        timeout: 30000
      });

      if (response.ok) {
        console.log('📧 Resend 邮件发送成功');
        return true;
      } else {
        const errorText = await response.text();
        console.error('❌ Resend 邮件发送失败:', errorText);
      }
    } catch (error) {
      console.error('❌ Resend 邮件发送失败:', error.message || error);
    }
  }

  // 优先尝试标准 SMTP（如果配置了）
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      const nodemailer = require('nodemailer');
      
      const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        requireTLS: true,
        timeout: 30000,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      });

      const mailOptions = {
        from: emailConfig.from,
        to: emailConfig.to,
        subject: options.subject,
        html: options.html
      };

      const info = await transporter.sendMail(mailOptions);
      console.log('📧 SMTP 邮件发送成功:', info.messageId);
      return true;
    } catch (error) {
      console.error('❌ SMTP 邮件发送失败:', error.message || error);
    }
  }

  // 优先尝试 SendGrid（如果配置了）
  if (process.env.SENDGRID_API_KEY) {
    try {
      const emailData = {
        personalizations: [{ to: [{ email: emailConfig.to }] }],
        from: { email: emailConfig.from },
        subject: options.subject,
        content: [{ type: 'text/html', value: options.html }]
      };

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailData),
        timeout: 30000
      });

      if (response.ok) {
        console.log('� SendGrid 邮件发送成功');
        return true;
      } else {
        const errorText = await response.text();
        console.error('❌ SendGrid 邮件发送失败:', errorText);
      }
    } catch (error) {
      console.error('❌ SendGrid 邮件发送失败:', error.message || error);
    }
  }

  // 尝试 MailChannels（Render 集成）
  try {
    const emailData = {
      personalizations: [{ to: [{ email: emailConfig.to }] }],
      from: { email: emailConfig.from },
      subject: options.subject,
      content: [{ type: 'text/html', value: options.html }],
      dkim_domain: 'shuaianballoon.com',
      dkim_selector: 'mc',
      dkim_private_key: process.env.DKIM_PRIVATE_KEY
    };

    console.log('📤 正在发送邮件到:', emailConfig.to);

    const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MailChannels-Sender': JSON.stringify({ email: emailConfig.from })
      },
      body: JSON.stringify(emailData),
      timeout: 30000
    });

    if (response.ok) {
      console.log('📧 MailChannels 邮件发送成功');
      return true;
    } else {
      const errorText = await response.text();
      console.error('❌ MailChannels 邮件发送失败:', errorText);
    }
  } catch (error) {
    console.error('❌ MailChannels 邮件发送失败:', error.message || error);
  }

  // 所有方案都失败
  console.error('❌ 所有邮件发送方案都失败');
  return false;
};

// 根路径测试路由
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Shuaian Balloon API is running!' });
});

// 邮件测试端点
app.get('/api/test-email', async (req, res) => {
  // 检查邮件配置
  const configCheck = {
    EMAIL_FROM: emailConfig.from ? '✅ 已配置' : '❌ 未配置',
    EMAIL_TO: emailConfig.to ? '✅ 已配置' : '❌ 未配置'
  };

  console.log('📋 邮件配置检查:', configCheck);

  // 尝试发送测试邮件
  const result = await sendEmail({
    subject: '📩 测试邮件发送',
    html: '<h3>这是一封测试邮件</h3><p>邮件发送功能测试成功！</p>'
  });

  if (result) {
    res.json({ 
      success: true, 
      message: '测试邮件发送成功！',
      config: configCheck 
    });
  } else {
    res.json({ 
      success: false, 
      message: '邮件发送失败',
      config: configCheck 
    });
  }
});

// 1. 联系表单提交接口
app.post('/api/contact', async (req, res) => {
  console.log('📨 收到联系表单提交:', req.body);
  const { name, email, company, phone, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Please fill in all required fields' });

  // 发送邮件通知
  const emailResult = await sendEmail({
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

  // 保存到数据库
  try {
    await pool.query(
      'INSERT INTO contacts (name, email, company, phone, message) VALUES ($1, $2, $3, $4, $5)',
      [name, email, company, phone, message]
    );
    console.log('✅ 联系表单数据已保存到数据库');
  } catch (dbErr) {
    console.error('❌ 数据库写入失败:', dbErr);
  }

  if (emailResult) {
    res.json({ success: true, message: 'Thank you! We will contact you within 24 hours.' });
  } else {
    res.status(500).json({ 
      success: false, 
      error: '邮件发送失败',
      message: '提交失败，请稍后重试或直接发送邮件到 sales@shuaianballoon.com' 
    });
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

  // 发送邮件通知
  const emailResult = await sendEmail({
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

  // 保存到数据库
  try {
    await pool.query(
      'INSERT INTO inquiries (contact_name, company_name, email, whatsapp_wechat, country_region, business_type, product_series, quantity, custom_requirement, message, sample_request) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
      [contactName, companyName, email, whatsapp, country, businessType, products, quantity, custom, message, sampleRequest ? 1 : 0]
    );
    console.log('✅ 询价表单数据已保存到数据库');
  } catch (err) {
    console.error('❌ 询价表单数据库写入失败:', err);
  }

  if (emailResult) {
    res.json({ success: true, message: 'Thank you! Our sales team will contact you within 24 working hours.' });
  } else {
    res.status(500).json({ 
      success: false, 
      error: '邮件发送失败',
      message: '提交失败，请稍后重试或直接发送邮件到 sales@shuaianballoon.com' 
    });
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
