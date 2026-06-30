import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

const DIFY_BASE_URL = 'https://api.dify.ai/v1';
const DIFY_API_KEY = 'app-rKBchGsFEQANgwGYC3LPHn8Y';

app.use(cors());
app.use(express.json());

// 代理所有 /api/* 请求到 Dify API
app.use('/api', async (req, res) => {
  try {
    const targetUrl = `${DIFY_BASE_URL}${req.path}`;
    const method = req.method;
    
    console.log(`[Proxy] ${method} ${targetUrl}`);

    const headers = {
      'Authorization': `Bearer ${DIFY_API_KEY}`,
      'Content-Type': 'application/json',
    };

    const fetchOptions = {
      method,
      headers,
    };

    // 对于有 body 的请求，转发 body
    if (method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);

    // 处理流式响应 (SSE)
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } finally {
        reader.releaseLock();
        res.end();
      }
      return;
    }

    // 处理普通 JSON 响应
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('[Proxy Error]', error.message);
    res.status(500).json({ error: '代理请求失败', detail: error.message });
  }
});

// 生产环境：服务静态文件
app.use(express.static('dist'));
app.get('*', (req, res) => {
  res.sendFile('dist/index.html', { root: process.cwd() });
});

app.listen(PORT, () => {
  console.log(`🚀 Dify API 代理服务器运行在 http://localhost:${PORT}`);
  console.log(`📡 代理目标: ${DIFY_BASE_URL}`);
});
