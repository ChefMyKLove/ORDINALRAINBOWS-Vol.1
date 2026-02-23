/**
 * Unified BSV Wallet SDK Manager
 * Integrates: Yours, HandCash, Babbage, RelayX, Chronos, DotWallet
 * 
 * Replaces manual signature entry with automatic wallet connections
 */

// 1. Yours Wallet Integration
class YoursWalletIntegration {
    constructor() {
        this.wallet = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            if (typeof window.YoursWallet === 'undefined') {
                throw new Error('Yours Wallet not detected');
            }

            const response = await window.YoursWallet.connect({
                network: 'mainnet',
                appName: 'Ordinal Rainbows'
            });

            this.wallet = response.wallet;
            this.isConnected = true;
            
            return {
                success: true,
                address: response.address,
                publicKey: response.publicKey
            };
        } catch (error) {
            console.error('Yours Wallet connection failed:', error);
            return { success: false, error: error.message };
        }
    }

    async signMessage(message) {
        if (!this.isConnected) {
            throw new Error('Wallet not connected');
        }

        const signature = await window.YoursWallet.signMessage({
            message: message,
            encoding: 'utf8'
        });

        return {
            signature: signature.signature,
            address: signature.address,
            publicKey: signature.publicKey
        };
    }

    async disconnect() {
        if (this.wallet) {
            await window.YoursWallet.disconnect();
            this.wallet = null;
            this.isConnected = false;
        }
    }
}

// 2. HandCash Connect Integration  
class HandCashIntegration {
    constructor() {
        this.appId = 'your-app-id'; // Get from https://handcash.dev
        this.isConnected = false;
        this.authToken = null;
    }

    async connect() {
        try {
            // Create HandCash auth URL
            const authUrl = `https://app.handcash.io/#/authorizeApp?appId=${this.appId}`;
            
            // Open popup for authentication
            const popup = window.open(authUrl, 'handcash-auth', 'width=500,height=600,scrollbars=yes');
            
            return new Promise((resolve, reject) => {
                const interval = setInterval(() => {
                    try {
                        if (popup.closed) {
                            clearInterval(interval);
                            reject(new Error('Authentication cancelled'));
                            return;
                        }
                        
                        // Check for auth token in popup URL
                        const url = popup.location.href;
                        if (url.includes('authToken=')) {
                            const token = new URL(url).searchParams.get('authToken');
                            this.authToken = token;
                            this.isConnected = true;
                            popup.close();
                            clearInterval(interval);
                            
                            // Get account info
                            this.getAccountInfo().then(info => {
                                resolve({
                                    success: true,
                                    ...info
                                });
                            }).catch(reject);
                        }
                    } catch (e) {
                        // Cross-origin error during authentication - expected
                    }
                }, 1000);

                setTimeout(() => {
                    clearInterval(interval);
                    if (!popup.closed) popup.close();
                    reject(new Error('Authentication timeout'));
                }, 30000);
            });
        } catch (error) {
            console.error('HandCash connection failed:', error);
            return { success: false, error: error.message };
        }
    }

    async getAccountInfo() {
        if (!this.authToken) throw new Error('Not authenticated');
        
        // Make API call to get profile
        const response = await fetch(`https://cloud.handcash.io/v1/connect/profile`, {
            headers: {
                'Authorization': `Bearer ${this.authToken}`
            }
        });
        
        const profile = await response.json();
        return {
            handle: profile.handle,
            paymail: profile.paymail,
            address: profile.receivingAddress
        };
    }

    async signMessage(message) {
        if (!this.isConnected) throw new Error('Not connected');
        
        // Use HandCash API to sign message
        const response = await fetch('https://cloud.handcash.io/v1/connect/signature', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                encoding: 'utf8'
            })
        });

        const result = await response.json();
        return {
            signature: result.signature,
            address: result.address
        };
    }
}

// 3. Babbage SDK Integration
class BabbageSDKIntegration {
    constructor() {
        this.isConnected = false;
        this.identityKey = null;
    }

