import { useState, useEffect } from 'react';
import './App.css';
import './style.css';

interface CountInfo {
  notification: number;
  message: number;
  total: number;
}

function App() {
  const [counts, setCounts] = useState<CountInfo>({ notification: 0, message: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Function to get current notification counts
    const getCounts = async () => {
      try {
        setLoading(true);
        // Check active tab if it's a Bluesky tab
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const currentTab = tabs[0];
        
        if (currentTab?.url && (currentTab.url.includes('bsky.app') || currentTab.url.includes('bsky.social'))) {
          // This is a Bluesky tab - request a fresh count
          const response = await browser.tabs.sendMessage(currentTab.id!, { action: 'checkForUpdates' });
          console.log('Response from content script:', response);
        }
        
        // Get the currently cached counts from storage
        const storage = await browser.storage.local.get('notificationCounts');
        if (storage.notificationCounts) {
          setCounts(storage.notificationCounts);
        }
      } catch (error) {
        console.error('Error fetching notification counts:', error);
      } finally {
        setLoading(false);
      }
    };
    
    getCounts();
  }, []);

  const openBluesky = (path: string) => {
    browser.tabs.create({ url: `https://bsky.app${path}` });
    window.close();
  };

  const openOptions = () => {
    browser.runtime.openOptionsPage();
    window.close();
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
      ) : (
        <div className="notification-summary">
          <div className="count-container">
            <div className="count-item badge-container" onClick={() => openBluesky('/notifications')}>
              <div className="count-label">Notifications</div>
              {counts.notification > 0 && (
                <div className={getBadgeClass(counts.notification)}>
                  {counts.notification > 99 ? '99+' : counts.notification}
                </div>
              )}
            </div>
            <div className="count-item badge-container" onClick={() => openBluesky('/messages')}>
              <div className="count-label">Messages</div>
              {counts.message > 0 && (
                <div className={getBadgeClass(counts.message)}>
                  {counts.message > 99 ? '99+' : counts.message}
                </div>
              )}
            </div>
          </div>
          
          <div className="total-count badge-container">
            <span>Total:</span> 
            {counts.total > 0 && (
              <div className={getBadgeClass(counts.total)}>
                {counts.total > 99 ? '99+' : counts.total}
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="popup-actions">
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
          Options
        </button>
      </div>
    </div>
  );
}

export default App;
