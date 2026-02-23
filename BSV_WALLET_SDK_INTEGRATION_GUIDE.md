# BSV Wallet SDK Integration Guide

## Overview
This guide covers comprehensive integration of major BSV wallet SDKs for web applications, focusing on automatic wallet connections, authentication, and message signing to replace manual signature entry.

## 1. Yours Wallet SDK Integration

### Installation
```bash
npm install yours-wallet-sdk
# or via CDN
<script src="https://unpkg.com/yours-wallet-sdk/dist/yours-wallet.min.js"></script>
```

### Basic Integration
```javascript
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

            // Request connection
            const response = await window.YoursWallet.connect({
                network: 'mainnet', // or 'testnet'
                appName: 'Ordinal Rainbows'
            });

            this.wallet = response.wallet;
            this.isConnected = true;
            
            console.log('Yours Wallet connected:', response.address);
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

        try {
            const signature = await window.YoursWallet.signMessage({
                message: message,
                encoding: 'utf8'
            });

            return {
                signature: signature.signature,
                address: signature.address,
                publicKey: signature.publicKey
            };
        } catch (error) {
            console.error('Signing failed:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.wallet) {
            await window.YoursWallet.disconnect();
            this.wallet = null;
            this.isConnected = false;
        }
    }
}
```

## 2. HandCash Connect SDK

### Installation
```bash
npm install @handcash/handcash-connect
```

### Implementation
```javascript
import { HandCashConnect } from '@handcash/handcash-connect';

class HandCashIntegration {
    constructor() {
        this.handcash = new HandCashConnect({
            appId: 'your-app-id', // Register at https://handcash.dev
            appSecret: 'your-app-secret'
        });
        this.account = null;
    }

    async connect() {
        try {
            // Redirect to HandCash for authorization
            const authUrl = this.handcash.getAuthURL();
            
            // Open popup or redirect
            const popup = window.open(authUrl, 'handcash-auth', 'width=500,height=600');
            
            // Listen for callback
            return new Promise((resolve, reject) => {
                const interval = setInterval(() => {
                    try {
                        if (popup.closed) {
                            clearInterval(interval);
                            reject(new Error('Authentication cancelled'));
                        }
                        
                        // Check for auth token in URL
                        const url = popup.location.href;
                        if (url.includes('authToken=')) {
                            const token = new URL(url).searchParams.get('authToken');
                            this.account = this.handcash.getAccountFromAuthToken(token);
                            popup.close();
                            clearInterval(interval);
                            resolve(this.getAccountInfo());
                        }
                    } catch (e) {
                        // Cross-origin error - expected during authentication
                    }
                }, 1000);
            });
        } catch (error) {
            console.error('HandCash connection failed:', error);
            throw error;
        }
    }

    async getAccountInfo() {
        if (!this.account) throw new Error('Not connected');
        
        const profile = await this.account.profile.getCurrentProfile();
        const wallet = await this.account.wallet.getPaymentParameters();
        
        return {
            handle: profile.handle,
            publicKey: profile.publicKey,
            paymail: profile.paymail,
            address: wallet.destinationAddress
        };
    }

    async signMessage(message) {
        if (!this.account) throw new Error('Not connected');
        
        try {
            const signature = await this.account.wallet.signData({
                message: message,
                encoding: 'utf8'
            });
            
            return {
                signature: signature,
                publicKey: this.account.profile.publicKey
            };
        } catch (error) {
            console.error('HandCash signing failed:', error);
            throw error;
        }
    }
}
```

## 3. Babbage SDK (BRC-100) Integration

### Installation
```bash
npm install @babbage/sdk
```

### Implementation
```javascript
import { Babbage } from '@babbage/sdk';

class BabbageSDKIntegration {
    constructor() {
        this.babbage = new Babbage();
        this.isConnected = false;
        this.identityKey = null;
    }

    async connect() {
        try {
            // Initialize Babbage SDK
            await this.babbage.initialize({
                network: 'mainnet'
            });

            // Get identity key (BRC-100 standard)
            this.identityKey = await this.babbage.getIdentityKey();
            this.isConnected = true;

            const publicKey = await this.babbage.getPublicKey({
                identityKey: this.identityKey,
                keyType: 'main'
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

    async signMessage(message) {
        if (!this.isConnected) {
            throw new Error('Babbage SDK not connected');
        }

        try {
            const signature = await this.babbage.signMessage({
                message: message,
                keyType: 'main',
                encoding: 'utf8'
            });

            return {
                signature: signature,
                identityKey: this.identityKey,
                publicKey: await this.babbage.getPublicKey({
                    identityKey: this.identityKey,
                    keyType: 'main'
                })
            };
        } catch (error) {
            console.error('Babbage signing failed:', error);
            throw error;
        }
    }

    async createTransaction(outputs) {
        if (!this.isConnected) {
            throw new Error('Babbage SDK not connected');
        }

        try {
            const transaction = await this.babbage.createTransaction({
                outputs: outputs,
                feePerKb: 500
            });

            return {
                txid: transaction.txid,
                rawTx: transaction.rawTx
            };
        } catch (error) {
            console.error('Transaction creation failed:', error);
            throw error;
        }
    }
}
```

