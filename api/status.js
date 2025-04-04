// API status endpoint for Vercel
export default function handler(req, res) {
  // Set CORS headers to allow access from notisky.symm.app and Chrome extensions
  const origin = req.headers.origin;
  
  // Check if the request is from a Chrome extension
  if (origin && (origin.startsWith('chrome-extension://') || origin === 'https://notisky.symm.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Return status information similar to the Express endpoint
  res.status(200).json({
    success: true,
    status: 'running',
    accounts: 0, // Simplified for standalone endpoint
    version: '2.0.0',
    activeConnections: 0,
    timestamp: new Date().toISOString()
  });
} 