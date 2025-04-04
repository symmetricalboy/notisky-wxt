import { useState, useEffect } from 'react';
import './App.css';
import './style.css';

interface CountInfo {
  notification: number;
  message: number;
  total: number;
}

interface AccountInfo {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
  userId: string;
  counts?: CountInfo;
}

function App() {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverConnected, setServerConnected] = useState<boolean>(false);
  const [authenticating, setAuthenticating] = useState<boolean>(false);

  useEffect(() => {
    // Load accounts and notification data
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Check if we have a connection to the auth server
        const checkServerConnection = async () => {
          // Try up to 3 times with increasing backoff
          const MAX_RETRIES = 3;
          let retryCount = 0;
          let lastError = null;

          while (retryCount < MAX_RETRIES) {
            try {
              // Create an AbortController to timeout the request after 5 seconds
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);
              
              try {
                // Use status endpoint that should return minimal data
                const response = await fetch('https://notisky.symm.app/api/health', {
                  method: 'GET',
                  headers: {
                    'Accept': 'application/json, text/plain, */*'
                  },
                  mode: 'cors',
                  signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                // Any successful response means server is up
                if (response.status >= 200 && response.status < 500) {
                  console.log(`Server is up (status: ${response.status})`);
                  setServerConnected(true);
                  return;
                } else {
                  lastError = `Server error status: ${response.status}`;
                  console.error(lastError);
                }
              } catch (fetchError) {
                clearTimeout(timeoutId);
                lastError = fetchError.message;
                if (fetchError.name === 'AbortError') {
                  console.error('Server connection request timed out');
                } else {
                  console.error('Fetch error:', fetchError);
                }
              }
            } catch (error) {
              lastError = error instanceof Error ? error.message : String(error);
              console.error('Error in server connection check:', error);
            }

            // Increase retry count
            retryCount++;
            
            // If we're going to retry, wait with exponential backoff
            if (retryCount < MAX_RETRIES) {
              const backoffMs = 1000 * Math.pow(2, retryCount - 1);
              console.log(`Retrying connection check in ${backoffMs}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
              await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
          }

          // If we get here, all retries failed
          console.error(`Server connection failed after ${MAX_RETRIES} attempts. Last error: ${lastError}`);
          setServerConnected(false);
        };
        
        // Get the accounts from storage
        const { accounts = [] } = await browser.storage.local.get('accounts');
        
        // Check active tab if it's a Bluesky tab
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const currentTab = tabs[0];
        
        if (currentTab?.url && (currentTab.url.includes('bsky.app') || currentTab.url.includes('bsky.social'))) {
          // This is a Bluesky tab - request a fresh count
          try {
            await browser.tabs.sendMessage(currentTab.id!, { action: 'checkForUpdates' });
          } catch (error) {
            console.log('Unable to refresh counts from Bluesky tab:', error);
          }
        }
        
        // Get the currently cached counts from storage
        const storage = await browser.storage.local.get(['notificationCounts', 'accountNotifications']);
        
        // Map the counts to the appropriate accounts if we have account-specific notifications
        if (storage.accountNotifications && Array.isArray(storage.accountNotifications)) {
          const accountsWithCounts = accounts.map(account => {
            const accountNotifications = storage.accountNotifications.find(
              (an: any) => an.did === account.did
            );
            
            return {
              ...account,
              counts: accountNotifications ? {
                notification: accountNotifications.notification || 0,
                message: accountNotifications.message || 0,
                total: (accountNotifications.notification || 0) + (accountNotifications.message || 0)
              } : {
                notification: 0,
                message: 0,
                total: 0
              }
            };
          });
          
          setAccounts(accountsWithCounts);
        } else {
          // Fallback to using the global counts if we don't have account-specific ones
          const globalCounts = storage.notificationCounts || { notification: 0, message: 0, total: 0 };
          
          if (accounts.length > 0) {
            // If we have one account, assign the global counts to it
            if (accounts.length === 1) {
              setAccounts([{
                ...accounts[0],
                counts: globalCounts
              }]);
            } else {
              // Otherwise just set the accounts without counts
              setAccounts(accounts);
            }
          } else {
            setAccounts([]);
          }
        }
        
        // Check server connection
        await checkServerConnection();
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  const openBluesky = (path: string) => {
    browser.tabs.create({ url: `https://bsky.app${path}` });
    window.close();
  };

  const openOptions = () => {
    browser.runtime.openOptionsPage();
    window.close();
  };
  
  const startAuth = async () => {
    try {
      setAuthenticating(true);
      
      // Use our new authentication method with browser.identity
      const result = await browser.runtime.sendMessage({ action: 'authenticate' });
      
      if (result.success) {
        // Authentication successful, reload data
        window.location.reload();
      } else {
        console.error('Authentication failed:', result.error);
        setAuthenticating(false);
      }
    } catch (error) {
      console.error('Error during authentication:', error);
      setAuthenticating(false);
    }
  };

  // Function to determine badge class based on count value
  const getBadgeClass = (count: number) => {
    return count > 99 ? "badge-counter large-number" : "badge-counter";
  };

  return (
    <div className="popup-container">
      <div className="popup-header">
        <img src="/icon/48.png" alt="Notisky Logo" className="logo" />
        <h1>Notisky</h1>
      </div>
      
      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Checking for notifications...</p>
        </div>
      ) : authenticating ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Authenticating...</p>
        </div>
      ) : (
        <>
          {accounts.length > 0 ? (
            <div className="accounts-container">
              {accounts.map((account, index) => (
                <div key={index} className="account-card">
                  <div className="account-header">
                    <span className="account-handle">@{account.handle}</span>
                  </div>
                  
                  <div className="notification-summary">
                    <div className="count-container">
                      <div 
                        className="count-item badge-container" 
                        onClick={() => openBluesky(`/profile/${account.handle}/notifications`)}
                      >
                        <div className="count-label">Notifications</div>
                        {account.counts && account.counts.notification > 0 && (
                          <div className={getBadgeClass(account.counts.notification)}>
                            {account.counts.notification > 99 ? '99+' : account.counts.notification}
                          </div>
                        )}
                      </div>
                      <div 
                        className="count-item badge-container" 
                        onClick={() => openBluesky('/messages')}
                      >
                        <div className="count-label">Messages</div>
                        {account.counts && account.counts.message > 0 && (
                          <div className={getBadgeClass(account.counts.message)}>
                            {account.counts.message > 99 ? '99+' : account.counts.message}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="total-count badge-container">
                      <span>Total:</span> 
                      {account.counts && account.counts.total > 0 && (
                        <div className={getBadgeClass(account.counts.total)}>
                          {account.counts.total > 99 ? '99+' : account.counts.total}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              <div className="action-buttons">
                <button 
                  className="action-button primary" 
                  onClick={() => openBluesky('/')}
                >
                  Open Bluesky
                </button>
                <button 
                  className="action-button secondary" 
                  onClick={openOptions}
                >
                  Settings
                </button>
              </div>
            </div>
          ) : (
            <div className="no-accounts-container">
              <p>No Bluesky accounts found.</p>
              <p className="server-status">
                Server status: {serverConnected ? <span className="status-online">Online</span> : <span className="status-offline">Offline</span>}
              </p>
              
              <div className="action-buttons">
                <button 
                  className="action-button primary" 
                  onClick={startAuth}
                  disabled={!serverConnected}
                >
                  Connect Account
                </button>
                <button 
                  className="action-button secondary" 
                  onClick={openOptions}
                >
                  Settings
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
