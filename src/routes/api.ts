// Get status of the authentication service
router.get('/status', async (req, res) => {
  try {
    // Set explicit CORS headers for this endpoint
    const origin = req.headers.origin;
    if (origin && (origin.startsWith('chrome-extension://') || origin === process.env.CLIENT_URL)) {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      res.header('Access-Control-Allow-Origin', '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    const accounts = await UserModel.getAllAccounts();

    return res.json({
      success: true,
      status: 'running',
      accounts: accounts.length,
      version: '2.0.0'
    });
  } catch (error: any) {
    console.error('Error fetching status:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
}); 