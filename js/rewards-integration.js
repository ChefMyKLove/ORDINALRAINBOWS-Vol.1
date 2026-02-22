/**
 * ORDINAL RAINBOWS - BSV Wallet Integration
 * 
 * Supports: Yours Wallet, HandCash, RelayX (Babbage ecosystem)
 * Purpose: Connect user wallet → Verify ordinal ownership → Access rewards
 */

class BSVWalletManager {
    constructor(config = {}) {
        this.config = {
            vaultAddress: config.vaultAddress || '0x_VAULT_ADDRESS_',
            claimAddress: config.claimAddress || '0x_CLAIM_ADDRESS_',
            network: config.network || 'mainnet', // testnet, mainnet
            ...config
        };
        
        this.wallet = null;
        this.address = null;
        this.provider = null;
        this.isConnected = false;
        this.walletType = null;
        
        // Initialize on load
        this.init();
    }
    
    /**
     * Initialize wallet detection
     */
    async init() {
        console.log('[BSV] Initializing wallet detection...');
        
        // Check for available wallets in order of preference
        const availableWallets = await this.detectAvailableWallets();
        console.log('[BSV] Available wallets:', availableWallets);
        
        return availableWallets;
    }
    
    /**
     * Detect which wallets are available
     */
    async detectAvailableWallets() {
        const wallets = [];
        
        // 1. Check for Yours Wallet
        if (window.yours) {
            wallets.push({
                name: 'Yours',
                type: 'yours',
                available: true,
                logo: '🔐'
            });
        }
        
        // 2. Check for HandCash (via Babbage)
        if (window.HandCash) {
            wallets.push({
                name: 'HandCash',
                type: 'handcash',
                available: true,
                logo: '🤝'
            });
        }
        
        // 3. Check for RelayX
        if (window.relayx) {
            wallets.push({
                name: 'RelayX',
                type: 'relayx',
                available: true,
                logo: '⚡'
            });
        }
        
        // 4. Fallback: Babbage (universal connector)
        if (window.crypto && window.crypto.subtle) {
            wallets.push({
                name: 'Babbage (Universal)',
                type: 'babbage',
                available: true,
                logo: '🎭'
            });
        }
        
        return wallets;
    }
    
    /**
     * Connect to wallet (prompt user to choose)
     */
    async connect(walletType = null) {
        try {
            console.log('[BSV] Attempting connection...');
            
            // If no wallet specified, let user choose
            if (!walletType) {
                const wallets = await this.detectAvailableWallets();
                if (wallets.length === 0) {
                    throw new Error('No BSV wallets detected. Please install Yours, HandCash, or RelayX.');
                }
                
                // Auto-select if only one available
                if (wallets.length === 1) {
                    walletType = wallets[0].type;
                } else {
                    // User should select manually
                    throw new Error('Multiple wallets available. Please specify which to use.');
                }
            }
            
            // Connect based on wallet type
            let result;
            switch(walletType) {
                case 'yours':
                    result = await this.connectYours();
                    break;
                case 'handcash':
                    result = await this.connectHandCash();
                    break;
                case 'relayx':
                    result = await this.connectRelayX();
                    break;
                case 'babbage':
                    result = await this.connectBabbage();
                    break;
                default:
                    throw new Error(`Unknown wallet type: ${walletType}`);
            }
            
            this.isConnected = true;
            this.walletType = walletType;
            console.log('[BSV] Connected:', { address: this.address, wallet: this.walletType });
            
            return {
                address: this.address,
                wallet: this.walletType,
                connected: true
            };
            
        } catch (err) {
            console.error('[BSV] Connection error:', err.message);
            throw err;
        }
    }
    
