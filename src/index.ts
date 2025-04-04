// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if(!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.CLIENT_URL || 'http://localhost:5173'
    ];
    
    // Allow Chrome extension requests
    if(origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }
    
    // Check if the origin is in our allowed list
    if(allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    
    callback(null, false);
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 