    async connect() {
        try {
            // Check for Babbage in browser
            if (typeof window.babbage === 'undefined') {
                // Load Babbage SDK
                await this.loadBabbageSDK();
            }

            // Initialize connection
            const identityKey = await window.babbage.getIdentityKey();
            this.identityKey = identityKey;
            this.isConnected = true;

            const publicKey = await window.babbage.getPublicKey({
                identityKey: this.identityKey,
                keyType: 'identity'
            });

            return {
                success: true,
                identityKey: this.identityKey,
                publicKey: publicKey
            };
        } catch (error) {
            console.error('Babbage SDK connection failed:', error);
            return { success: false, error: error.message };
        }
    }

    async loadBabbageSDK() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/@babbage/sdk/dist/babbage-sdk.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async signMessage(message) {
        if (!this.isConnected) throw new Error('Babbage SDK not connected');

        const signature = await window.babbage.signMessage({
            message: message,
            keyType: 'identity'
        });

        return {
            signature: signature,
            identityKey: this.identityKey
        };
    }
}

// 4. RelayX Integration
class RelayXIntegration {
    constructor() {
        this.isConnected = false;
        this.address = null;
        this.publicKey = null;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            if (typeof window.relayx === 'undefined') {
                reject(new Error('RelayX not detected'));
                return;
            }

            // Send connection request
            window.postMessage({
                type: 'relayx_connect',
                appName: 'Ordinal Rainbows'
            }, '*');

            // Listen for response
            const handleMessage = (event) => {
                if (event.data.type === 'relayx_connected') {
                    window.removeEventListener('message', handleMessage);
                    
                    this.isConnected = true;
                    this.address = event.data.address;
                    this.publicKey = event.data.publicKey;
                    
                    resolve({
                        success: true,
                        address: this.address,
                        publicKey: this.publicKey
                    });
                } else if (event.data.type === 'relayx_error') {
                    window.removeEventListener('message', handleMessage);
                    reject(new Error(event.data.message));
                }
            };

            window.addEventListener('message', handleMessage);
            
            setTimeout(() => {
                window.removeEventListener('message', handleMessage);
                reject(new Error('RelayX connection timeout'));
            }, 30000);
        });
    }

    async signMessage(message) {
        if (!this.isConnected) throw new Error('RelayX not connected');

        return new Promise((resolve, reject) => {
            window.postMessage({
                type: 'relayx_sign',
                message: message
            }, '*');

            const handleMessage = (event) => {
                if (event.data.type === 'relayx_signed') {
                    window.removeEventListener('message', handleMessage);
                    resolve({
                        signature: event.data.signature,
                        address: this.address,
                        publicKey: this.publicKey
                    });
                } else if (event.data.type === 'relayx_sign_error') {
                    window.removeEventListener('message', handleMessage);
                    reject(new Error(event.data.message));
                }
            };

            window.addEventListener('message', handleMessage);
            
            setTimeout(() => {
                window.removeEventListener('message', handleMessage);
                reject(new Error('RelayX signing timeout'));
            }, 30000);
        });
    }
}

// 5. Additional Wallet Integrations
class ChronosWalletIntegration {
    async connect() {
        if (typeof window.chronos === 'undefined') {
            throw new Error('Chronos Wallet not detected');
        }

        const result = await window.chronos.connect();
        return {
            success: true,
            address: result.address,
            publicKey: result.publicKey
        };
    }

    async signMessage(message) {
        return await window.chronos.signMessage(message);
    }
}

class DotWalletIntegration {
    async connect() {
        if (typeof window.dotwallet === 'undefined') {
            throw new Error('DotWallet not detected');
        }

        const result = await window.dotwallet.requestAccount();
        return {
            success: true,
            address: result.address,
            publicKey: result.publicKey
        };
    }

    async signMessage(message) {
        return await window.dotwallet.signMessage({
            message: message,
            address: this.address
        });
    }
}

