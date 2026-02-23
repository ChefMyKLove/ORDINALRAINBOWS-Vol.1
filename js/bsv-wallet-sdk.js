/**
 * BSV Wallet SDK Unified Integration
 * Replaces manual entry with automatic wallet connections
 */

class BSVWalletSDKManager {
    constructor() {
        this.supportedWallets = {
            yours: {
                name: 'Yours Wallet',
                icon: '🔵',
                checkAvailability: () => this.checkYoursWallet(),
                connect: this.connectYours.bind(this),
                signMessage: this.signWithYours.bind(this)
            },
            babbage: {
                name: 'Babbage SDK',
                icon: '🔸',
                checkAvailability: () => typeof window.babbage !== 'undefined',
                connect: this.connectBabbage.bind(this),
                signMessage: this.signWithBabbage.bind(this)
            },
            handcash: {
                name: 'HandCash',
                icon: '✋',
                checkAvailability: () => typeof window.handcash !== 'undefined' || this.checkHandCashConnect(),
                connect: this.connectHandCash.bind(this),
                signMessage: this.signWithHandCash.bind(this)
            },
            relayx: {
                name: 'RelayX',
                icon: '🔄',
                checkAvailability: () => typeof window.relayx !== 'undefined',
                connect: this.connectRelayX.bind(this),
                signMessage: this.signWithRelayX.bind(this)
            },
            satordinals: {
                name: '1SatOrdinals',
                icon: '🎨',
                description: 'Ordinals-focused BSV wallet',
                checkAvailability: () => this.checkSatOrdinals(),
                connect: this.connectSatOrdinals.bind(this),
                signMessage: this.signWithSatOrdinals.bind(this)
            }
        };

        this.connectedWallet = null;
        this.userAddress = null;
        this.isAuthenticated = false;
        
        // Session persistence
        this.sessionKey = 'bsv-wallet-session';
        this.loadPersistedSession();
        
        // Enhanced detection
        this.initializeWalletDetection();
        
        console.log('[BSV-SDK] 🚀 Unified BSV Wallet SDK Manager initialized');
        this.detectAvailableWallets();
    }

    /**
     * Detect which wallets are available
     */
    async detectAvailableWallets() {
        console.log('[BSV-SDK] 🔍 Detecting available BSV wallets...');
        
        const available = {};
        
        for (const [key, wallet] of Object.entries(this.supportedWallets)) {
            try {
                const isAvailable = await wallet.checkAvailability();
                if (isAvailable) {
                    available[key] = wallet;
                    console.log(`[BSV-SDK] ✅ ${wallet.name} detected`);
                } else {
                    console.log(`[BSV-SDK] ❌ ${wallet.name} not available`);
                }
            } catch (err) {
                console.log(`[BSV-SDK] ⚠️ Error detecting ${wallet.name}:`, err.message);
            }
        }

        this.availableWallets = available;
        console.log(`[BSV-SDK] 📊 Found ${Object.keys(available).length} available wallets:`, Object.keys(available));
        
        return available;
    }
    
    /**
     * Enhanced Yours Wallet Detection
     */
    checkYoursWallet() {
        // Multiple detection methods for Yours Wallet
        const detectionMethods = [
            () => typeof window.yours !== 'undefined',
            () => typeof window.YoursWallet !== 'undefined', 
            () => typeof window.bsv !== 'undefined' && window.bsv.yours,
            () => document.querySelector('meta[name="yours-wallet"]'),
            () => window.postMessage && this.pingYoursExtension()
        ];
        
        for (const method of detectionMethods) {
            try {
                if (method()) {
                    console.log('[BSV-SDK] ✅ Yours Wallet detected via method:', method.toString().slice(0, 50) + '...');
                    return true;
                }
            } catch (e) {
                // Silent fail for detection methods
            }
        }
        
        console.log('[BSV-SDK] 🔍 Yours Wallet not detected - trying async detection...');
        this.asyncYoursDetection();
        return false;
    }
    
    /**
     * Ping Yours Extension via postMessage
     */
    pingYoursExtension() {
        if (typeof window.postMessage !== 'function') return false;
        
        try {
            window.postMessage({ type: 'YOURS_WALLET_DETECT' }, '*');
            return false; // Will be handled by event listener
        } catch (e) {
            return false;
        }
    }
    