## 4. RelayX Wallet Integration

### Direct Integration (No SDK)
RelayX uses a direct postMessage API for web integration:

```javascript
class RelayXIntegration {
    constructor() {
        this.isConnected = false;
        this.address = null;
        this.publicKey = null;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            // Check if RelayX is available
            if (!window.relayx) {
                reject(new Error('RelayX not detected'));
                return;
            }

            // Request connection
            window.relayx.send({
                type: 'connect',
                appName: 'Ordinal Rainbows',
                network: 'mainnet'
            });

            // Listen for response
            const handleMessage = (event) => {
                if (event.data.type === 'connect_response') {
                    window.removeEventListener('message', handleMessage);
                    
                    if (event.data.success) {
                        this.isConnected = true;
                        this.address = event.data.address;
                        this.publicKey = event.data.publicKey;
                        
                        resolve({
                            success: true,
                            address: this.address,
                            publicKey: this.publicKey
                        });
                    } else {
                        reject(new Error(event.data.error));
                    }
                }
            };

            window.addEventListener('message', handleMessage);
            
            setTimeout(() => {
                window.removeEventListener('message', handleMessage);
                reject(new Error('Connection timeout'));
            }, 30000);
        });
    }

    async signMessage(message) {
        if (!this.isConnected) {
            throw new Error('RelayX not connected');
        }

        return new Promise((resolve, reject) => {
            window.relayx.send({
                type: 'sign_message',
                message: message,
                encoding: 'utf8'
            });

            const handleMessage = (event) => {
                if (event.data.type === 'sign_response') {
                    window.removeEventListener('message', handleMessage);
                    
                    if (event.data.success) {
                        resolve({
                            signature: event.data.signature,
                            address: this.address,
                            publicKey: this.publicKey
                        });
                    } else {
                        reject(new Error(event.data.error));
                    }
                }
            };

            window.addEventListener('message', handleMessage);
            
            setTimeout(() => {
                window.removeEventListener('message', handleMessage);
                reject(new Error('Signing timeout'));
            }, 30000);
        });
    }
}
```

## 5. Additional BSV Wallet SDKs

### Chronos Wallet Integration
```javascript
class ChronosWalletIntegration {
    async connect() {
        if (typeof window.chronos === 'undefined') {
            throw new Error('Chronos Wallet not detected');
        }

        try {
            const result = await window.chronos.connect();
            return {
                address: result.address,
                publicKey: result.publicKey
            };
        } catch (error) {
            throw new Error('Chronos connection failed: ' + error.message);
        }
    }

    async signMessage(message) {
        return await window.chronos.signMessage(message);
    }
}
```

### DotWallet Integration
```javascript
class DotWalletIntegration {
    async connect() {
        if (typeof window.dotwallet === 'undefined') {
            throw new Error('DotWallet not detected');
        }

        const result = await window.dotwallet.requestAccount();
        return {
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
```

## 6. Unified Wallet Manager

