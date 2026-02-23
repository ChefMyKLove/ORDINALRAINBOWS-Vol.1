/**
 * BSV Wallet Selection UI Component
 * Modern wallet selection interface with automatic authentication
 */

class BSVWalletUI {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            theme: 'dark',
            autoAuth: true,
            showFallback: true,
            ...options
        };
        
        this.walletManager = new UnifiedBSVWalletManager();
        this.isVisible = false;
        
        this.init();
    }

    init() {
        this.createStyles();
        this.createHTML();
        this.attachEventListeners();
        this.detectWallets();
    }

    createStyles() {
        const styleId = 'bsv-wallet-ui-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .bsv-wallet-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(10px);
                z-index: 10000;
                display: none;
                align-items: center;
                justify-content: center;
                animation: fadeIn 0.3s ease;
            }

            .bsv-wallet-modal.show {
                display: flex;
            }

            .bsv-wallet-container {
                background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%);
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 20px;
                padding: 30px;
                max-width: 500px;
                width: 90%;
                backdrop-filter: blur(20px);
                box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            }

            .bsv-wallet-header {
                text-align: center;
                margin-bottom: 30px;
            }

            .bsv-wallet-title {
                font-size: 24px;
                font-weight: 600;
                color: white;
                margin: 0 0 10px 0;
            }

            .bsv-wallet-subtitle {
                font-size: 14px;
                color: rgba(255,255,255,0.7);
                margin: 0;
            }

            .bsv-wallet-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
                margin-bottom: 20px;
            }

            .bsv-wallet-option {
                display: flex;
                align-items: center;
                padding: 15px;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.3s ease;
                color: white;
                text-decoration: none;
            }

            .bsv-wallet-option:hover {
                background: rgba(255,255,255,0.1);
                border-color: rgba(255,255,255,0.3);
                transform: translateY(-2px);
                box-shadow: 0 10px 20px rgba(0,0,0,0.2);
            }

            .bsv-wallet-option.disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .bsv-wallet-option.disabled:hover {
                transform: none;
                background: rgba(255,255,255,0.05);
                border-color: rgba(255,255,255,0.1);
            }

            .bsv-wallet-icon {
                width: 40px;
                height: 40px;
                margin-right: 15px;
                border-radius: 8px;
            }

            .bsv-wallet-info {
                flex: 1;
            }

            .bsv-wallet-name {
                font-weight: 600;
                font-size: 16px;
                margin: 0 0 4px 0;
            }

            .bsv-wallet-desc {
                font-size: 12px;
                color: rgba(255,255,255,0.6);
                margin: 0;
            }

            .bsv-wallet-status {
                font-size: 11px;
                padding: 3px 8px;
                border-radius: 12px;
                font-weight: 500;
            }

            .bsv-wallet-status.available {
                background: rgba(0,255,0,0.2);
                color: #00ff00;
            }

            .bsv-wallet-status.unavailable {
                background: rgba(255,0,0,0.2);
                color: #ff6666;
            }

            .bsv-wallet-fallback {
                margin-top: 20px;
                padding: 15px;
                background: rgba(255,165,0,0.1);
                border: 1px solid rgba(255,165,0,0.3);
                border-radius: 12px;
                text-align: center;
            }

            .bsv-wallet-fallback-text {
                font-size: 14px;
                color: rgba(255,255,255,0.8);
                margin: 0 0 10px 0;
            }

            .bsv-wallet-fallback-btn {
                background: rgba(255,165,0,0.8);
                color: black;
                border: none;
                padding: 8px 16px;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .bsv-wallet-fallback-btn:hover {
                background: rgba(255,165,0,1);
                transform: scale(1.05);
            }

            .bsv-wallet-close {
                position: absolute;
                top: 15px;
                right: 15px;
                background: rgba(255,255,255,0.1);
                border: none;
                color: white;
                font-size: 20px;
                width: 35px;
                height: 35px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }

            .bsv-wallet-close:hover {
                background: rgba(255,255,255,0.2);
                transform: scale(1.1);
            }

            .bsv-wallet-loading {
                text-align: center;
                padding: 20px;
                color: white;
            }

            .bsv-wallet-spinner {
                border: 3px solid rgba(255,255,255,0.3);
                border-radius: 50%;
                border-top: 3px solid #fff;
                width: 30px;
                height: 30px;
                animation: spin 1s linear infinite;
                margin: 0 auto 15px;
            }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            .bsv-connect-trigger {
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
                font-size: 16px;
            }

            .bsv-connect-trigger:hover {
                transform: scale(1.05);
                box-shadow: 0 6px 25px rgba(102, 126, 234, 0.6);
            }

            .bsv-connected-status {
                display: flex;
                align-items: center;
                gap: 12px;
                background: linear-gradient(135deg, #43e97b, #38f9d7);
                color: black;
                padding: 12px 20px;
                border-radius: 12px;
                font-weight: 600;
            }

            .bsv-connected-address {
                font-family: monospace;
                font-size: 14px;
            }

            .bsv-disconnect-btn {
                background: rgba(0,0,0,0.2);
                border: 1px solid rgba(0,0,0,0.3);
                color: black;
                padding: 6px 12px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                transition: all 0.2s ease;
            }

            .bsv-disconnect-btn:hover {
                background: rgba(0,0,0,0.3);
                transform: scale(1.05);
            }
        `;
        
        document.head.appendChild(style);
    }

    createHTML() {
        this.container.innerHTML = `
            <button class="bsv-connect-trigger" id="bsv-connect-btn">
                🔗 Connect BSV Wallet
            </button>
            
            <div id="bsv-connected-status" class="bsv-connected-status" style="display: none;">
                <span>✅ Connected:</span>
                <span class="bsv-connected-address" id="bsv-connected-address"></span>
                <button class="bsv-disconnect-btn" id="bsv-disconnect-btn">Disconnect</button>
            </div>

            <div class="bsv-wallet-modal" id="bsv-wallet-modal">
                <div class="bsv-wallet-container">
                    <button class="bsv-wallet-close" id="bsv-wallet-close">✕</button>
                    
                    <div class="bsv-wallet-header">
                        <h2 class="bsv-wallet-title">Connect Your BSV Wallet</h2>
                        <p class="bsv-wallet-subtitle">Choose a wallet to authenticate and access rewards</p>
                    </div>

                    <div id="bsv-wallet-content">
                        <div class="bsv-wallet-loading" id="bsv-wallet-loading">
                            <div class="bsv-wallet-spinner"></div>
                            <p>Detecting available wallets...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        // Connect button
        document.getElementById('bsv-connect-btn').addEventListener('click', () => {
            this.showModal();
        });

        // Close button
        document.getElementById('bsv-wallet-close').addEventListener('click', () => {
            this.hideModal();
        });

        // Disconnect button
        document.getElementById('bsv-disconnect-btn').addEventListener('click', () => {
            this.disconnect();
        });

        // Modal backdrop click
        document.getElementById('bsv-wallet-modal').addEventListener('click', (e) => {
            if (e.target.id === 'bsv-wallet-modal') {
                this.hideModal();
            }
        });
    }

    async detectWallets() {
        const availableWallets = await this.walletManager.detectAvailableWallets();
        this.renderWalletOptions(availableWallets);
    }

    renderWalletOptions(availableWallets) {
        const walletConfigs = {
            yours: {
                name: 'Yours Wallet',
                desc: 'Browser extension wallet',
                icon: '🔮'
            },
            handcash: {
                name: 'HandCash',
                desc: 'Mobile-first BSV wallet',
                icon: '✋'
            },
            babbage: {
                name: 'Babbage SDK',
                desc: 'BRC-100 compatible wallet',
                icon: '🔧'
            },
            relayx: {
                name: 'RelayX',
                desc: 'Social BSV wallet',
                icon: '📡'
            },
            chronos: {
                name: 'Chronos',
                desc: 'Advanced BSV wallet',
                icon: '⏰'
            },
            dotwallet: {
                name: 'DotWallet',
                desc: 'Multi-platform wallet',
                icon: '🔴'
            }
        };

        const content = document.getElementById('bsv-wallet-content');
        
        let html = '<div class="bsv-wallet-grid">';
        
        Object.keys(walletConfigs).forEach(walletType => {
            const config = walletConfigs[walletType];
            const isAvailable = availableWallets.includes(walletType);
            
            html += `
                <div class="bsv-wallet-option ${!isAvailable ? 'disabled' : ''}" 
                     data-wallet="${walletType}" 
                     ${isAvailable ? 'onclick="window.bsvWalletUI.connectWallet(\'' + walletType + '\')"' : ''}>
                    <div class="bsv-wallet-icon">${config.icon}</div>
                    <div class="bsv-wallet-info">
                        <div class="bsv-wallet-name">${config.name}</div>
                        <div class="bsv-wallet-desc">${config.desc}</div>
                    </div>
                    <div class="bsv-wallet-status ${isAvailable ? 'available' : 'unavailable'}">
                        ${isAvailable ? 'Available' : 'Install'}
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        
        // Add fallback option
        if (this.options.showFallback) {
            html += `
                <div class="bsv-wallet-fallback">
                    <p class="bsv-wallet-fallback-text">Don't have a wallet? Use manual signing</p>
                    <button class="bsv-wallet-fallback-btn" onclick="window.bsvWalletUI.showManualFallback()">
                        Manual Signing
                    </button>
                </div>
            `;
        }
        
        content.innerHTML = html;
    }

    async connectWallet(walletType) {
        try {
            this.showLoading(`Connecting to ${walletType}...`);
            
            const result = await this.walletManager.connectWallet(walletType);
            
            if (result.success) {
                success(`${walletType} connected successfully!`);
                this.showConnected(result);
                
                // Auto-authenticate if enabled
                if (this.options.autoAuth) {
                    await this.authenticateWallet(result.address);
                }
                
                this.hideModal();
                
                // Trigger custom event
                this.dispatchEvent('walletConnected', {
                    walletType,
                    address: result.address,
                    result
                });
            }
            
        } catch (error) {
            console.error(`${walletType} connection failed:`, error);
            this.showError(`Connection failed: ${error.message}`);
            
            // Show manual fallback after error
            setTimeout(() => {
                this.showManualOption(walletType, error);
            }, 2000);
        }
    }

    async authenticateWallet(address) {
        try {
            this.showLoading('Authenticating wallet...');
            
            const authResult = await this.walletManager.authenticateWithBSVAuth(address);
            
            if (authResult.success) {
                this.showSuccess('Wallet authenticated successfully!');
                
                // Hide manual authentication UI
                const manualAuth = document.getElementById('manual-auth');
                if (manualAuth) {
                    manualAuth.style.display = 'none';
                }
                
                // Trigger custom event
                this.dispatchEvent('walletAuthenticated', {
                    address,
                    authResult
                });
            }
            
        } catch (error) {    
            console.error('Auto-authentication failed:', error);
            this.showError(`Authentication failed: ${error.message}`);
            
            // Show manual fallback
            this.showManualAuthFallback(address);
        }
    }

    showConnected(connectionResult) {
        const connectBtn = document.getElementById('bsv-connect-btn');
        const statusDiv = document.getElementById('bsv-connected-status');
        const addressSpan = document.getElementById('bsv-connected-address');
        
        connectBtn.style.display = 'none';
        statusDiv.style.display = 'flex';
        addressSpan.textContent = connectionResult.address?.substring(0, 12) + '...';
    }

    async disconnect() {
        try {
            await this.walletManager.disconnect();
            
            const connectBtn = document.getElementById('bsv-connect-btn');
            const statusDiv = document.getElementById('bsv-connected-status');
            
            connectBtn.style.display = 'block';
            statusDiv.style.display = 'none';
            
            this.dispatchEvent('walletDisconnected', {});
            
        } catch (error) {
            console.error('Disconnect failed:', error);
        }
    }

    showModal() {
        document.getElementById('bsv-wallet-modal').classList.add('show');
        this.isVisible = true;
    }

    hideModal() {
        document.getElementById('bsv-wallet-modal').classList.remove('show');
        this.isVisible = false;
    }

    showLoading(message) {
        const content = document.getElementById('bsv-wallet-content');
        content.innerHTML = `
            <div class="bsv-wallet-loading">
                <div class="bsv-wallet-spinner"></div>
                <p>${message}</p>
            </div>
        `;
    }

    showError(message) {
        const content = document.getElementById('bsv-wallet-content');
        content.innerHTML = `
            <div style="text-align: center; color: #ff6666; padding: 20px;">
                <p>❌ ${message}</p>
                <button onclick="window.bsvWalletUI.detectWallets()" style="margin-top: 10px; padding: 8px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); color: white; border-radius: 8px; cursor: pointer;">Try Again</button>
            </div>
        `;
    }

    showSuccess(message) {
        // Show temporary success message
        const content = document.getElementById('bsv-wallet-content');
        content.innerHTML = `
            <div style="text-align: center; color: #00ff00; padding: 20px;">
                <p>✅ ${message}</p>
            </div>
        `;
    }

    showManualFallback() {
        this.hideModal();
        
        // Show manual authentication UI
        const manualAuth = document.getElementById('manual-auth');
        if (manualAuth) {
            manualAuth.style.display = 'block';
            manualAuth.scrollIntoView({ behavior: 'smooth' });
        }
        
        this.dispatchEvent('manualFallbackRequested', {});
    }

    showManualAuthFallback(address) {
        // Re-enable manual authentication for this specific address
        const manualAuth = document.getElementById('manual-auth');
        if (manualAuth) {
            manualAuth.style.display = 'block';
            
            // Pre-fill address if there's an input
            const addressInput = manualAuth.querySelector('input[type="text"]');
            if (addressInput && address) {
                addressInput.value = address;
            }
        }
    }

    dispatchEvent(eventName, detail) {
        const event = new CustomEvent(`bsv-wallet-${eventName}`, {
            detail,
            bubbles: true
        });
        document.dispatchEvent(event);
    }

    // Public API methods
    getConnectionStatus() {
        return this.walletManager.getConnectionStatus();
    }

    async signMessage(message) {
        return await this.walletManager.signMessage(message);
    }
}

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize wallet UI if container exists
    const container = document.getElementById('wallet-connection');
    if (container) {
        window.bsvWalletUI = new BSVWalletUI('wallet-connection', {
            autoAuth: true,
            showFallback: true
        });
        
        console.log('[BSV Wallet UI] Initialized');
    }
});

console.log('[BSV Wallet UI] Component loaded');