    /**
     * Connect to Yours Wallet
     */
    async connectYours() {
        try {
            if (!window.yours) {
                throw new Error('Yours wallet is not installed. Please install it at https://www.yours.org');
            }
            
            // Check if available (some wallets use this pattern)
            if (typeof window.yours.isAvailable === 'function') {
                const isAvailable = await window.yours.isAvailable();
                if (!isAvailable) {
                    throw new Error('Yours wallet is not initialized. Please check your wallet extension.');
                }
            }
            
            // Get user identity
            let identity;
            if (typeof window.yours.getIdentity === 'function') {
                identity = await window.yours.getIdentity();
            } else if (typeof window.yours.getUser === 'function') {
                identity = await window.yours.getUser();
            } else if (typeof window.yours.requestAddress === 'function') {
                identity = { address: await window.yours.requestAddress() };
            } else {
                throw new Error('Yours wallet methods not recognized. Please update your wallet extension.');
            }
            
            this.address = identity.address || identity.publicKey || identity.userId;
            if (!this.address) {
                throw new Error('Could not retrieve address from Yours wallet');
            }
            
            this.wallet = window.yours;
            this.provider = window.yours;
            
            console.log('[BSV] Yours connected:', this.address);
            return true;
            
        } catch (err) {
            console.error('[BSV] Yours connection error:', err);
            throw new Error(`Yours: ${err.message}`);
        }
    }
    
    /**
     * Connect to HandCash (Babbage)
     */
    async connectHandCash() {
        try {
            // Using Babbage as the universal connector for HandCash
            if (!window.HandCash && !window.babbage) {
                throw new Error('HandCash/Babbage not available');
            }
            
            const handcash = window.HandCash || window.babbage;
            const permissions = ['SIGN_TRANSACTIONS', 'GET_BALANCE'];
            
            // Request connection with permissions
            const { address, identityKey } = await handcash.getUser({ 
                permissions 
            });
            
            this.address = address;
            this.wallet = handcash;
            this.provider = handcash;
            
            console.log('[BSV] HandCash connected:', this.address);
            return true;
            
        } catch (err) {
            console.error('[BSV] HandCash connection error:', err);
            throw new Error(`HandCash connection failed: ${err.message}`);
        }
    }
    
    /**
     * Connect to RelayX
     */
    async connectRelayX() {
        try {
            if (!window.relayx) {
                throw new Error('RelayX not installed');
            }
            
            // Request connection
            const result = await window.relayx.getBalance();
            this.address = result.address;
            this.wallet = window.relayx;
            this.provider = window.relayx;
            
            console.log('[BSV] RelayX connected:', this.address);
            return true;
            
        } catch (err) {
            console.error('[BSV] RelayX connection error:', err);
            throw new Error(`RelayX connection failed: ${err.message}`);
        }
    }
    
    /**
     * Connect via Babbage (universal)
     */
    async connectBabbage() {
        try {
            if (!window.babbage) {
                throw new Error('Babbage is not available');
            }
            
            // Get user info
            const user = await window.babbage.getUser();
            this.address = user.identity || user.address;
            this.wallet = window.babbage;
            this.provider = window.babbage;
            
            console.log('[BSV] Babbage connected:', this.address);
            return true;
            
        } catch (err) {
            console.error('[BSV] Babbage connection error:', err);
            throw new Error(`Babbage connection failed: ${err.message}`);
        }
    }
    
    /**
     * Disconnect wallet
     */
    async disconnect() {
        this.address = null;
        this.wallet = null;
        this.provider = null;
        this.isConnected = false;
        this.walletType = null;
        console.log('[BSV] Disconnected');
    }
    
    /**
     * Get current address
     */
    getAddress() {
        return this.address;
    }
    
    /**
     * Get wallet type
     */
    getWalletType() {
        return this.walletType;
    }
    
    /**
     * Check if connected
     */
    isWalletConnected() {
        return this.isConnected;
    }
    
    /**
     * Get wallet balance
     */
    async getBalance() {
        if (!this.isConnected) {
            throw new Error('Wallet not connected');
        }
        
        try {
            let balance;
            
            if (this.walletType === 'yours') {
                const balances = await this.wallet.getBalance();
                balance = balances.balance;
            } else if (this.walletType === 'handcash') {
                const balances = await this.wallet.getBalance();
                balance = balances.balance;
            } else if (this.walletType === 'relayx') {
                const balances = await this.wallet.getBalance();
                balance = balances.balance;
            } else if (this.walletType === 'babbage') {
                const balances = await this.wallet.getBalance();
                balance = balances.satoshis;
            }
            
            return balance;
            
        } catch (err) {
            console.error('[BSV] Error getting balance:', err);
            return 0;
        }
    }
    