### Complete Integration Manager
```javascript
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
    }

    async detectAvailableWallets() {
        const available = [];
        
        // Check for wallet availability
        if (typeof window.YoursWallet !== 'undefined') available.push('yours');
        if (typeof window.relayx !== 'undefined') available.push('relayx');
        if (typeof window.chronos !== 'undefined') available.push('chronos');
        if (typeof window.dotwallet !== 'undefined') available.push('dotwallet');
        
        // HandCash and Babbage are always available (use popups/redirects)
        available.push('handcash', 'babbage');
        
        return available;
    }

    async connectWallet(walletType) {
        try {
            const provider = this.walletProviders[walletType];
            if (!provider) {
                throw new Error(`Unsupported wallet: ${walletType}`);
            }

            const result = await provider.connect();
            
            if (result.success !== false) {
                this.activeWallet = provider;
                this.walletType = walletType;
                
                return {
                    success: true,
                    walletType: walletType,
                    ...result
                };
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error(`${walletType} connection failed:`, error);
            throw error;
        }
    }

    async signMessage(message) {
        if (!this.activeWallet) {
            throw new Error('No wallet connected');
        }

        try {
            const result = await this.activeWallet.signMessage(message);
            
            return {
                ...result,
                walletType: this.walletType,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('Message signing failed:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.activeWallet && this.activeWallet.disconnect) {
            await this.activeWallet.disconnect();
        }
        
        this.activeWallet = null;
        this.walletType = null;
    }

    getConnectionStatus() {
        return {
            isConnected: this.activeWallet !== null,
            walletType: this.walletType
        };
    }
}
```

## 7. HTML Integration Example

### Wallet Selection UI
```html
<div id="wallet-selector" class="wallet-selector">
    <h3>Connect Your BSV Wallet</h3>
    <div class="wallet-options">
        <button class="wallet-option" data-wallet="yours">
            <img src="yours-logo.png" alt="Yours">
            Yours Wallet
        </button>
        <button class="wallet-option" data-wallet="handcash">
            <img src="handcash-logo.png" alt="HandCash">
            HandCash
        </button>
        <button class="wallet-option" data-wallet="babbage">
            <img src="babbage-logo.png" alt="Babbage">
            Babbage SDK
        </button>
        <button class="wallet-option" data-wallet="relayx">
            <img src="relayx-logo.png" alt="RelayX">
            RelayX
        </button>
    </div>
</div>
```

### JavaScript Integration
```javascript
// Initialize unified wallet manager
const walletManager = new UnifiedBSVWalletManager();

// Wallet selection event handlers
document.querySelectorAll('.wallet-option').forEach(button => {
    button.addEventListener('click', async (e) => {
        const walletType = e.target.dataset.wallet;
        
        try {
            showLoading('Connecting to ' + walletType + '...');
            
            const result = await walletManager.connectWallet(walletType);
            
            hideLoading();
            showWalletConnected(result);
            
            // Automatically trigger authentication
            await authenticateWithWallet(result.address);
            
        } catch (error) {
            hideLoading();
            showError('Connection failed: ' + error.message);
        }
    });
});

// Automatic authentication after wallet connection
async function authenticateWithWallet(address) {
    try {
        // Generate challenge
        const challenge = window.BSVAuth.generateChallenge();
        
        // Sign with connected wallet
        const signResult = await walletManager.signMessage(challenge);
        
        // Verify signature
        const isValid = await window.BSVAuth.verifySignature(
            challenge,
            signResult.signature,
            address
        );
        
        if (isValid) {
            window.BSVAuth.markAuthenticated(address);
            showSuccess('Wallet authenticated successfully!');
            
            // Hide manual signing UI
            document.getElementById('manual-auth').style.display = 'none';
        } else {
            throw new Error('Signature verification failed');
        }
        
    } catch (error) {
        console.error('Auto-authentication failed:', error);
        showError('Authentication failed: ' + error.message);
        
        // Fallback to manual signing
        showManualAuthFallback(address);
    }
}
```

## 8. Error Handling & Fallbacks

### Robust Error Handling
```javascript
class WalletErrorHandler {
    static handleConnectionError(walletType, error) {
        const errorMessage = {
            'yours': 'Yours Wallet not installed or available',
            'handcash': 'HandCash authentication failed',
            'relayx': 'RelayX not detected in browser',
            'babbage': 'Babbage SDK initialization failed'
        };
        
        console.error(`${walletType} Error:`, error);
        
        // Show user-friendly error
        return {
            error: errorMessage[walletType] || 'Wallet connection failed',
            suggestion: this.getSuggestion(walletType),
            fallback: 'manual'
        };
    }
    
    static getSuggestion(walletType) {
        const suggestions = {
            'yours': 'Please install Yours Wallet extension',
            'relayx': 'Please install RelayX wallet',
            'handcash': 'Check HandCash app permissions',
            'babbage': 'Ensure Babbage wallet is unlocked'
        };
        
        return suggestions[walletType] || 'Try another wallet or manual signing';
    }
}
```

This comprehensive guide provides practical implementations for all major BSV wallet SDKs with automatic modal handling, authentication flows, and fallback mechanisms to replace manual signature entry.