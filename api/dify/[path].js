// Vercel Serverless Function - 代理 Dify API 请求
// 路由: /api/dify/*  →  https://api.dify.ai/v1/*

const DIFY_BASE_URL = 'https://api.dify.ai/v1';
const DIFY_API_KEY = 'app-rKBchGsFEQANgwGYC3LPHn8Y';

export default async function handler(req, res) {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 提取 Dify API 路径 (/api/dify/workflows/run → /workflows/run)
    const { path } = req.query;
    const apiPath = Array.isArray(path) ? '/' + path.join('/') : '/' + (path || '');
    const targetUrl = `${DIFY_BASE_URL}${apiPath}`;

    console.log(`[Proxy] ${req.method} ${targetUrl}`);

    const headers = {
      'Authorization': `Bearer ${DIFY_API_KEY}`,
      'Content-Type': 'application/json',
    };

    const fetchOptions = {
      method: req.method,
      headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);

    // 处理流式响应 (SSE)
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
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

    // 处理 JSON 响应
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('[Proxy Error]', error.message);
    res.status(500).json({
      error: 'API 代理请求失败',
      detail: error.message,
    });
  }
}