    /**
     * Sign a message (for verification)
     */
    async signMessage(message) {
        if (!this.isConnected) {
            throw new Error('Wallet not connected');
        }
        
        try {
            let signature;
            
            if (this.walletType === 'yours') {
                signature = await this.wallet.signMessage(message);
            } else if (this.walletType === 'handcash') {
                signature = await this.wallet.signMessage(message);
            } else if (this.walletType === 'relayx') {
                signature = await this.wallet.signMessage(message);
            } else if (this.walletType === 'babbage') {
                signature = await this.wallet.signMessage(message);
            }
            
            return signature;
            
        } catch (err) {
            console.error('[BSV] Error signing message:', err);
            throw err;
        }
    }
    
    /**
     * Get inscription/ordinal data
     */
    async getOrdinalData() {
        if (!this.isConnected) {
            throw new Error('Wallet not connected');
        }
        
        try {
            // Query 1Sat Ordinals API to find ordinals held by this address
            const response = await fetch(
                `https://api.1sat.market/api/txos/address/${this.address}?limit=1000`
            );
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            const data = await response.json();
            return data.txos || [];
            
        } catch (err) {
            console.error('[BSV] Error fetching ordinals:', err);
            return [];
        }
    }
}

/**
 * Rewards Integration - connects wallet to smart contract
 */
class OrdinalRewardsManager {
    constructor(walletManager, config = {}) {
        this.walletManager = walletManager;
        this.config = {
            claimAddress: config.claimAddress || '0x_CLAIM_ADDRESS_',
            vaultAddress: config.vaultAddress || '0x_VAULT_ADDRESS_',
            rpcUrl: config.rpcUrl || 'https://bsv-testnet-rpc.mrbean.io',
            ...config
        };
        
        this.web3 = null;
        this.claimContract = null;
        this.vaultContract = null;
        
        this.initWeb3();
    }
    
    /**
     * Initialize Web3 connection
     */
    initWeb3() {
        // Get provider from wallet
        let provider = this.walletManager.provider;
        
        // Fallback to RPC if no provider
        if (!provider) {
            provider = this.config.rpcUrl;
        }
        
        try {
            // Initialize web3 (assuming ethers.js or web3.js available)
            if (typeof ethers !== 'undefined') {
                this.web3 = new ethers.providers.JsonRpcProvider(this.config.rpcUrl);
                console.log('[REWARDS] Web3 initialized with ethers.js');
            } else if (typeof Web3 !== 'undefined') {
                this.web3 = new Web3(provider);
                console.log('[REWARDS] Web3 initialized with web3.js');
            }
        } catch (err) {
            console.error('[REWARDS] Web3 initialization error:', err);
        }
    }
    
    /**
     * Check if wallet holds Vol. 1 ordinal
     */
    async ownsOrdinal() {
        try {
            if (!this.walletManager.isWalletConnected()) {
                return false;
            }
            
            // Method 1: Check via smart contract
            try {
                // This would call vault.ownsOrdinal(address)
                // Placeholder for contract call
                console.log('[REWARDS] Checking ordinal ownership via contract...');
                // const result = await this.vaultContract.methods.ownsOrdinal(address).call();
                // return result;
            } catch (err) {
                console.log('[REWARDS] Contract check unavailable, trying API...');
            }
            
            // Method 2: Check via 1Sat Ordinals API
            const ordinals = await this.walletManager.getOrdinalData();
            
            // Get Vol. 1 inscription IDs from config
            const vol1Inscriptions = [
                "704a7653a4d8c4d7bf356e1d2aeb0f0349b91c7a34c6b7eee4b4b0f5ae054a33", // AlchemyBow
                "868d6443ccb191aee5211c64273beb140bdbbe9e7293a70189acf6a46263f6f6", // AuroraBow#1
                // ... Add all 65 here
            ];
            
            // Check if any owned ordinals match Vol. 1
            const hasOrdinal = ordinals.some(ord => 
                vol1Inscriptions.includes(ord.inscription || ord.id)
            );
            
            console.log('[REWARDS] Ordinal check:', hasOrdinal);
            return hasOrdinal;
            
        } catch (err) {
            console.error('[REWARDS] Error checking ordinals:', err);
            return false;
        }
    }
    