    /**
     * Async detection for extensions that load late
     */
    async asyncYoursDetection() {
        // Wait for extension to load
        for (let i = 0; i < 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            
            if (window.yours || window.YoursWallet) {
                console.log('[BSV-SDK] ✅ Yours Wallet detected after wait');
                this.refreshAvailableWallets();
                return true;
            }
        }
        return false;
    }
    
    /**
     * Initialize wallet detection and event listeners
     */
    initializeWalletDetection() {
        // Listen for extension injection
        window.addEventListener('message', (event) => {
            if (event.data?.type === 'YOURS_WALLET_READY') {
                console.log('[BSV-SDK] 📨 Yours Wallet ready event received');
                this.refreshAvailableWallets();
            }
        });
        
        // Check for late-loaded extensions
        setTimeout(() => this.refreshAvailableWallets(), 2000);
    }
    
    /**
     * Refresh available wallets (useful when extensions load late)
     */
    async refreshAvailableWallets() {
        const newWallets = await this.detectAvailableWallets();
        console.log('[BSV-SDK] 🔄 Refreshed wallet detection:', Object.keys(newWallets));
    }
    
    /**
     * Session Persistence Methods
     */
    loadPersistedSession() {
        try {
            const session = localStorage.getItem(this.sessionKey);
            if (session) {
                const data = JSON.parse(session);
                
                // Check if session is still valid (24 hour expiry)
                if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
                    this.connectedWallet = data.walletType;
                    this.userAddress = data.address;
                    this.isAuthenticated = data.authenticated;
                    
                    console.log('[BSV-SDK] 💾 Restored session:', data.walletType, this.userAddress?.slice(0,8) + '...');
                    
                    // Dispatch restoration event
                    window.dispatchEvent(new CustomEvent('bsv-wallet-session-restored', {
                        detail: {
                            walletType: this.connectedWallet,
                            address: this.userAddress,
                            restored: true
                        }
                    }));
                    
                    return true;
                }
            }
        } catch (e) {
            console.warn('[BSV-SDK] ⚠️ Failed to load persisted session:', e);
        }
        return false;
    }
    
    saveSession(walletType, address, authenticated = true) {
        const sessionData = {
            walletType,
            address,
            authenticated,
            timestamp: Date.now()
        };
        
        try {
            localStorage.setItem(this.sessionKey, JSON.stringify(sessionData));
            console.log('[BSV-SDK] 💾 Session saved for', walletType);
        } catch (e) {
            console.warn('[BSV-SDK] ⚠️ Failed to save session:', e);
        }
    }
    
    clearSession() {
        try {
            localStorage.removeItem(this.sessionKey);
            console.log('[BSV-SDK] 💾 Session cleared');
        } catch (e) {
            console.warn('[BSV-SDK] ⚠️ Failed to clear session:', e);
        }
    }

    /**
     * Show wallet selection modal
     */
    async showWalletModal() {
        console.log('[BSV-SDK] 🎨 Creating wallet selection modal...');
        
        // Remove existing modal if present
        const existingModal = document.getElementById('bsv-wallet-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'bsv-wallet-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(10px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 20px;
            padding: 30px;
            max-width: 500px;
            width: 90%;
            color: white;
            text-align: center;
            backdrop-filter: blur(20px);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        `;

        // Modal header
        const header = document.createElement('div');
        header.innerHTML = `
            <h2 style="margin: 0 0 10px 0; font-size: 24px;">🔗 Connect Your BSV Wallet</h2>
            <p style="margin: 0 0 25px 0; opacity: 0.8; font-size: 14px;">
                Choose your wallet to authenticate and access ORDINAL RAINBOWS rewards
            </p>
        `;

        // Wallet options
        const walletContainer = document.createElement('div');
        walletContainer.style.cssText = `
            display: grid;
            gap: 15px;
            margin-bottom: 20px;
        `;

        // Check if any wallets are available
        if (Object.keys(this.availableWallets).length === 0) {
            walletContainer.innerHTML = `
                <div style="padding: 20px; text-align: center; opacity: 0.7;">
                    <p>🔍 No BSV wallets detected</p>
                    <p style="font-size: 12px; margin-top: 10px;">
                        Install a BSV wallet extension or use 1SatOrdinals wallet
                    </p>
                </div>
            `;
        } else {
            // Add available wallets
            Object.entries(this.availableWallets).forEach(([key, wallet]) => {
                const walletButton = document.createElement('div');
                walletButton.style.cssText = `
                    display: flex;
                    align-items: center;
                    padding: 15px 20px;
                    background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    font-size: 16px;
                `;

                walletButton.innerHTML = `
                    <span style="font-size: 24px; margin-right: 15px;">${wallet.icon}</span>
                    <div style="flex: 1; text-align: left;">
                        <div style="font-weight: bold;">${wallet.name}</div>
                        ${wallet.description ? `<div style="font-size: 12px; opacity: 0.7; margin-top: 2px;">${wallet.description}</div>` : ''}
                    </div>
                    <span style="opacity: 0.5;">→</span>
                `;

                walletButton.addEventListener('mouseenter', () => {
                    walletButton.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1))';
                    walletButton.style.transform = 'translateY(-2px)';
                });

                walletButton.addEventListener('mouseleave', () => {
                    walletButton.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))';
                    walletButton.style.transform = 'translateY(0)';
                });

                walletButton.addEventListener('click', () => {
                    this.handleWalletSelection(key, wallet);
                    modal.remove();
                });

                walletContainer.appendChild(walletButton);
            });
        }

        // Add manual fallback option
        const manualButton = document.createElement('div');
        manualButton.style.cssText = `
            padding: 10px;
            margin-top: 15px;
            font-size: 14px;
            opacity: 0.6;
            cursor: pointer;
            text-decoration: underline;
        `;
        manualButton.textContent = 'Or use manual address entry (legacy)';
        manualButton.addEventListener('click', () => {
            modal.remove();
            this.fallbackToManual();
        });

        // Close button
        const closeButton = document.createElement('div');
        closeButton.style.cssText = `
            position: absolute;
            top: 15px;
            right: 20px;
            font-size: 24px;
            cursor: pointer;
            opacity: 0.6;
            transition: opacity 0.3s;
        `;
        closeButton.innerHTML = '×';
        closeButton.addEventListener('mouseenter', () => closeButton.style.opacity = '1');
        closeButton.addEventListener('mouseleave', () => closeButton.style.opacity = '0.6');
        closeButton.addEventListener('click', () => modal.remove());

        modalContent.appendChild(closeButton);
        modalContent.appendChild(header);
        modalContent.appendChild(walletContainer);
        modalContent.appendChild(manualButton);
        modal.appendChild(modalContent);

        // Add animation styles
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: scale(0.9); }
                to { opacity: 1; transform: scale(1); }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(modal);
    }

    /**
     * Handle wallet selection and automatic connection
     */
    async handleWalletSelection(walletKey, wallet) {
        console.log(`[BSV-SDK] 🔗 Connecting to ${wallet.name}...`);
        
        try {
            // Show loading state
            this.showLoadingState(`Connecting to ${wallet.name}...`);
            
            // Connect to wallet
            const connectionResult = await wallet.connect();
            
            if (connectionResult.success) {
                this.connectedWallet = walletKey;
                this.userAddress = connectionResult.address;
                
                console.log(`[BSV-SDK] ✅ Connected to ${wallet.name}:`, connectionResult.address);
                
                // Now authenticate with signing
                await this.authenticateWithWallet(walletKey, wallet);
                
            } else {
                throw new Error(connectionResult.error || 'Connection failed');
            }
            
        } catch (err) {
            console.error(`[BSV-SDK] ❌ Connection to ${wallet.name} failed:`, err);
            this.showError(`Failed to connect to ${wallet.name}: ${err.message}`);
        } finally {
            this.hideLoadingState();
        }
    }

    /**
     * Authenticate user by requesting signature
     */
    async authenticateWithWallet(walletKey, wallet) {
        try {
            console.log(`[BSV-SDK] 🔐 Starting authentication with ${wallet.name}...`);
            
            // Generate challenge message
            const timestamp = Date.now();
            const challenge = `I authorize ORDINAL RAINBOWS access to my BSV wallet at ${timestamp}`;
            
            // Show signing state
            this.showLoadingState(`${wallet.name} will open for signing...`);
            
            // Request signature from wallet
            const signatureResult = await wallet.signMessage(challenge, this.userAddress);
            
            if (signatureResult.success) {
                console.log(`[BSV-SDK] ✅ Authentication successful with ${wallet.name}`);
                this.isAuthenticated = true;
                
                // Store authentication data
                this.authData = {
                    wallet: walletKey,
                    address: this.userAddress,
                    signature: signatureResult.signature,
                    challenge: challenge,
                    timestamp: timestamp
                };
                
                this.showSuccess(`Successfully authenticated with ${wallet.name}!`);
                
                // Emit custom event for the rest of the app
                window.dispatchEvent(new CustomEvent('bsv-wallet-authenticated', {
                    detail: this.authData
                }));
                
                return true;
                
            } else {
                throw new Error(signatureResult.error || 'Signature failed');
            }
            
        } catch (err) {
            console.error(`[BSV-SDK] ❌ Authentication failed:`, err);
            this.showError(`Authentication failed: ${err.message}`);
            return false;
        }
    }

    // Individual wallet connection methods
    
    async connectYours() {
        console.log('[BSV-SDK] 🔵 Connecting to Yours Wallet...');
        
        // Multiple detection strategies for Yours Wallet
        const yoursWallet = window.yours || window.YoursWallet || (window.bsv && window.bsv.yours);
        
        if (!yoursWallet) {
            console.error('[BSV-SDK] ❌ Yours Wallet not found. Detected globals:', Object.keys(window).filter(k => k.toLowerCase().includes('yours')));
            throw new Error('🚨 Yours Wallet extension not detected.\n\nPlease:\n1. Install Yours Wallet extension\n2. Refresh this page\n3. Make sure the extension is enabled');
        }
        
        console.log('[BSV-SDK] ✅ Yours Wallet object found:', typeof yoursWallet);
        
        try {
            // Try connection
            const result = await yoursWallet.connect();
            console.log('[BSV-SDK] 🔗 Yours connection result:', result);
            
            const walletData = {
                success: true,
                address: result.address || result.identity || result.bsvAddress,
                publicKey: result.pubkey || result.publicKey,
                walletType: 'yours'
            };
            
            // Save session for persistence
            if (walletData.address) {
                this.saveSession('yours', walletData.address, true);
            }
            
            return walletData;
            
        } catch (err) {
            console.error('[BSV-SDK] ❌ Yours Wallet connection failed:', err);
            return {
                success: false,
                error: `Connection failed: ${err.message}\n\nTry:\n1. Unlock your Yours Wallet\n2. Refresh the page\n3. Check browser console for errors`
            };
        }
    }

    async connectBabbage() {
        console.log('[BSV-SDK] 🔸 Connecting to Babbage...');
        try {
            if (!window.babbage) {
                throw new Error('Babbage SDK not detected. Please install Metanet Desktop or compatible wallet.');
            }
            
            const identity = await window.babbage.getIdentity();
            return {
                success: true,
                address: identity.address,
                identity: identity
            };
        } catch (err) {
            return {
                success: false,
                error: err.message
            };
        }
    }

    async connectHandCash() {
        console.log('[BSV-SDK] ✋ Connecting to HandCash...');
        try {
            // Check for HandCash Connect
            if (this.checkHandCashConnect()) {
                return await this.connectHandCashConnect();
            }
            
            // Check for browser extension
            if (window.handcash) {
                const result = await window.handcash.connect();
                return {
                    success: true,
                    address: result.address
                };
            }
            
            throw new Error('HandCash not available');
        } catch (err) {
            return {
                success: false,
                error: err.message
            };
        }
    }

    async connectRelayX() {
        console.log('[BSV-SDK] 🔄 Connecting to RelayX...');
        try {
            if (!window.relayx) {
                throw new Error('RelayX extension not detected. Please install it first.');
            }
            
            const result = await window.relayx.connect();
            return {
                success: true,
                address: result.address
            };
        } catch (err) {
            return {
                success: false,
                error: err.message
            };
        }
    }

    async connectSatOrdinals() {
        console.log('[BSV-SDK] 🎨 Connecting to 1SatOrdinals...');
        try {
            // 1SatOrdinals might use PostMessage API or web interface
            // This would need to be implemented based on their specific API
            throw new Error('1SatOrdinals integration coming soon. Please use manual entry for now.');
        } catch (err) {
            return {
                success: false,
                error: err.message
            };
        }
    }

    // Wallet signing methods

    async signWithYours(message, address) {
        try {
            const signature = await window.yours.signMessage(message);
            return {
                success: true,
                signature: signature
            };
        } catch (err) {
            return {
                success: false,
                error: err.message
            };
        }
    }

    async signWithBabbage(message, address) {
        try {
            const signature = await window.babbage.signMessage(message, 'identity');
            return {
                success: true,
                signature: signature
            };
        } catch (err) {
            return {
                success: false,
                error: err.message
            };
        }
    }

    async signWithHandCash(message, address) {
        try {
            const signature = await window.handcash.signMessage(message);
            return {
                success: true,
                signature: signature
            };
        } catch (err) {
            return {
                success: false,
                error: err.message
            };
        }
    }

    async signWithRelayX(message, address) {
        try {
            const signature = await window.relayx.signMessage(message);
            return {
                success: true,
                signature: signature
            };
        } catch (err) {
            return {
                success: false,
                error: err.message
            };
        }
    }

    async signWithSatOrdinals(message, address) {
        try {
            // Implementation would depend on 1SatOrdinals API
            throw new Error('1SatOrdinals signing not yet implemented');
        } catch (err) {
            return {
                success: false,
                error: err.message
            };
        }
    }

    // Helper methods

    checkHandCashConnect() {
        // Check if HandCash Connect is available
        return typeof window.HandCashConnect !== 'undefined';
    }

    async connectHandCashConnect() {
        // HandCash Connect OAuth flow
        const app = new window.HandCashConnect({
            appId: 'your-app-id', // You'll need to register with HandCash
            appSecret: 'your-app-secret'
        });
        
        const authUrl = app.getAuthUrl();
        window.open(authUrl, 'handcash-auth', 'width=500,height=600');
        
        // Handle OAuth callback
        return new Promise((resolve) => {
            const handleMessage = (event) => {
                if (event.data.type === 'handcash-auth-success') {
                    window.removeEventListener('message', handleMessage);
                    resolve({
                        success: true,
                        address: event.data.address,
                        token: event.data.token
                    });
                }
            };
            window.addEventListener('message', handleMessage);
        });
    }

    checkSatOrdinals() {
        // Check if 1SatOrdinals interface is available
        // This might be through PostMessage, URL parameters, or other methods
        return false; // Placeholder for now
    }

    fallbackToManual() {
        console.log('[BSV-SDK] 🔄 Falling back to manual address entry...');
        // Trigger the existing manual entry system
        if (window.walletManager && window.walletManager.connectManual) {
            window.walletManager.connectManual();
        }
    }

    // UI helper methods

    showLoadingState(message) {
        const notification = this.createNotification('⏳', message, 'loading');
        document.body.appendChild(notification);
    }

    hideLoadingState() {
        const loadingNotification = document.querySelector('.bsv-notification-loading');
        if (loadingNotification) {
            loadingNotification.remove();
        }
    }

    showSuccess(message) {
        const notification = this.createNotification('✅', message, 'success');
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    showError(message) {
        const notification = this.createNotification('❌', message, 'error');
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }

    createNotification(icon, message, type) {
        const notification = document.createElement('div');
        notification.className = `bsv-notification bsv-notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.8));
            color: white;
            padding: 15px 20px;
            border-radius: 12px;
            border: 1px solid ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            z-index: 10001;
            backdrop-filter: blur(10px);
            max-width: 300px;
            font-size: 14px;
            animation: slideIn 0.3s ease;
        `;
        notification.innerHTML = `${icon} ${message}`;
        return notification;
    }

    // Public API methods

    getAuthenticationData() {
        return this.isAuthenticated ? this.authData : null;
    }

    isWalletAuthenticated() {
        return this.isAuthenticated;
    }

    getConnectedAddress() {
        return this.userAddress;
    }

    disconnect() {
        // Clear session on disconnect
        this.clearSession();
        
        this.connectedWallet = null;
        this.userAddress = null;
        this.isAuthenticated = false;
        this.authData = null;
        console.log('[BSV-SDK] 🔌 Wallet disconnected and session cleared');
        
        window.dispatchEvent(new CustomEvent('bsv-wallet-disconnected'));
    }
}

// Make class available globally
window.BSVWalletSDKManager = BSVWalletSDKManager;

// Global instance
window.BSVWalletSDK = new BSVWalletSDKManager();

// Debug function
window.testBSVSDK = function() {
    console.log('🧪 BSV SDK Test:');
    console.log('- BSVWalletSDKManager class:', typeof BSVWalletSDKManager);
    console.log('- window.BSVWalletSDK:', typeof window.BSVWalletSDK);
    console.log('- Available wallets:', window.BSVWalletSDK ? 'Can check' : 'SDK not available');
    
    if (window.BSVWalletSDK) {
        console.log('✅ SDK is ready - you can call showWalletConnection()');
        return true;
    } else {
        console.error('❌ SDK is not available');
        return false;
    }
};

// Debug function for Yours Wallet specifically
window.debugYoursWallet = function() {
    console.log('🔍 YOURS WALLET DEBUG:');
    console.log('='.repeat(50));
    
    // Check all possible Yours Wallet globals
    const potentialGlobals = ['yours', 'YoursWallet', 'bsv.yours'];
    
    potentialGlobals.forEach(path => {
        const value = path.split('.').reduce((obj, prop) => obj && obj[prop], window);
        console.log(`${path}:`, typeof value, value ? '✅ Found' : '❌ Missing');
        
        if (value) {
            console.log(`  - Methods:`, Object.getOwnPropertyNames(value).filter(prop => typeof value[prop] === 'function'));
        }
    });
    
    // Check for Yours Wallet in document
    const yoursElements = document.querySelectorAll('[*|*="yours"], [class*="yours"], [id*="yours"]');
    console.log('Yours-related DOM elements:', yoursElements.length);
    
    // Check extension detection
    console.log('\n🔍 Extension Detection:');
    const extensions = navigator.plugins ? Array.from(navigator.plugins).map(p => p.name) : [];
    console.log('Browser plugins:', extensions.filter(name => name.toLowerCase().includes('yours')));
    
    // Test basic connectivity
    if (window.yours) {
        console.log('\n🧪 Testing Yours Wallet Connection:');
        try {
            window.yours.connect().then(result => {
                console.log('✅ Connection successful:', result);
            }).catch(err => {
                console.error('❌ Connection failed:', err);
            });
        } catch (e) {
            console.error('❌ Connection test failed:', e);
        }
    }
    
    console.log('\n📝 Recommendations:');
    if (!window.yours) {
        console.log('1. 📝 Install Yours Wallet extension from Chrome Web Store');
        console.log('2. 🔄 Refresh this page after installation');
        console.log('3. 🔓 Make sure Yours Wallet is unlocked');
    } else {
        console.log('✅ Yours Wallet detected! Try connecting now.');
    }
};

// Network and extension check
window.checkBSVWalletStatus = function() {
    console.log('🌐 BSV Wallet Environment Check:');
    console.log('- Page protocol:', window.location.protocol);
    console.log('- User agent:', navigator.userAgent.includes('Chrome') ? 'Chrome ✅' : 'Other browser');
    console.log('- Extensions enabled:', navigator.plugins.length > 0 ? '✅' : '❌');
    
    // Check if we're in a secure context
    console.log('- Secure context (HTTPS):', window.isSecureContext ? '✅' : '❌ (Some wallets require HTTPS)');
    
    // BSV wallet SDK status
    if (window.BSVWalletSDK) {
        console.log('- BSV SDK loaded:', '✅');
        window.BSVWalletSDK.detectAvailableWallets().then(wallets => {
            console.log('- Available wallets:', Object.keys(wallets));
        });
    }
    
    console.log('\n🔧 Available debug commands:');
    console.log('- debugYoursWallet() - Deep dive into Yours Wallet detection');
    console.log('- testBSVSDK() - Test BSV SDK functionality');
    console.log('- showWalletConnection() - Open wallet selection modal');
};

console.log('[BSV-SDK] 🚀 BSV Wallet SDK Manager loaded and ready!');
console.log('[BSV-SDK] 💡 Debug commands: debugYoursWallet(), checkBSVWalletStatus()');
console.log('[BSV-SDK] 💡 Test with: testBSVSDK() or showWalletConnection()');