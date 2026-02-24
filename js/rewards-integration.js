/**
 * ORDINAL RAINBOWS - BSV Wallet Integration
 * 
 * Supports: Yours Wallet, HandCash, RelayX (Babbage ecosystem)
 * Purpose: Connect user wallet → Verify ordinal ownership → Access rewards
 */

// Initialize global wallet state
console.log('[INIT] Initializing global wallet state...');
window.connectedWallet = null;
window.currentWalletAddress = null;
window.currentOrdAddress = null;  // ordinal-specific address (differs from bsvAddress)
window.ownedOrdinalsCount = 0;
window.ownedVol1Count = 0;
window.userOwnedInscriptions = [];
window.currentCard3DNFTID = null;
window._ordinalFetchAttempted = false;
console.log('[INIT] Global wallet state initialized');

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
        
        // Initialize wallet detection
        const availableWallets = await this.detectAvailableWallets();
        console.log('[BSV] Available wallets:', availableWallets);
        
        // Wait a bit more for BSV Authentication module to load
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verify BSV Authentication module is available
        if (typeof window.BSVAuth !== 'undefined' && window.BSVAuth) {
            console.log('[BSV] ✅ BSV Authentication module ready');
        } else {
            console.warn('[BSV] ⚠️ BSV Authentication module not found - checking again...');
            // Try one more time after a delay
            await new Promise(resolve => setTimeout(resolve, 500));
            if (typeof window.BSVAuth !== 'undefined' && window.BSVAuth) {
                console.log('[BSV] ✅ BSV Authentication module ready (second check)');
            } else {
                console.error('[BSV] ❌ BSV Authentication module failed to load');
            }
        }
        
        return availableWallets;
    }
    
    /**
     * Detect which wallets are available
     */
    async detectAvailableWallets() {
        const wallets = [];
        
        console.log('[BSV] Starting wallet detection...');
        console.log('[BSV] Available window objects:', Object.keys(window).filter(k => k.toLowerCase().includes('wallet') || ['yours', 'handcash', 'relayx', 'babbage', 'twetch', 'centbee'].includes(k.toLowerCase())));
        
        // Give wallets time to inject
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 1. Check for Yours Wallet (multiple variations)
        if (window.yours || window.YoursBSV || window.yoursWallet) {
            const yoursWallet = window.yours || window.YoursBSV || window.yoursWallet;
            console.log('[BSV] Yours wallet detected, available methods:', Object.keys(yoursWallet));
            wallets.push({
                name: 'Yours BSV Wallet',
                type: 'yours',
                available: true,
                logo: '🔐',
                methods: Object.keys(yoursWallet),
                wallet: yoursWallet
            });
        } else {
            console.log('[BSV] Yours wallet not detected');
        }
        
        // 2. Check for HandCash
        if (window.HandCash || window.handcash) {
            const handcash = window.HandCash || window.handcash;
            console.log('[BSV] HandCash detected, available methods:', Object.keys(handcash));
            wallets.push({
                name: 'HandCash',
                type: 'handcash',
                available: true,
                logo: '🤝',
                methods: Object.keys(handcash),
                wallet: handcash
            });
        } else {
            console.log('[BSV] HandCash not detected');
        }
        
        // 3. Check for RelayX
        if (window.relayx || window.RelayX) {
            const relayx = window.relayx || window.RelayX;
            console.log('[BSV] RelayX detected, available methods:', Object.keys(relayx));
            wallets.push({
                name: 'RelayX',
                type: 'relayx',
                available: true,
                logo: '⚡',
                methods: Object.keys(relayx),
                wallet: relayx
            });
        } else {
            console.log('[BSV] RelayX not detected');
        }
        
        // 4. Check for Babbage (universal connector)
        if (window.babbage) {
            console.log('[BSV] Babbage detected, available methods:', Object.keys(window.babbage));
            wallets.push({
                name: 'Babbage Universal',
                type: 'babbage',
                available: true,
                logo: '🎭',
                methods: Object.keys(window.babbage),
                wallet: window.babbage
            });
        } else {
            console.log('[BSV] Babbage not detected');
        }
        
        // 5. Check for Twetch
        if (window.twetch) {
            console.log('[BSV] Twetch detected, available methods:', Object.keys(window.twetch));
            wallets.push({
                name: 'Twetch',
                type: 'twetch',
                available: true,
                logo: '🐦',
                methods: Object.keys(window.twetch),
                wallet: window.twetch
            });
        } else {
            console.log('[BSV] Twetch not detected');
        }
        
        // 6. Check for CentBee
        if (window.centbee) {
            console.log('[BSV] CentBee detected, available methods:', Object.keys(window.centbee));
            wallets.push({
                name: 'CentBee',
                type: 'centbee',
                available: true,
                logo: '🐝',
                methods: Object.keys(window.centbee),
                wallet: window.centbee
            });
        } else {
            console.log('[BSV] CentBee not detected');
        }
        
        // 7. Always add manual address option as fallback
        wallets.push({
            name: 'Manual Address Entry',
            type: 'manual',
            available: true,
            logo: '✏️',
            methods: ['manual']
        });
        
        console.log('[BSV] Total wallets detected:', wallets.length);
        console.log('[BSV] Wallet types found:', wallets.map(w => w.name));
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
                case 'manual':
                    result = await this.connectManual();
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
            console.log('[BSV] Checking for Yours wallet...');
            
            if (!window.yours) {
                throw new Error('Yours wallet is not installed. Please install it at https://www.yours.org');
            }
            
            const availableMethods = Object.keys(window.yours);
            console.log('[BSV] Yours wallet detected, available methods:', availableMethods);
            
            // Check if available (some wallets use this pattern)
            if (typeof window.yours.isAvailable === 'function') {
                const isAvailable = await window.yours.isAvailable();
                console.log('[BSV] Yours isAvailable:', isAvailable);
                if (!isAvailable) {
                    throw new Error('Yours wallet is not initialized. Please check your wallet extension.');
                }
            }
            
            // Try different connection methods based on what's actually available
            let identity;
            console.log('[BSV] Attempting to get user identity...');
            
            try {
                // Try modern API methods first
                if (availableMethods.includes('getIdentity')) {
                    console.log('[BSV] Using getIdentity method');
                    identity = await window.yours.getIdentity();
                } else if (availableMethods.includes('getUser')) {
                    console.log('[BSV] Using getUser method');
                    identity = await window.yours.getUser();
                } else if (availableMethods.includes('requestAddress')) {
                    console.log('[BSV] Using requestAddress method');
                    identity = { address: await window.yours.requestAddress() };
                } else if (availableMethods.includes('connect')) {
                    console.log('[BSV] Using connect method');
                    await window.yours.connect();
                    identity = window.yours.user || { address: window.yours.address };
                } else if (availableMethods.includes('login')) {
                    console.log('[BSV] Using login method');
                    identity = await window.yours.login();
                } else if (availableMethods.includes('authenticate')) {
                    console.log('[BSV] Using authenticate method');
                    identity = await window.yours.authenticate();
                } else if (availableMethods.includes('getAddress')) {
                    console.log('[BSV] Using getAddress method');
                    identity = { address: await window.yours.getAddress() };
                } else if (availableMethods.includes('getPublicKey')) {
                    console.log('[BSV] Using getPublicKey method');
                    identity = { publicKey: await window.yours.getPublicKey() };
                } else {
                    // Fallback to manual entry
                    throw new Error('Yours wallet API not recognized. Available methods: [' + availableMethods.join(', ') + ']');
                }
            } catch (methodError) {
                console.error('[BSV] Method call error:', methodError);
                throw methodError;
            }
            
            console.log('[BSV] Identity received:', identity);
            
            this.address = identity.address || identity.publicKey || identity.userId || identity.paymail || identity.id;
            if (!this.address) {
                throw new Error('Could not retrieve address from Yours wallet. Identity object: ' + JSON.stringify(identity));
            }
            
            this.wallet = window.yours;
            this.provider = window.yours;
            
            console.log('[BSV] Yours connected successfully:', this.address);
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
            console.log('[BSV] Checking for Babbage...');
            
            if (!window.babbage) {
                throw new Error('Babbage is not available. Install from https://babbage.systems/ or use a different wallet.');
            }
            
            console.log('[BSV] Babbage detected, methods:', Object.keys(window.babbage));
            
            // Get user info
            const user = await window.babbage.getUser();
            this.address = user.identity || user.address;
            this.wallet = window.babbage;
            this.provider = window.babbage;
            
            console.log('[BSV] Babbage connected:', this.address);
            return true;
            
        } catch (err) {
            console.error('[BSV] Babbage connection error:', err);
            throw new Error(`Babbage: ${err.message}`);
        }
    }
    
    /**
     * Secure manual address connection with cryptographic verification
     * REPLACES the vulnerable manual entry system
     */
    async connectManual() {
        try {
            console.log('[BSV] Starting SECURE manual address connection...');
            
            // Check if BSV authentication module is available
            if (typeof window.BSVAuth === 'undefined' || !window.BSVAuth) {
                console.error('[BSV] BSV Authentication module not available');
                throw new Error('BSV Authentication system is not ready. Please refresh the page and try again.');
            }
            
            // Get BSV address from user
            const address = prompt(`🔐 SECURE BSV AUTHENTICATION REQUIRED

Enter your BSV address containing ORDINAL RAINBOWS:
            
Examples: 
- Legacy: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa  
- SegWit: bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh

⚠️ You will need to SIGN A MESSAGE to prove wallet ownership.

Your Address:`, '');
            
            if (!address || address.trim() === '') {
                throw new Error('No address provided');
            }
            
            const cleanAddress = address.trim();
            
            // Enhanced validation for BSV addresses
            if (cleanAddress.length < 25 || cleanAddress.length > 62) {
                throw new Error(`Invalid address length: ${cleanAddress.length} characters. BSV addresses should be 26-62 characters.`);
            }
            
            // Basic format validation
            const validPrefixes = ['1', '3', 'bc1', 'tb1'];
            const hasValidPrefix = validPrefixes.some(prefix => cleanAddress.startsWith(prefix));
            
            if (!hasValidPrefix) {
                console.warn('[BSV] Address may not be valid BSV format, but proceeding...');
            }

            console.log(`[BSV] 🔐 Initiating cryptographic authentication for: ${cleanAddress.substring(0, 8)}...${cleanAddress.substring(cleanAddress.length - 8)}`);

            // CRITICAL: Perform cryptographic signature verification
            const authResult = await window.BSVAuth.authenticateWallet(
                { type: 'manual' }, 
                cleanAddress
            );

            if (!authResult.authenticated) {
                throw new Error('Authentication failed: Could not verify wallet ownership');
            }

            // Store authentication data
            this.address = cleanAddress;
            this.wallet = { 
                manual: true, 
                authenticated: true,
                sessionToken: authResult.sessionToken,
                signature: authResult.signature,
                challenge: authResult.challenge
            };
            this.provider = null;
            this.authSession = authResult.sessionToken;
            
            console.log(`[BSV] ✅ SECURE authentication successful: ${this.address.substring(0, 8)}...${this.address.substring(this.address.length - 8)}`);
            console.log('[BSV] 🔐 Wallet ownership cryptographically verified!');
            console.log('[BSV] Now checking for ORDINAL RAINBOWS Vol. 1 in authenticated wallet...');
            
            return true;
            
        } catch (err) {
            console.error('[BSV] Secure authentication error:', err);
            throw new Error(`Secure Auth: ${err.message}`);
        }
    }
    
    /**
     * Disconnect wallet and clear authentication session
     */
    async disconnect() {
        // Clear authentication session if it exists
        if (this.authSession && window.BSVAuth) {
            window.BSVAuth.clearAuthentication(this.authSession);
            console.log('[BSV] 🔐 Authentication session cleared');
        }
        
        this.address = null;
        this.wallet = null;
        this.provider = null;
        this.isConnected = false;
        this.walletType = null;
        this.authSession = null;
        
        console.log('[BSV] Wallet disconnected securely');
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
            console.log('[BSV] Fetching ordinals for address:', this.address);
            
            // Use correct BSV ordinal APIs
            const apiEndpoints = [
                // WhatsOnChain BSV API
                `https://api.whatsonchain.com/v1/bsv/main/address/${this.address}/history`,
                // 1Sat Ordinals (correct endpoint)
                `https://ordinals.gorillapool.io/api/inscriptions/search?owner=${this.address}`,
                // Alternate endpoint
                `https://api.ordinals.gorillapool.io/inscriptions?owner=${this.address}`,
                // Backup API
                `https://ordiscan.com/api/v1/address/${this.address}/inscriptions`
            ];
            
            let allOrdinals = [];
            
            for (const endpoint of apiEndpoints) {
                try {
                    console.log('[BSV] Trying endpoint:', endpoint);
                    const response = await fetch(endpoint, {
                        headers: {
                            'Accept': 'application/json',
                            'User-Agent': 'ORDINAL-RAINBOWS-V1'
                        },
                        timeout: 10000
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        console.log('[BSV] Raw API response:', data);
                        
                        // Handle different API response formats
                        let ordinals = [];
                        if (data.inscriptions) {
                            ordinals = data.inscriptions;
                        } else if (data.result) {
                            ordinals = data.result;
                        } else if (data.txos) {
                            ordinals = data.txos;
                        } else if (Array.isArray(data)) {
                            ordinals = data;
                        } else if (data.data && Array.isArray(data.data)) {
                            ordinals = data.data;
                        }
                        
                        console.log('[BSV] Extracted ordinals array:', ordinals.length, 'items');
                        
                        if (ordinals.length > 0) {
                            allOrdinals = allOrdinals.concat(ordinals);
                            console.log('[BSV] Found', ordinals.length, 'ordinals from', endpoint);
                        }
                    } else {
                        console.warn('[BSV] API response not OK:', response.status, response.statusText);
                    }
                } catch (apiErr) {
                    console.warn('[BSV] Endpoint failed:', endpoint, apiErr.message);
                    continue;
                }
            }
            
            // Remove duplicates
            const uniqueOrdinals = allOrdinals.filter((ordinal, index, arr) => {
                const id = ordinal.inscription_id || ordinal.inscriptionId || ordinal.id || ordinal.num;
                return arr.findIndex(o => {
                    const otherId = o.inscription_id || o.inscriptionId || o.id || o.num;
                    return otherId === id;
                }) === index;
            });
            
            console.log('[BSV] Total unique ordinals found:', uniqueOrdinals.length);
            return uniqueOrdinals;
            
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
            skipOrdinalVerification: false, // Real verification enabled
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
     * Check if wallet holds Vol. 1 ordinal - SECURE VERIFICATION WITH AUTHENTICATION
     */
    async ownsOrdinal() {
        try {
            if (!this.walletManager.isWalletConnected()) {
                console.log('[REWARDS] Wallet not connected');
                return false;
            }

            // CRITICAL SECURITY: Verify user is cryptographically authenticated
            if (this.walletManager.authSession) {
                const isAuthenticated = window.BSVAuth && window.BSVAuth.isAuthenticated(this.walletManager.authSession);
                if (!isAuthenticated) {
                    console.error('[REWARDS] 🚨 SECURITY: Session expired or invalid - authentication required');
                    throw new Error('Authentication expired. Please reconnect your wallet to verify ownership.');
                }

                // Verify the authenticated address matches the wallet address
                const authenticatedAddress = window.BSVAuth.getAuthenticatedAddress(this.walletManager.authSession);
                const walletAddress = this.walletManager.getAddress();
                
                if (authenticatedAddress !== walletAddress) {
                    console.error('[REWARDS] 🚨 SECURITY: Address mismatch detected');
                    throw new Error('Security error: Wallet address does not match authenticated address');
                }

                console.log('[REWARDS] ✅ Authentication verified for:', authenticatedAddress.substring(0, 8) + '...');
            } else {
                console.warn('[REWARDS] ⚠️ No authentication session found - this connection may not be secure');
            }
            
            const address = this.walletManager.getAddress();
            console.log('[REWARDS] Checking ordinal ownership for authenticated address:', address);
            
            // Get ordinals from API
            const ordinals = await this.walletManager.getOrdinalData();
            console.log('[REWARDS] Found ordinals:', ordinals.length);
            
            if (ordinals.length === 0) {
                console.log('[REWARDS] No ordinals found in wallet');
                return false;
            }
            
            // Get complete Vol. 1 inscription IDs from NFTs array
            const vol1Inscriptions = window.nfts ? window.nfts
                .filter(nft => nft.inscriptionId)
                .map(nft => nft.inscriptionId) : [];
            
            console.log('[REWARDS] Checking against', vol1Inscriptions.length, 'Vol. 1 inscriptions');
            console.log('[REWARDS] Sample Vol. 1 IDs:', vol1Inscriptions.slice(0, 3).map(id => id.substring(0, 12) + '...'));
            
            // Enhanced debugging for ordinal matching
            for (let i = 0; i < Math.min(ordinals.length, 5); i++) {
                const ordinal = ordinals[i];
                console.log(`[REWARDS] Ordinal ${i+1}:`, {
                    inscription_id: ordinal.inscription_id ? ordinal.inscription_id.substring(0, 12) + '...' : 'N/A',
                    inscriptionId: ordinal.inscriptionId ? ordinal.inscriptionId.substring(0, 12) + '...' : 'N/A', 
                    id: ordinal.id ? ordinal.id.toString().substring(0, 12) + '...' : 'N/A',
                    num: ordinal.num,
                    outpoint: ordinal.outpoint ? ordinal.outpoint.substring(0, 12) + '...' : 'N/A'
                });
            }
            
            // Check if any owned ordinals match Vol. 1
            const ownedVol1Ordinals = [];
            
            for (const ordinal of ordinals) {
                const ordinalId = ordinal.inscription_id || ordinal.inscriptionId || ordinal.id || ordinal.num;
                
                if (vol1Inscriptions.includes(ordinalId)) {
                    ownedVol1Ordinals.push({
                        inscriptionId: ordinalId,
                        nft: window.nfts.find(n => n.inscriptionId === ordinalId),
                        ordinal: ordinal
                    });
                }
            }
            
            console.log('[REWARDS] Owned Vol. 1 ordinals:', ownedVol1Ordinals.length);
            
            // Store owned ordinals for rewards calculation
            this.ownedOrdinals = ownedVol1Ordinals;
            
            return ownedVol1Ordinals.length > 0;
            
        } catch (err) {
            console.error('[REWARDS] Error checking ordinals:', err);
            return false;
        }
    }
    
    /**
     * Calculate real-time rewards based on owned ordinals
     */
    async getUnclaimedRewards() {
        try {
            if (!this.walletManager.isWalletConnected()) {
                return {
                    totalRewards: '0.00',
                    availableRewards: '0.00',
                    ownedOrdinals: [],
                    message: 'Wallet not connected'
                };
            }
            
            // Verify ordinal ownership
            const hasOrdinals = await this.ownsOrdinal();
            
            if (!hasOrdinals || !this.ownedOrdinals || this.ownedOrdinals.length === 0) {
                return {
                    totalRewards: '0.00',
                    availableRewards: '0.00',
                    ownedOrdinals: [],
                    message: 'No ORDINAL RAINBOWS Vol. 1 found in your wallet'
                };
            }
            
            // Calculate rewards based on rarity and time
            const rewardRates = {
                'Legendary': 100.0,   // 100 BSV per legendary
                'Exotic': 50.0,       // 50 BSV per exotic  
                'Epic': 20.0,         // 20 BSV per epic
                'Rare': 10.0,         // 10 BSV per rare
                'Uncommon': 5.0,      // 5 BSV per uncommon
                'Common': 2.0         // 2 BSV per common
            };
            
            let totalRewards = 0;
            const rewardDetails = [];
            
            // Launch date for time-based multiplier
            const launchDate = new Date('2024-01-01');
            const currentDate = new Date();
            const daysSinceLaunch = Math.floor((currentDate - launchDate) / (1000 * 60 * 60 * 24));
            const timeMultiplier = 1 + (daysSinceLaunch * 0.002); // 0.2% per day
            
            for (const ownedOrdinal of this.ownedOrdinals) {
                const nft = ownedOrdinal.nft;
                const baseReward = rewardRates[nft.rarity] || 2.0;
                const cardReward = baseReward * timeMultiplier;
                
                totalRewards += cardReward;
                
                rewardDetails.push({
                    nftId: nft.id,
                    inscriptionId: ownedOrdinal.inscriptionId,
                    title: nft.title,
                    subtitle: nft.subtitle,
                    rarity: nft.rarity,
                    baseReward: baseReward.toFixed(2),
                    timeMultiplier: timeMultiplier.toFixed(3),
                    totalReward: cardReward.toFixed(4),
                    claimed: false, // TODO: Check from smart contract in production
                    image: `images/${nft.id}.jpg` // Assuming image path structure
                });
            }
            
            return {
                totalRewards: totalRewards.toFixed(4),
                availableRewards: totalRewards.toFixed(4),
                ownedOrdinals: this.ownedOrdinals,
                rewardDetails: rewardDetails,
                count: this.ownedOrdinals.length,
                timeMultiplier: timeMultiplier.toFixed(3),
                daysSinceLaunch: daysSinceLaunch
            };
            
        } catch (err) {
            console.error('[REWARDS] Error calculating rewards:', err);
            return {
                error: err.message,
                totalRewards: '0.00',
                availableRewards: '0.00',
                ownedOrdinals: []
            };
        }
    }
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
        console.log('[UI] Initializing UI...');
        
        // Connect button
        const connectBtn = document.getElementById('connectWallet');
        console.log('[UI] Connect button found:', !!connectBtn);
        if (connectBtn) {
            console.log('[UI] Adding click listener to connect button');
            connectBtn.addEventListener('click', () => {
                console.log('[UI] Connect button clicked!');
                this.showWalletModal();
            });
        } else {
            console.warn('[UI] Connect button not found!');
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
            // Give wallets more time to inject into window (BSV wallets can be slower)
            console.log('[UI] Waiting for wallet injection...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const wallets = await this.walletManager.detectAvailableWallets();
            
            // Just detect - don't show modal automatically
            // User will click "Connect Wallet" button to open modal
            console.log('[UI] Available wallets detected:', wallets.length);
            console.log('[UI] Wallet types:', wallets.map(w => w.name));
        } catch (err) {
            console.error('[UI] Auto-detect error:', err);
        }
    }
    
    /**
     * Show wallet selection modal
     */
    async showWalletModal() {
        console.log('[UI] 🚀 Using modern BSV Wallet SDK modal...');
        
        try {
            // Check if SDK is available
            if (typeof window.BSVWalletSDK === 'undefined') {
                console.error('[UI] ❌ BSV Wallet SDK not loaded, falling back to manual modal');
                return this.showLegacyWalletModal();
            }

            // Use the modern SDK modal
            await window.BSVWalletSDK.showWalletModal();
            
            console.log('[UI] ✅ Modern wallet modal displayed');
            
        } catch (err) {
            console.error('[UI] ❌ Error showing wallet modal:', err);
            // Fallback to legacy modal
            this.showLegacyWalletModal();
        }
    }

    /**
     * Legacy wallet modal (fallback)
     */
    async showLegacyWalletModal() {
        console.log('[UI] showLegacyWalletModal called');
        try {
            const modal = document.getElementById('walletModal');
            console.log('[UI] Existing modal found:', !!modal);
            if (!modal) {
                console.log('[UI] Creating new modal...');
                this.createWalletModal();
            }
            
            const wallets = await this.walletManager.detectAvailableWallets();
            const optionsContainer = document.getElementById('walletOptions');
            
            if (wallets.length === 0) {
                optionsContainer.innerHTML = `
                    <div class="wallet-error">
                        ❌ Secure Auth: BSV Authentication module not loaded. Please refresh the page.
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
            const modalToShow = document.getElementById('walletModal');
            console.log('[UI] Showing modal:', !!modalToShow);
            modalToShow.classList.remove('hidden');
            this.isOpen = true;
            console.log('[UI] Modal should now be visible');
            
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
            console.log('[UI] Starting connection to', walletType);
            
            // Update UI to show connecting status
            const walletBtn = document.querySelector(`[data-wallet="${walletType}"]`);
            if (!walletBtn) {
                throw new Error('Wallet button not found');
            }
            
            const statusDiv = walletBtn.querySelector('.wallet-option-status');
            const originalStatus = statusDiv.textContent;
            statusDiv.textContent = '🔄 Connecting...';
            walletBtn.style.opacity = '0.7';
            walletBtn.style.pointerEvents = 'none';
            
            // Connect
            console.log('[UI] Calling wallet connect...');
            const result = await this.walletManager.connect(walletType);
            console.log('[UI] Wallet connected:', result);
            
            // Check if owns ordinal
            statusDiv.textContent = '🔍 Verifying ordinals...';
            console.log('[UI] Checking ordinal ownership...');
            const hasOrdinal = await this.rewardsManager.ownsOrdinal();
            console.log('[UI] Ordinal check result:', hasOrdinal);
            
            if (!hasOrdinal) {
                throw new Error('You must hold a Vol. 1 ORDINAL RAINBOWS to claim rewards');
            }
            
            // Update UI
            statusDiv.textContent = '✓ Connected!';
            setTimeout(() => {
                this.closeWalletModal();
                this.updateConnectedUI(result.address);
                this.refreshRewards();
            }, 1000);
            
        } catch (err) {
            console.error('[UI] Connection error:', err);
            const walletBtn = document.querySelector(`[data-wallet="${walletType}"]`);
            if (walletBtn) {
                const statusDiv = walletBtn.querySelector('.wallet-option-status');
                statusDiv.textContent = '❌ ' + err.message;
                statusDiv.style.color = '#ff6464';
                
                // Reset after 4 seconds
                setTimeout(() => {
                    statusDiv.textContent = 'Click to connect';
                    statusDiv.style.color = '#888';
                    walletBtn.style.opacity = '1';
                    walletBtn.style.pointerEvents = 'auto';
                }, 4000);
            }
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
    console.log('[INIT] DOM ready, looking for connect button:', !!document.getElementById('connectWallet'));
    
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
    
    // Setup BSV Wallet SDK event listeners for automatic authentication
    setupWalletSDKEvents();
    
    // Setup UI (this triggers auto-detection and modal)
    console.log('[INIT] Calling initializeUI...');
    window.dashboardUI.initializeUI();
    
    console.log('[INIT] Rewards system ready!');
});

/**
 * Setup BSV Wallet SDK event handlers for automatic authentication
 */
function setupWalletSDKEvents() {
    console.log('[INIT] 🔗 Setting up BSV Wallet SDK event handlers...');
    
    // Handle successful wallet authentication
    // NOTE: The primary handler for this event is the standalone listener at the bottom of this file.
    // This handler only updates walletManager state — it does NOT call dashboardUI (which does not exist).
    window.addEventListener('bsv-wallet-authenticated', async (event) => {
        console.log('[INIT] 🎉 Wallet authenticated via SDK (setupWalletSDKEvents handler):', event.detail?.address);
        
        try {
            const authData = event.detail;
            
            // Set the wallet manager's state to authenticated
            if (window.walletManager) {
                window.walletManager.address = authData.address;
                window.walletManager.isConnected = true;
                window.walletManager.walletType = authData.wallet;
                window.walletManager.authSession = 'SDK_' + Date.now();
                window.walletManager.sdkAuthData = authData;
                console.log('[INIT] ✅ Wallet manager updated with SDK authentication, address:', authData.address);
            }
            
        } catch (err) {
            console.error('[INIT] ❌ Error updating wallet manager state:', err);
        }
    });
    
    // Handle wallet disconnection
    // NOTE: The primary UI handler for this event is the standalone listener at the bottom of this file.
    window.addEventListener('bsv-wallet-disconnected', () => {
        console.log('[INIT] 🔌 Wallet disconnected via SDK (setupWalletSDKEvents handler)');
        
        // Clear wallet manager state
        if (window.walletManager) {
            window.walletManager.disconnect();
        }
    });
    
    // Handle session restoration (persistence)
    window.addEventListener('bsv-wallet-session-restored', (event) => {
        const { walletType, address, restored } = event.detail;
        console.log(`[INIT] 🔄 Session restored for ${walletType}:`, address?.slice(0,8) + '...');
        
        // Update wallet manager state
        if (window.walletManager) {
            window.walletManager.address = address;
            window.walletManager.isConnected = true;
            window.walletManager.walletType = walletType;
        }
        
        // Update UI to show restored connection
        updateWalletUI(true, address, walletType);
        
        // Check for ordinals automatically on restoration
        setTimeout(async () => {
            if (window.rewardsManager) {
                const hasOrdinals = await window.rewardsManager.ownsOrdinal();
                if (hasOrdinals && window.dashboardUI) {
                    console.log('[INIT] 🌈 ORDINAL RAINBOWS detected on session restore!');
                    await window.dashboardUI.showRewardsDashboard();
                }
            }
        }, 1000);
    });
    
    console.log('[INIT] ✅ BSV Wallet SDK event handlers ready');
}

// Global wallet connection functions for button clicks
function showWalletConnection() {
    console.log('🚀 Connect Wallet button clicked');
    console.log('BSV SDK available:', !!window.BSVWalletSDK);
    console.log('showWalletModal available:', !!window.BSVWalletSDK?.showWalletModal);
    
    if (!window.BSVWalletSDK) {
        console.error('❌ BSV Wallet SDK not loaded!');
        alert('Wallet SDK not loaded. Checking...');
        // Try initializing if not loaded
        if (window.BSVWalletSDKManager) {
            console.log('Creating BSVWalletSDKManager instance...');
            window.BSVWalletSDK = new window.BSVWalletSDKManager();
        } else {
            alert('BSV Wallet SDK failed to load. Please refresh the page.');
            return;
        }
    }
    
    try {
        console.log('Calling showWalletModal...');
        window.BSVWalletSDK.showWalletModal();
        console.log('✅ Wallet modal shown');
    } catch (error) {
        console.error('❌ Error showing wallet modal:', error);
        alert('Error: ' + error.message);
    }
}

function disconnectWallet() {
    console.log('🔌 Disconnect wallet requested');
    
    // Clear wallet manager state
    if (window.walletManager) {
        window.walletManager.disconnect();
    }
    
    // Update UI
    updateWalletUI(false);
    
    // Dispatch disconnection event
    window.dispatchEvent(new CustomEvent('bsv-wallet-disconnected'));
    
    console.log('✅ Wallet disconnected');
}

function updateWalletUI(connected, address = null, walletType = null) {
    console.log('[UI] updateWalletUI called - connected:', connected, 'address:', address);
    
    const connectBtn = document.getElementById('connect-wallet-btn');
    const walletStatus = document.getElementById('wallet-status');
    const walletAddress = document.getElementById('wallet-address');
    const walletBox = document.getElementById('wallet-box');
    
    console.log('[UI] Elements:', { connectBtn: !!connectBtn, walletStatus: !!walletStatus, walletBox: !!walletBox });
    
    if (connected && address) {
        // Show wallet box - hide connect button
        console.log('[UI] Showing wallet box, hiding connect button');
        
        if (connectBtn) {
            connectBtn.style.display = 'none';
            connectBtn.classList.add('hidden');
        }
        if (walletStatus) {
            walletStatus.style.display = 'none';
            walletStatus.classList.add('hidden');
        }
        
        // Show wallet box
        if (walletBox) {
            walletBox.style.display = 'block';
            walletBox.classList.remove('hidden');
            walletBox.classList.add('active');
            console.log('[UI] Wallet box shown - classes:', walletBox.className);
            
            // Refresh balances
            refreshWalletBoxBalances();
        } else {
            console.error('[UI] Wallet box element not found!');
        }
    } else {
        // Show connect button - hide wallet box
        console.log('[UI] Showing connect button, hiding wallet box');
        
        if (connectBtn) {
            connectBtn.style.display = 'block';
            connectBtn.classList.remove('hidden');
        }
        if (walletStatus) {
            walletStatus.style.display = 'none';
            walletStatus.classList.add('hidden');
        }
        
        // Hide wallet box
        if (walletBox) {
            walletBox.style.display = 'none';
            walletBox.classList.add('hidden');
            walletBox.classList.remove('active');
        }
    }
}

// ====== 3D CARD MODAL FUNCTIONS ======

/**
 * Open a card in 3D modal when authenticated
 */
async function openCard3DModal(nftId) {
    console.log('[3D] Opening card modal for NFT:', nftId);
    
    if (!isWalletAuthenticated()) {
        alert('Please connect your wallet first to view card rewards');
        return;
    }
    
    try {
        const nft = window.nfts?.find(n => n.id === nftId);
        if (!nft) {
            console.error('[3D] NFT not found:', nftId);
            return;
        }
        
        // Populate front face with properly encoded image path
        const encodedId = encodeURIComponent(nft.id);
        document.getElementById('card-3d-front-img').src = `images/${encodedId}.JPG`;
        document.getElementById('card-3d-front-title').textContent = nft.title;
        document.getElementById('card-3d-front-subtitle').textContent = nft.subtitle || nft.rarity;
        
        // Reset flip
        document.getElementById('card-3d-flipper').classList.remove('flipped');
        
        // Show modal first so user sees it immediately
        const modal = document.getElementById('card-3d-modal');
        modal.classList.add('active');
        
        // Store current NFT ID globally
        window.currentCard3DNFTID = nftId;
        
        // Add mouse tracking for 3D tilt
        const container = document.querySelector('.card-3d-container');
        container.addEventListener('mousemove', handle3DCardMouseMove);
        document.addEventListener('keydown', handle3DCardEscape);
        
        // Check ownership and populate back face (awaited so it always completes)
        await checkCardOwnershipAndRewards(nft);
        
    } catch (err) {
        console.error('[3D] Error opening modal:', err);
    }
}

/**
 * Check if user owns this specific ordinal and calculate rewards
 */
async function checkCardOwnershipAndRewards(nft) {
    const backContent = document.getElementById('card-3d-back-content');
    const buttonArea = document.getElementById('card-3d-button-area');
    
    try {
        // Check if wallet is connected
        if (!isWalletAuthenticated()) {
            backContent.innerHTML = '<div class="card-3d-message">Connect wallet to view rewards</div>';
            buttonArea.innerHTML = '';
            return;
        }
        
        console.log('[3D] Checking ownership for:', nft.title, '| inscriptionId:', nft.inscriptionId?.substring(0,12) + '...');
        
        // If ordinals haven't been fetched yet, do it now (awaited, so the result is ready below)
        // Always query ordAddress (inscriptions are locked there), falling back to bsvAddress
        if (!window._ordinalFetchAttempted && (window.currentOrdAddress || window.currentWalletAddress)) {
            backContent.innerHTML = '<div class="card-3d-message">🔄 Loading your ordinals...</div>';
            buttonArea.innerHTML = '';
            await fetchUserOrdinals(window.currentOrdAddress || window.currentWalletAddress);
        }
        
        // Check if user specifically owns THIS card by inscriptionId
        let ownsThisCard = false;
        if (nft.inscriptionId && window.userOwnedInscriptions && window.userOwnedInscriptions.length > 0) {
            ownsThisCard = window.userOwnedInscriptions.some(insc =>
                insc.inscriptionId?.toLowerCase() === nft.inscriptionId.toLowerCase()
            );
        }
        
        console.log('[3D] userOwnedInscriptions count:', window.userOwnedInscriptions?.length,
            '| ownedOrdinalsCount:', window.ownedOrdinalsCount,
            '| owns this card:', ownsThisCard);
        
        if (ownsThisCard) {
            console.log('[3D] ✅ Ownership verified — showing rewards interface');
            
            backContent.innerHTML = `
                <div class="card-3d-back-title">Available Rewards</div>
                <div class="card-rewards-grid">
                    <div class="card-reward-item">
                        <div class="card-reward-token">💎 MNEE</div>
                        <div class="card-reward-amount">0.00</div>
                    </div>
                    <div class="card-reward-item">
                        <div class="card-reward-token">⚡ BSV</div>
                        <div class="card-reward-amount">0.0000</div>
                    </div>
                </div>
            `;
            
            buttonArea.innerHTML = `
                <button class="card-3d-claim-btn" onclick="claimOrdinalReward('${nft.id}')">
                    ✨ Claim Rewards
                </button>
            `;
        } else if (!nft.inscriptionId) {
            console.warn('[3D] NFT has no inscriptionId set, cannot verify ownership');
            backContent.innerHTML = '<div class="card-3d-message">⚠️ Ownership verification unavailable for this piece</div>';
            buttonArea.innerHTML = '';
        } else if (!window._ordinalFetchAttempted || (window.ownedOrdinalsCount === 0 && window.userOwnedInscriptions?.length === 0)) {
            // Fetch hasn't run, or it ran but got nothing (API may have failed) — offer retry

            console.log('[3D] Ordinals not loaded or fetch failed — showing retry');
            backContent.innerHTML = '<div class="card-3d-message">⚠️ Could not load ordinal data</div>';
            buttonArea.innerHTML = `<button class="card-3d-claim-btn" onclick="retryOwnershipCheck('${nft.id}')">↻ Retry</button>`;
        } else {
            // Ordinals loaded but this card not found in wallet
            console.log('[3D] ❌ User does not own this specific card');
            backContent.innerHTML = `<div class="card-3d-message">❌ You do not own <strong>${nft.title}</strong><br><small>You hold ${window.ownedOrdinalsCount || 0} ordinal${window.ownedOrdinalsCount !== 1 ? 's' : ''} total${window.ownedVol1Count ? ', ' + window.ownedVol1Count + ' from Vol.1' : ''}</small></div>`;
            buttonArea.innerHTML = '';
        }
        
    } catch (err) {
        console.error('[3D] Error checking ownership:', err);
        backContent.innerHTML = '<div class="card-3d-message">Unable to load rewards</div>';
        buttonArea.innerHTML = '';
    }
}

/**
 * Handle 3D tilt effect based on mouse position
 */
function handle3DCardMouseMove(event) {
    const container = document.querySelector('.card-3d-container');
    const rect = container.getBoundingClientRect();
    
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const rotateY = ((x / rect.width) - 0.5) * 20; // -10 to 10 degrees
    const rotateX = ((y / rect.height) - 0.5) * -20; // -10 to 10 degrees
    
    container.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
}

/**
 * Handle escape key to close modal
 */
function handle3DCardEscape(event) {
    if (event.key === 'Escape') {
        closeCard3DModal();
    }
}

/**
 * Flip the 3D card
 */
function flipCard3D() {
    const flipper = document.getElementById('card-3d-flipper');
    flipper.classList.toggle('flipped');
}

/**
 * Close the 3D card modal
 */
function closeCard3DModal() {
    console.log('[3D] Closing card modal');
    
    const modal = document.getElementById('card-3d-modal');
    modal.classList.remove('active');
    
    const container = document.querySelector('.card-3d-container');
    container.style.transform = '';
    container.removeEventListener('mousemove', handle3DCardMouseMove);
    
    document.removeEventListener('keydown', handle3DCardEscape);
    
    window.currentCard3DNFTID = null;
}

/**
 * Check if user owns a specific ordinal/NFT
 */
async function checkOrdinalOwnership(nftId) {
    console.log('[OWNERSHIP] Checking ownership for NFT:', nftId);
    console.log('[OWNERSHIP] User address:', window.currentWalletAddress);
    console.log('[OWNERSHIP] ownedOrdinalsCount:', window.ownedOrdinalsCount, '| ownedVol1Count:', window.ownedVol1Count);
    console.log('[OWNERSHIP] userOwnedInscriptions:', window.userOwnedInscriptions);
    
    if (!window.currentWalletAddress) {
        console.log('[OWNERSHIP] No wallet connected');
        return false;
    }
    
    // Find the NFT definition to get its inscriptionId
    const nft = window.nfts?.find(n => n.id === nftId);
    if (!nft) {
        console.warn('[OWNERSHIP] NFT not found in collection:', nftId);
        return false;
    }
    
    if (!nft.inscriptionId) {
        console.warn('[OWNERSHIP] NFT has no inscriptionId configured:', nftId);
        return false;
    }
    
    // Check the userOwnedInscriptions list (populated by fetchUserOrdinals)
    if (window.userOwnedInscriptions && window.userOwnedInscriptions.length > 0) {
        const owns = window.userOwnedInscriptions.some(insc =>
            insc.inscriptionId?.toLowerCase() === nft.inscriptionId.toLowerCase()
        );
        console.log('[OWNERSHIP] Specific inscriptionId check result:', owns);
        return owns;
    }
    
    console.log('[OWNERSHIP] No verified inscription data available — denying claim');
    return false;
}

/**
 * Retry ownership check — resets the fetch flag and re-runs the full fetch + card check
 */
async function retryOwnershipCheck(nftId) {
    console.log('[RETRY] Re-fetching ordinals for:', nftId);
    window._ordinalFetchAttempted = false;
    const nft = window.nfts?.find(n => n.id === nftId);
    if (nft) {
        await checkCardOwnershipAndRewards(nft);
    }
}
window.retryOwnershipCheck = retryOwnershipCheck;

/**
 * Claim rewards for an ordinal
 */
async function claimOrdinalReward(nftId = null) {
    const id = nftId || window.currentCard3DNFTID;
    if (!id) {
        alert('No card selected');
        return;
    }
    
    console.log('[CLAIM] Attempting claim for NFT:', id);
    
    try {
        // First check if user owns this ordinal
        const owns = await checkOrdinalOwnership(id);
        
        if (!owns) {
            console.log('[CLAIM] User does not own this ordinal');
            alert('❌ Sorry, that\'s not your rainbow. You do not own this NFT.');
            return;
        }
        
        console.log('[CLAIM] Ownership verified, initiating claim...');
        alert('✅ Claim initiated! Check your wallet for the transaction.');
        
        // Close modal after claiming
        closeCard3DModal();
        
    } catch (err) {
        console.error('[CLAIM] Error claiming reward:', err);
        alert('Error claiming reward: ' + err.message);
    }
}

/**
 * Refresh wallet box balances
 */
async function refreshWalletBoxBalances() {
    console.log('[WALLET-BOX] Refreshing balances...');
    
    try {
        // Show Vol.1 specific count in the wallet box
        const vol1Count = window.ownedVol1Count || 0;
        const collectionSize = window.nfts ? window.nfts.filter(n => n.inscriptionId).length : 0;
        const display = window._ordinalFetchAttempted
            ? `${vol1Count} <span style="opacity:0.5;font-size:0.8em">of ${collectionSize} Vol.1</span>`
            : '—';
        document.getElementById('wallet-bsv21-balance').innerHTML = display;
        
        // Show zero for rewards (no real data yet)
        // TODO: Fetch real reward amounts from API
        document.getElementById('wallet-mnee-balance').textContent = '0.00 MNEE';
        document.getElementById('wallet-bsv-balance').textContent = '0.0000 BSV';
        
        console.log('[WALLET-BOX] Balances updated — Vol.1 owned:', vol1Count, 'of', collectionSize);
        
    } catch (err) {
        console.error('[WALLET-BOX] Error refreshing balances:', err);
        document.getElementById('wallet-bsv21-balance').textContent = '?';
        document.getElementById('wallet-mnee-balance').textContent = '? MNEE';
        document.getElementById('wallet-bsv-balance').textContent = '? BSV';
    }
}

/**
 * Check if wallet is authenticated
 */
function isWalletAuthenticated() {
    return !!(window.connectedWallet || window.currentWalletAddress);
}

// Enhanced wallet manager compatibility with SDK
if (typeof window.walletManager !== 'undefined') {
    // Add SDK compatibility methods
    window.walletManager.isSDKAuthenticated = function() {
        return this.sdkAuthData && window.BSVWalletSDK && window.BSVWalletSDK.isWalletAuthenticated();
    };
    
    window.walletManager.getSDKAuthData = function() {
        return this.sdkAuthData || null;
    };
}

// Debug function for testing
window.testWalletConnection = function() {
    console.log('🔧 Testing wallet connection...');
    console.log('BSV SDK available:', !!window.BSVWalletSDK);
    console.log('BSV SDK Manager available:', !!window.BSVWalletSDKManager);
    
    if (window.BSVWalletSDK) {
        console.log('✅ Calling showWalletModal...');
        window.BSVWalletSDK.showWalletModal();
    } else {
        console.error('❌ BSV Wallet SDK not available');
    }
};

// Make sure global functions are available
window.showWalletConnection = showWalletConnection;
window.disconnectWallet = disconnectWallet;
window.openCard3DModal = openCard3DModal;
window.flipCard3D = flipCard3D;
window.closeCard3DModal = closeCard3DModal;
window.claimOrdinalReward = claimOrdinalReward;
window.refreshWalletBoxBalances = refreshWalletBoxBalances;
window.isWalletAuthenticated = isWalletAuthenticated;

// ====== EVENT LISTENERS FOR WALLET AUTHENTICATION ======
window.addEventListener('bsv-wallet-authenticated', async function(e) {
    console.log('[AUTH] Wallet authenticated event fired!', e.detail);
    
    // Store authentication data
    window.connectedWallet = e.detail.wallet;
    window.currentWalletAddress = e.detail.address;
    window.currentOrdAddress = e.detail.ordAddress || null;
    
    console.log('[AUTH] Stored - BSV Address:', window.currentWalletAddress, '| Ord Address:', window.currentOrdAddress, '| Wallet:', window.connectedWallet);
    
    // Show wallet box immediately
    updateWalletUI(true, e.detail.address, e.detail.wallet);
    
    // Fetch ordinals using the ordAddress if available (that's where inscriptions live)
    await fetchUserOrdinals(window.currentOrdAddress || window.currentWalletAddress);
    
    // Refresh balances now that ordinals are loaded
    refreshWalletBoxBalances();
    
    // Close wallet modal if open
    const modal = document.getElementById('card-3d-modal');
    if (modal && modal.classList.contains('active')) {
        closeCard3DModal();
    }
});

window.addEventListener('bsv-wallet-disconnected', function() {
    console.log('[AUTH] Wallet disconnected event fired');
    
    // Clear auth data
    window.connectedWallet = null;
    window.currentWalletAddress = null;
    window.currentOrdAddress = null;
    window.ownedOrdinalsCount = 0;
    window.ownedVol1Count = 0;
    window.userOwnedInscriptions = [];
    window._ordinalFetchAttempted = false;
    
    // Update UI
    updateWalletUI(false);
    
    // Close any open modals
    const modal = document.getElementById('card-3d-modal');
    if (modal && modal.classList.contains('active')) {
        closeCard3DModal();
    }
});

window.addEventListener('bsv-wallet-session-restored', function(e) {
    console.log('[AUTH] Session restored event fired:', e.detail);
    
    // Restore authentication from session
    if (e.detail && e.detail.address) {
        window.connectedWallet = e.detail.wallet;
        window.currentWalletAddress = e.detail.address;
        window.currentOrdAddress = e.detail.ordAddress || null;
        
        // Fetch user's ordinals using ordAddress (where inscriptions are locked)
        fetchUserOrdinals(window.currentOrdAddress || e.detail.address);
        
        setTimeout(() => {
            updateWalletUI(true, e.detail.address, e.detail.wallet);
        }, 100);
    }
});

/**
 * Fetch user's actual ordinals from their wallet and match against Vol.1 collection.
 *
 * Strategy: query each Vol.1 inscription directly at /api/inscriptions/{txid}_0
 * and check if item.owner === ordAddress. This is accurate regardless of wallet size
 * (no pagination needed even for 14K+ inscription wallets).
 */
async function fetchUserOrdinals(address) {
    console.log('[ORDINALS] Checking Vol.1 ownership for address:', address);

    if (!address) {
        console.warn('[ORDINALS] No address provided');
        window.ownedOrdinalsCount = 0;
        window.userOwnedInscriptions = [];
        return;
    }

    const nftsWithId = window.nfts ? window.nfts.filter(n => n.inscriptionId) : [];
    console.log('[ORDINALS] Checking', nftsWithId.length, 'Vol.1 inscriptions for ownership by', address);

    if (nftsWithId.length === 0) {
        console.warn('[ORDINALS] No inscriptionIds found in window.nfts');
        window._ordinalFetchAttempted = true;
        return;
    }

    const addressLower = address.toLowerCase();

    // Query each inscription in parallel batches of 8
    const BATCH = 8;
    const owned = [];

    for (let i = 0; i < nftsWithId.length; i += BATCH) {
        const batch = nftsWithId.slice(i, i + BATCH);
        const results = await Promise.allSettled(
            batch.map(async nft => {
                const url = `https://ordinals.gorillapool.io/api/inscriptions/${nft.inscriptionId}_0`;
                const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
                if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${nft.inscriptionId}`);
                const data = await resp.json();
                return { nft, owner: data.owner, name: data.origin?.data?.map?.name };
            })
        );

        for (const r of results) {
            if (r.status === 'fulfilled') {
                const { nft, owner, name } = r.value;
                if (owner && owner.toLowerCase() === addressLower) {
                    console.log(`[ORDINALS] ✅ OWNS: ${name || nft.title} | owner: ${owner}`);
                    owned.push(nft);
                }
            } else {
                console.warn('[ORDINALS] Lookup failed for one item:', r.reason?.message);
            }
        }
    }

    window.userOwnedInscriptions = owned.map(nft => ({ id: nft.id, inscriptionId: nft.inscriptionId, nftId: nft.id }));
    window.ownedOrdinalsCount = owned.length;
    window.ownedVol1Count = owned.length;
    window._ordinalFetchAttempted = true;

    console.log('[ORDINALS] ✅ RESULTS: owns', owned.length, 'of', nftsWithId.length, 'Vol.1 pieces');
    console.log('[ORDINALS] Owned titles:', owned.map(n => n.title));

    // Refresh wallet box balances with fresh data
    refreshWalletBoxBalances();
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BSVWalletManager,
        OrdinalRewardsManager,
        RewardsDashboardUI,
        SimpleCardPopup
    };
}

/**
 * Simple Card Popup - Lightweight 3D card display
 * Shows individual card details without breaking existing functionality
 */
class SimpleCardPopup {
    constructor(walletManager, rewardsManager) {
        this.walletManager = walletManager;
        this.rewardsManager = rewardsManager;
        this.isOpen = false;
        this.createPopup();
    }
    
    createPopup() {
        const popup = document.createElement('div');
        popup.id = 'cardDetailPopup';
        popup.className = 'card-detail-popup';
        popup.innerHTML = `
            <div class="popup-card" id="popupCard">
                <!-- Front Face -->
                <div class="card-face card-front">
                    <button class="popup-close">&times;</button>
                    
                    <div class="popup-card-header">
                        <div class="popup-card-title" id="popupTitle"></div>
                        <div class="popup-card-subtitle" id="popupSubtitle"></div>
                    </div>
                    
                    <div class="popup-card-content">
                        <div class="ownership-badge" id="ownershipBadge">
                            <span id="ownershipText">Connect wallet to verify ownership</span>
                        </div>
                        
                        <div class="reward-amount" id="rewardAmount" style="display: none;">
                            <div class="reward-value" id="rewardValue">0.00</div>
                            <div class="reward-label">BSV Rewards Available</div>
                        </div>
                        
                        <div id="cardDetails"></div>
                        
                        <div class="flip-hint">Double-click to flip card</div>
                    </div>
                </div>
                
                <!-- Back Face -->
                <div class="card-face card-back">
                    <button class="popup-close">&times;</button>
                    
                    <div class="popup-card-header">
                        <div class="popup-card-title" id="popupTitleBack"></div>
                    </div>
                    
                    <div class="popup-card-content">
                        <img class="popup-nft-image" id="popupImage" src="" alt="NFT">
                        <div style="text-align: center; color: rgba(255,255,255,0.7); font-size: 14px;">
                            ORDINAL RAINBOWS Vol. 1
                        </div>
                        <div class="flip-hint">Double-click to flip back</div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(popup);
        this.bindEvents();
    }
    
    bindEvents() {
        const popup = document.getElementById('cardDetailPopup');
        const card = document.getElementById('popupCard');
        
        // Close buttons
        popup.querySelectorAll('.popup-close').forEach(btn => {
            btn.addEventListener('click', () => this.close());
        });
        
        // Close on background click
        popup.addEventListener('click', (e) => {
            if (e.target === popup) this.close();
        });
        
        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) this.close();
        });
        
        // Double-click to flip
        card.addEventListener('dblclick', () => this.flipCard());
        
        // Simple 3D rotation on mouse move
        card.addEventListener('mousemove', (e) => {
            if (!this.isOpen) return;
            
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const rotateY = (x / rect.width - 0.5) * 30;
            const rotateX = (y / rect.height - 0.5) * -20;
            
            card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'rotateX(0deg) rotateY(0deg)';
        });
    }
    
    async show(nftId) {
        try {
            const nft = window.nfts?.find(n => n.id === nftId);
            if (!nft) {
                console.error('[POPUP] NFT not found:', nftId);
                return;
            }
            
            console.log('[POPUP] Showing card:', nft.title);
            
            // Update card content
            document.getElementById('popupTitle').textContent = nft.title;
            document.getElementById('popupSubtitle').textContent = nft.subtitle;
            document.getElementById('popupTitleBack').textContent = nft.title;
            document.getElementById('popupImage').src = `images/${nft.id}.jpg`;
            
            // Check ownership and rewards
            await this.updateOwnershipAndRewards(nft);
            
            // Show popup
            const popup = document.getElementById('cardDetailPopup');
            popup.classList.add('show');
            this.isOpen = true;
            
        } catch (err) {
            console.error('[POPUP] Error showing card:', err);
        }
    }
    
    async updateOwnershipAndRewards(nft) {
        const ownershipBadge = document.getElementById('ownershipBadge');
        const ownershipText = document.getElementById('ownershipText');
        const rewardAmount = document.getElementById('rewardAmount');
        const rewardValue = document.getElementById('rewardValue');
        
        if (!this.walletManager.isWalletConnected()) {
            ownershipBadge.className = 'ownership-badge not-owned';
            ownershipText.textContent = 'Connect wallet to verify ownership';
            rewardAmount.style.display = 'none';
            return;
        }
        
        try {
            // Check if user owns this specific ordinal
            const hasOrdinals = await this.rewardsManager.ownsOrdinal();
            
            if (hasOrdinals && this.rewardsManager.ownedOrdinals) {
                const ownedOrdinal = this.rewardsManager.ownedOrdinals.find(o => 
                    o.nft && o.nft.id === nft.id
                );
                
                if (ownedOrdinal) {
                    ownershipBadge.className = 'ownership-badge owned';
                    ownershipText.textContent = '✅ You own this NFT!';
                    
                    // Calculate and show rewards
                    const rewards = await this.calculateRewards(nft);
                    rewardValue.textContent = rewards.toFixed(4);
                    rewardAmount.style.display = 'block';
                } else {
                    ownershipBadge.className = 'ownership-badge not-owned';
                    ownershipText.textContent = '❌ NFT not in your wallet';
                    rewardAmount.style.display = 'none';
                }
            } else {
                ownershipBadge.className = 'ownership-badge not-owned';
                ownershipText.textContent = '❌ No ORDINAL RAINBOWS found in wallet';
                rewardAmount.style.display = 'none';
            }
        } catch (err) {
            console.error('[POPUP] Error checking ownership:', err);
            ownershipBadge.className = 'ownership-badge not-owned';
            ownershipText.textContent = 'Error checking ownership';
            rewardAmount.style.display = 'none';
        }
    }
    
    async calculateRewards(nft) {
        const rewardRates = {
            'Legendary': 100.0,
            'Exotic': 50.0,
            'Epic': 20.0,
            'Rare': 10.0,
            'Uncommon': 5.0,
            'Common': 2.0
        };
        
        const baseReward = rewardRates[nft.rarity] || 2.0;
        const launchDate = new Date('2024-01-01');
        const daysSinceLaunch = Math.floor((Date.now() - launchDate.getTime()) / (1000 * 60 * 60 * 24));
        const timeMultiplier = 1 + (daysSinceLaunch * 0.002);
        
        return baseReward * timeMultiplier;
    }
    
    flipCard() {
        const card = document.getElementById('popupCard');
        const currentRotation = card.style.transform.includes('rotateY(180deg)') ? 0 : 180;
        card.style.transform = `rotateY(${currentRotation}deg)`;
    }
    
    close() {
        const popup = document.getElementById('cardDetailPopup');
        popup.classList.remove('show');
        this.isOpen = false;
        
        // Reset card rotation
        const card = document.getElementById('popupCard');
        card.style.transform = 'rotateX(0deg) rotateY(0deg)';
    }
}