// 6. Unified Wallet Manager
class UnifiedBSVWalletManager {
    constructor() {
        this.walletProviders = {
            yours: new YoursWalletIntegration(),
            handcash: new HandCashIntegration(),
            babbage: new BabbageSDKIntegration(),
            relayx: new RelayXIntegration(),
            chronos: new ChronosWalletIntegration(),
            dotwallet: new DotWalletIntegration()
        };
        
        this.activeWallet = null;
        this.walletType = null;
        this.connectionData = null;
    }

    async detectAvailableWallets() {
        const available = [];
        
        // Check for installed wallet extensions
        if (typeof window.YoursWallet !== 'undefined') available.push('yours');
        if (typeof window.relayx !== 'undefined') available.push('relayx');  
        if (typeof window.chronos !== 'undefined') available.push('chronos');
        if (typeof window.dotwallet !== 'undefined') available.push('dotwallet');
        
        // These wallets are always available (use popups/web)
        available.push('handcash', 'babbage');
        
        console.log('[Unified Wallet] Available wallets:', available);
        return available;
    }

    async connectWallet(walletType) {
        try {
            const provider = this.walletProviders[walletType];
            if (!provider) {
                throw new Error(`Unsupported wallet: ${walletType}`);
            }

            console.log(`[Unified Wallet] Connecting to ${walletType}...`);
            const result = await provider.connect();
            
            if (result.success !== false) {
                this.activeWallet = provider;
                this.walletType = walletType;
                this.connectionData = result;
                
                console.log(`[Unified Wallet] ${walletType} connected:`, result);
                
                return {
                    success: true,
                    walletType: walletType,
                    ...result
                };
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error(`[Unified Wallet] ${walletType} connection failed:`, error);
            throw error;
        }
    }

    async signMessage(message) {
        if (!this.activeWallet) {
            throw new Error('No wallet connected');
        }

        try {
            console.log(`[Unified Wallet] Signing with ${this.walletType}:`, message.substring(0, 50) + '...');
            const result = await this.activeWallet.signMessage(message);
            
            return {
                ...result,
                walletType: this.walletType,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('[Unified Wallet] Message signing failed:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.activeWallet && this.activeWallet.disconnect) {
            await this.activeWallet.disconnect();
        }
        
        this.activeWallet = null;
        this.walletType = null;
        this.connectionData = null;
        
        console.log('[Unified Wallet] Disconnected');
    }

    getConnectionStatus() {
        return {
            isConnected: this.activeWallet !== null,
            walletType: this.walletType,
            ...this.connectionData
        };
    }

    // Integration with existing BSV Auth system
    async authenticateWithBSVAuth(address = null) {
        try {
            // Use address from connection if not provided
            const targetAddress = address || this.connectionData?.address;
            if (!targetAddress) {
                throw new Error('No address available for authentication');
            }

            // Generate challenge using existing BSV Auth system
            const challenge = window.BSVAuth.generateChallenge();
            
            // Sign challenge with connected wallet
            const signResult = await this.signMessage(challenge);
            
            // Verify signature using existing BSV Auth system
            const isValid = await window.BSVAuth.verifySignature(
                challenge,
                signResult.signature,
                targetAddress
            );
            
            if (isValid) {
                window.BSVAuth.markAuthenticated(targetAddress);
                
                return {
                    success: true,
                    address: targetAddress,
                    signature: signResult.signature,
                    challenge: challenge,
                    walletType: this.walletType
                };
            } else {
                throw new Error('Signature verification failed');
            }
            
        } catch (error) {
            console.error('[Unified Wallet] Auto-authentication failed:', error);
            throw error;
        }
    }
}

// Export for global use
if (typeof window !== 'undefined') {
    window.UnifiedBSVWalletManager = UnifiedBSVWalletManager;
    window.BSVWallets = {
        YoursWalletIntegration,
        HandCashIntegration, 
        BabbageSDKIntegration,
        RelayXIntegration,
        ChronosWalletIntegration,
        DotWalletIntegration
    };
}

console.log('[BSV Wallet SDK] Unified wallet manager loaded');