    /**
     * Get unclaimed rewards
     */
    async getUnclaimedRewards() {
        try {
            if (!this.walletManager.isWalletConnected()) {
                return null;
            }
            
            const address = this.walletManager.getAddress();
            
            // Would call: claimContract.getUnclaimedRewards(address)
            // Placeholder response:
            console.log('[REWARDS] Fetching unclaimed rewards for:', address);
            
            return {
                mnee: '100.00',
                bsv: '0.5',
                bsv21: '50.00',
                total: '150.50'
            };
            
        } catch (err) {
            console.error('[REWARDS] Error fetching rewards:', err);
            return null;
        }
    }
    
    /**
     * Get claimed history
     */
    async getClaimedRewards() {
        try {
            if (!this.walletManager.isWalletConnected()) {
                return null;
            }
            
            const address = this.walletManager.getAddress();
            
            // Would call: claimContract.getClaimedRewards(address)
            console.log('[REWARDS] Fetching claimed history for:', address);
            
            return {
                mnee: '500.00',
                bsv: '2.5',
                bsv21: '200.00',
                total: '702.50'
            };
            
        } catch (err) {
            console.error('[REWARDS] Error fetching history:', err);
            return null;
        }
    }
    
    /**
     * Claim all rewards
     */
    async claimAllRewards() {
        try {
            if (!this.walletManager.isWalletConnected()) {
                throw new Error('Wallet not connected');
            }
            
            const address = this.walletManager.getAddress();
            console.log('[REWARDS] Claiming rewards for:', address);
            
            // This would execute the claim transaction
            // Placeholder:
            return {
                success: true,
                txHash: '0x_transaction_hash_',
                message: 'Rewards claimed successfully!'
            };
            
        } catch (err) {
            console.error('[REWARDS] Claim error:', err);
            throw err;
        }
    }
}

/**
 * UI Helper - Updates dashboard display with modern modal
 */
class RewardsDashboardUI {
    constructor(walletManager, rewardsManager) {
        this.walletManager = walletManager;
        this.rewardsManager = rewardsManager;
        this.isOpen = false;
        this.modalCreated = false;
    }
    
