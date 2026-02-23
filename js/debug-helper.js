/**
 * ORDINAL RAINBOWS - System Testing & Debug Helper
 * Use this in browser console to test all functionality
 */

console.log('🌈 ORDINAL RAINBOWS Debug Helper Loaded');

const BSVDebugger = {
    // Test if all libraries are loaded
    checkLibraries() {
        console.log('📚 Library Status:');
        console.log('BSV Library:', typeof bsv !== 'undefined' ? '✅ Loaded' : '❌ Missing');
        console.log('CryptoJS:', typeof CryptoJS !== 'undefined' ? '✅ Loaded' : '❌ Missing');
        console.log('BSV Wallet SDK:', typeof BSVWalletSDKManager !== 'undefined' ? '✅ Loaded' : '❌ Missing');
        console.log('BSV Auth:', typeof bsvAuth !== 'undefined' ? '✅ Loaded' : '❌ Missing');
        console.log('Rewards Manager:', typeof window.rewardsManager !== 'undefined' ? '✅ Loaded' : '❌ Missing');
    },

    // Check system state
    checkSystemState() {
        console.log('🔍 System State:');
        console.log('Wallet Connected:', window.walletManager?.isConnected || false);
        console.log('Current Address:', window.walletManager?.address || 'None');
        console.log('Wallet Type:', window.walletManager?.walletType || 'None');
        console.log('Dashboard UI:', typeof window.dashboardUI !== 'undefined' ? '✅ Ready' : '❌ Missing');
    },

    // Test wallet detection
    async testWalletDetection() {
        console.log('🔍 Testing Wallet Detection...');
        
        if (typeof BSVWalletSDKManager === 'undefined') {
            console.error('❌ BSV Wallet SDK not loaded!');
            return;
        }
        
        const sdk = new BSVWalletSDKManager();
        const available = await sdk.detectAvailableWallets();
        
        console.log('Available Wallets:', available);
        return available;
    },

    // Test authentication flow
    async testAuthentication(address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa') {
        console.log('🔐 Testing Authentication with address:', address);
        
        if (!window.bsvAuth) {
            console.error('❌ BSV Auth not available!');
            return;
        }
        
        // Test message signing
        const message = `Test authentication for ORDINAL RAINBOWS: ${Date.now()}`;
        console.log('Message to sign:', message);
        
        // This would normally require actual signature from wallet
        console.log('✅ Authentication test prepared - use real wallet to complete');
    },

    // Test ordinals detection
    async testOrdinalsDetection(address) {
        if (!address) {
            console.log('❓ Please provide wallet address to test');
            return;
        }
        
        console.log('🔍 Testing ORDINAL RAINBOWS detection for:', address);
        
        if (!window.rewardsManager) {
            console.error('❌ Rewards Manager not available!');
            return;
        }
        
        try {
            // Update wallet manager address temporarily for testing
            const oldAddress = window.walletManager.address;
            window.walletManager.address = address;
            
            const hasOrdinals = await window.rewardsManager.ownsOrdinal();
            console.log('Has ORDINAL RAINBOWS:', hasOrdinals ? '✅ YES' : '❌ NO');
            
            // Restore old address
            window.walletManager.address = oldAddress;
            
            return hasOrdinals;
        } catch (error) {
            console.error('❌ Error testing ordinals:', error);
        }
    },

    // Simulate SDK authentication event
    simulateAuthentication(address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', walletType = 'yours') {
        console.log('🎭 Simulating wallet authentication event...');
        
        const authEvent = new CustomEvent('bsv-wallet-authenticated', {
            detail: {
                address: address,
                wallet: walletType,
                message: `Authentication test: ${Date.now()}`,
                signature: 'test_signature_' + Date.now(),
                timestamp: Date.now()
            }
        });
        
        window.dispatchEvent(authEvent);
        console.log('✅ Authentication event dispatched');
    },

    // Full system test
    async runFullSystemTest() {
        console.log('🚀 Running Full System Test...');
        console.log('='.repeat(50));
        
        // Test 1: Libraries
        this.checkLibraries();
        console.log('');
        
        // Test 2: System State
        this.checkSystemState();
        console.log('');
        
        // Test 3: Wallet Detection
        await this.testWalletDetection();
        console.log('');
        
        // Test 4: Authentication Setup
        this.testAuthentication();
        console.log('');
        
        console.log('✅ System test complete!');
        console.log('💡 Use BSVDebugger.simulateAuthentication(yourAddress, "yours") to test authentication flow');
    },

    // Help
    help() {
        console.log('🌈 ORDINAL RAINBOWS Debug Helper Commands:');
        console.log('');
        console.log('BSVDebugger.checkLibraries() - Check all libraries loaded');
        console.log('BSVDebugger.checkSystemState() - Check current state');
        console.log('BSVDebugger.testWalletDetection() - Test wallet detection');
        console.log('BSVDebugger.testAuthentication(address) - Test auth flow');
        console.log('BSVDebugger.testOrdinalsDetection(address) - Test ordinals detection');
        console.log('BSVDebugger.simulateAuthentication(address, wallet) - Simulate wallet auth');
        console.log('BSVDebugger.runFullSystemTest() - Run complete test suite');
        console.log('');
        console.log('Example: BSVDebugger.simulateAuthentication("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "yours")');
    }
};

// Auto-run basic checks
BSVDebugger.runFullSystemTest();

console.log('');
console.log('💡 Type BSVDebugger.help() for all available commands');

// Make available globally
window.BSVDebugger = BSVDebugger;