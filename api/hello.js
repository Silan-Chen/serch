// 测试 Vercel Serverless Function
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  res.status(200).json({
    message: 'Hello from Vercel Serverless Function!',
    timestamp: new Date().toISOString(),
    path: req.url,
    method: req.method
  });
}