    /**
     * Initialize UI elements
     */
    initializeUI() {
        // Connect button
        const connectBtn = document.getElementById('connectWallet');
        if (connectBtn) {
            connectBtn.addEventListener('click', () => this.showWalletModal());
        }
        
        // Disconnect button
        const disconnectBtn = document.getElementById('disconnectWallet');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => this.disconnect());
        }
        
        // Claim button
        const claimBtn = document.getElementById('claimAllBtn');
        if (claimBtn) {
            claimBtn.addEventListener('click', () => this.handleClaim());
        }
        
        // Create wallet modal once
        this.createWalletModal();
        
        // Auto-detect wallets and show modal if any available
        this.autoDetectWallets();
    }
    
    /**
     * Create wallet modal HTML
     */
    createWalletModal() {
        if (this.modalCreated) return;
        
        const modal = document.createElement('div');
        modal.id = 'walletModal';
        modal.className = 'wallet-modal hidden';
        modal.innerHTML = `
            <div class="wallet-modal-content">
                <div class="wallet-modal-header">
                    <h2>🔐 Connect Your BSV Wallet</h2>
                    <button class="wallet-modal-close" id="walletModalClose">&times;</button>
                </div>
                <div class="wallet-modal-body">
                    <p class="wallet-modal-subtitle">Select a wallet to verify your Vol. 1 ordinals and claim rewards</p>
                    <div class="wallet-options" id="walletOptions">
                        <div class="wallet-loading">
                            <div class="loading-spinner"></div>
                            <p>Detecting wallets...</p>
                        </div>
                    </div>
                </div>
                <div class="wallet-modal-footer">
                    <p class="wallet-help">Don't have a wallet? <a href="https://www.yours.org" target="_blank">Install Yours →</a></p>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close button
        document.getElementById('walletModalClose').addEventListener('click', () => this.closeWalletModal());
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeWalletModal();
            }
        });
        
        this.modalCreated = true;
    }
    
    /**
     * Auto-detect wallets silently on page load (don't auto-show modal)
     */
    async autoDetectWallets() {
        try {
            // Give wallets time to inject into window
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const wallets = await this.walletManager.detectAvailableWallets();
            
            // Just detect - don't show modal automatically
            // User will click "Connect Wallet" button to open modal
            console.log('[UI] Available wallets detected:', wallets.length);
        } catch (err) {
            console.error('[UI] Auto-detect error:', err);
        }
    }
    
    /**
     * Show wallet selection modal
     */
    async showWalletModal() {
        try {
            const modal = document.getElementById('walletModal');
            if (!modal) {
                this.createWalletModal();
            }
            
            const wallets = await this.walletManager.detectAvailableWallets();
            const optionsContainer = document.getElementById('walletOptions');
            
            if (wallets.length === 0) {
                optionsContainer.innerHTML = `
                    <div class="wallet-error">
                        <div class="error-icon">⚠️</div>
                        <p>No BSV wallets detected</p>
                        <p class="error-subtitle">Install one of the following:</p>
                        <div class="wallet-links">
                            <a href="https://www.yours.org" target="_blank" class="wallet-link">Yours Wallet</a>
                            <a href="https://handcash.io" target="_blank" class="wallet-link">HandCash</a>
                            <a href="https://relayx.com" target="_blank" class="wallet-link">RelayX</a>
                        </div>
                    </div>
                `;
            } else {
                // Build wallet buttons
                optionsContainer.innerHTML = wallets.map((wallet, index) => `
                    <button class="wallet-option" data-wallet="${wallet.type}">
                        <div class="wallet-option-icon">${wallet.logo}</div>
                        <div class="wallet-option-info">
                            <div class="wallet-option-name">${wallet.name}</div>
                            <div class="wallet-option-status">Click to connect</div>
                        </div>
                        <div class="wallet-option-arrow">→</div>
                    </button>
                `).join('');
                
                // Add click handlers
                optionsContainer.querySelectorAll('.wallet-option').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const walletType = e.currentTarget.dataset.wallet;
                        await this.connectWallet(walletType);
                    });
                });
            }
            
            // Show modal
            document.getElementById('walletModal').classList.remove('hidden');
            this.isOpen = true;
            
        } catch (err) {
            console.error('[UI] Modal error:', err);
        }
    }
    
    /**
     * Close wallet modal
     */
    closeWalletModal() {
        const modal = document.getElementById('walletModal');
        if (modal) {
            modal.classList.add('hidden');
        }
        this.isOpen = false;
    }
    
    /**
     * Connect to wallet
     */
    async connectWallet(walletType) {
        try {
            // Update UI to show connecting status
            const walletBtn = document.querySelector(`[data-wallet="${walletType}"]`);
            const statusDiv = walletBtn.querySelector('.wallet-option-status');
            const originalStatus = statusDiv.textContent;
            statusDiv.textContent = '🔄 Connecting...';
            walletBtn.style.opacity = '0.7';
            walletBtn.style.pointerEvents = 'none';
            
            // Connect
            const result = await this.walletManager.connect(walletType);
            
            // Check if owns ordinal
            statusDiv.textContent = '🔍 Verifying ordinals...';
            const hasOrdinal = await this.rewardsManager.ownsOrdinal();
            
            if (!hasOrdinal) {
                throw new Error('You must hold a Vol. 1 ORDINAL RAINBOWS to claim rewards');
            }
            
            // Update UI
            statusDiv.textContent = '✓ Connected!';
            setTimeout(() => {
                this.closeWalletModal();
                this.updateConnectedUI(result.address);
                this.refreshRewards();
            }, 500);
            
        } catch (err) {
            console.error('[UI] Connection error:', err);
            const walletBtn = document.querySelector(`[data-wallet="${walletType}"]`);
            const statusDiv = walletBtn.querySelector('.wallet-option-status');
            statusDiv.textContent = '❌ ' + err.message;
            statusDiv.style.color = '#ff6464';
            
            // Reset after 2 seconds
            setTimeout(() => {
                statusDiv.textContent = 'Click to connect';
                statusDiv.style.color = '#888';
                walletBtn.style.opacity = '1';
                walletBtn.style.pointerEvents = 'auto';
            }, 2000);
        }
    }
    
    /**
     * Update UI after connection
     */
    updateConnectedUI(address) {
        const connectBtn = document.getElementById('connectWallet');
        const walletStatus = document.getElementById('walletStatus');
        const walletAddress = document.getElementById('walletAddress');
        
        if (connectBtn) {
            connectBtn.classList.add('hidden');
        }
        if (walletStatus) {
            walletStatus.classList.remove('hidden');
        }
        if (walletAddress) {
            walletAddress.textContent = this.truncateAddress(address);
        }
        
        // Show rewards dashboard
        const dashboard = document.getElementById('rewardsDashboard');
        if (dashboard) {
            dashboard.classList.remove('hidden');
        }
    }
    
    /**
     * Refresh rewards display
     */
    async refreshRewards() {
        try {
            // Get unclaimed
            const unclaimed = await this.rewardsManager.getUnclaimedRewards();
            if (unclaimed) {
                document.getElementById('mneeUnclaimed').textContent = unclaimed.mnee;
                document.getElementById('bsvUnclaimed').textContent = unclaimed.bsv;
                document.getElementById('bsv21Unclaimed').textContent = unclaimed.bsv21;
                document.getElementById('totalUnclaimed').textContent = unclaimed.total;
            }
            
            // Get claimed
            const claimed = await this.rewardsManager.getClaimedRewards();
            if (claimed) {
                document.getElementById('mneeClaimed').textContent = claimed.mnee;
                document.getElementById('bsvClaimed').textContent = claimed.bsv;
                document.getElementById('bsv21Claimed').textContent = claimed.bsv21;
                document.getElementById('totalClaimed').textContent = claimed.total;
            }
            
        } catch (err) {
            console.error('Error refreshing rewards:', err);
        }
    }
    
    /**
     * Handle claim action
     */
    async handleClaim() {
        try {
            const btn = document.getElementById('claimAllBtn');
            btn.disabled = true;
            btn.textContent = 'Claiming...';
            
            const result = await this.rewardsManager.claimAllRewards();
            
            if (result.success) {
                btn.textContent = 'Claimed! ✓';
                alert(result.message);
                
                // Refresh after 2 seconds
                setTimeout(() => {
                    this.refreshRewards();
                    btn.disabled = false;
                    btn.textContent = 'Claim All Rewards';
                }, 2000);
            }
            
        } catch (err) {
            alert('Claim error: ' + err.message);
            const btn = document.getElementById('claimAllBtn');
            btn.disabled = false;
            btn.textContent = 'Claim All Rewards';
        }
    }
    
    /**
     * Disconnect wallet
     */
    async disconnect() {
        await this.walletManager.disconnect();
        
        const connectBtn = document.getElementById('connectWallet');
        const walletStatus = document.getElementById('walletStatus');
        const dashboard = document.getElementById('rewardsDashboard');
        
        if (connectBtn) {
            connectBtn.classList.remove('hidden');
            connectBtn.textContent = 'Connect BSV Wallet';
        }
        if (walletStatus) {
            walletStatus.classList.add('hidden');
        }
        if (dashboard) {
            dashboard.classList.add('hidden');
        }
    }
    
    /**
     * Utility: Truncate address for display
     */
    truncateAddress(address) {
        if (!address) return '';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }
}

/**
 * Initialize on page load
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('[INIT] Starting ORDINAL RAINBOWS Rewards System...');
    
    // Configuration
    const config = {
        vaultAddress: '0x_VAULT_ADDRESS_',      // Replace with deployed address
        claimAddress: '0x_CLAIM_ADDRESS_',      // Replace with deployed address
        network: 'mainnet'                       // or 'testnet'
    };
    
    // Initialize managers
    window.walletManager = new BSVWalletManager(config);
    window.rewardsManager = new OrdinalRewardsManager(window.walletManager, config);
    window.dashboardUI = new RewardsDashboardUI(window.walletManager, window.rewardsManager);
    
    // Setup UI (this triggers auto-detection and modal)
    window.dashboardUI.initializeUI();
    
    console.log('[INIT] Rewards system ready!');
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BSVWalletManager,
        OrdinalRewardsManager,
        RewardsDashboardUI
    };
}
