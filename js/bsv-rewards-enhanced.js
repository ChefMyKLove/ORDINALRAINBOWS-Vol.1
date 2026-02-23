/**
 * Enhanced BSV Rewards Integration with SDK Support
 * Bridges existing reward system with new unified wallet manager
 */

class EnhancedBSVRewardsIntegration {
    constructor(config = {}) {
        this.config = {
            vaultAddress: config.vaultAddress || '0x_VAULT_ADDRESS_',
            claimAddress: config.claimAddress || '0x_CLAIM_ADDRESS_',
            network: config.network || 'mainnet',
            ...config
        };
        
        // Initialize unified wallet manager
        this.unifiedWalletManager = new UnifiedBSVWalletManager();
        
        // Legacy properties for compatibility
        this.wallet = null;
        this.address = null;
        this.provider = null;
        this.isConnected = false;
        this.walletType = null;
        
        // Event handlers
        this.setupEventHandlers();
        
        console.log('[Enhanced BSV Rewards] Initialized with SDK support');
    }

    setupEventHandlers() {
        // Listen for wallet UI events
        document.addEventListener('bsv-wallet-walletConnected', (event) => {
            this.handleWalletConnected(event.detail);
        });

        document.addEventListener('bsv-wallet-walletAuthenticated', (event) => {
            this.handleWalletAuthenticated(event.detail);
        });

        document.addEventListener('bsv-wallet-walletDisconnected', (event) => {
            this.handleWalletDisconnected(event.detail);
        });

        document.addEventListener('bsv-wallet-manualFallbackRequested', (event) => {
            this.handleManualFallback();
        });
    }

    handleWalletConnected(detail) {
        console.log('[Enhanced BSV Rewards] Wallet connected:', detail);
        
        // Update legacy properties for compatibility
        this.wallet = this.unifiedWalletManager.activeWallet;
        this.address = detail.address;
        this.walletType = detail.walletType;
        this.isConnected = true;

        // Show connection success
        this.showNotification(`✅ ${detail.walletType} wallet connected!`, 'success');
        
        // Update UI elements
        this.updateConnectionUI();
    }

    handleWalletAuthenticated(detail) {
        console.log('[Enhanced BSV Rewards] Wallet authenticated:', detail);
        
        // Enable reward claiming
        this.enableRewardClaiming();
        
        // Hide manual authentication section
        this.hideManualAuthentication();
        
        // Show success message
        this.showNotification('🔓 Wallet authenticated! You can now claim rewards.', 'success');
        
        // Check for claimable rewards
        this.checkClaimableRewards(detail.address);
    }

    handleWalletDisconnected(detail) {
        console.log('[Enhanced BSV Rewards] Wallet disconnected');
        
        // Reset state
        this.wallet = null;
        this.address = null;
        this.walletType = null;
        this.isConnected = false;
        
        // Update UI
        this.updateConnectionUI();
        this.disableRewardClaiming();
        this.showManualAuthentication();
        
        this.showNotification('Wallet disconnected', 'info');
    }

    handleManualFallback() {
        console.log('[Enhanced BSV Rewards] Manual fallback requested');
        this.showManualAuthentication();
    }

    // Legacy compatibility methods
    async detectAvailableWallets() {
        return await this.unifiedWalletManager.detectAvailableWallets();
    }

    async connectWallet(walletType) {
        try {
            const result = await this.unifiedWalletManager.connectWallet(walletType);
            
            if (result.success) {
                return {
                    success: true,
                    wallet: this.unifiedWalletManager.activeWallet,
                    address: result.address,
                    walletType: walletType
                };
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('[Enhanced BSV Rewards] Connect failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async signMessage(message) {
        if (!this.isConnected) {
            throw new Error('Wallet not connected');
        }

        try {
            const result = await this.unifiedWalletManager.signMessage(message);
            
            return {
                signature: result.signature,
                address: result.address || this.address,
                publicKey: result.publicKey,
                walletType: result.walletType
            };
        } catch (error) {
            console.error('[Enhanced BSV Rewards] Signing failed:', error);
            throw error;
        }
    }

    // Enhanced authentication with automatic signatures
    async authenticateWallet(address = null) {
        try {
            const targetAddress = address || this.address;
            if (!targetAddress) {
                throw new Error('No address available for authentication');
            }

            // Use existing BSV Auth system with automatic signing
            const result = await this.unifiedWalletManager.authenticateWithBSVAuth(targetAddress);
            
            if (result.success) {
                this.enableRewardClaiming();
                return result;
            } else {
                throw new Error('Authentication failed');
            }
            
        } catch (error) {
            console.error('[Enhanced BSV Rewards] Authentication failed:', error);
            this.showManualAuthenticationFallback(address);
            throw error;
        }
    }

    // UI Management Methods
    updateConnectionUI() {
        // Update legacy UI elements if they exist
        const connectBtn = document.getElementById('connectWallet');
        const walletStatus = document.getElementById('walletStatus');
        const addressDisplay = document.getElementById('walletAddress');

        if (connectBtn && walletStatus && addressDisplay) {
            if (this.isConnected) {
                connectBtn.style.display = 'none';
                walletStatus.classList.remove('hidden');
                addressDisplay.textContent = this.address?.substring(0, 12) + '...';
            } else {
                connectBtn.style.display = 'block';
                walletStatus.classList.add('hidden');
            }
        }
    }

    enableRewardClaiming() {
        // Enable all claim buttons
        document.querySelectorAll('.reward-card .claim-btn').forEach(btn => {
            btn.disabled = false;
            btn.textContent = 'Claim Reward';
            btn.classList.remove('disabled');
        });

        // Show authenticated status
        document.querySelectorAll('.auth-required').forEach(el => {
            el.classList.add('authenticated');
        });
    }

    disableRewardClaiming() {
        // Disable all claim buttons
        document.querySelectorAll('.reward-card .claim-btn').forEach(btn => {
            btn.disabled = true;
            btn.textContent = 'Connect Wallet First';
            btn.classList.add('disabled');
        });

        // Hide authenticated status
        document.querySelectorAll('.auth-required').forEach(el => {
            el.classList.remove('authenticated');
        });
    }

    hideManualAuthentication() {
        const manualAuth = document.getElementById('manual-auth');
        if (manualAuth) {
            manualAuth.style.display = 'none';
        }
    }

    showManualAuthentication() {
        const manualAuth = document.getElementById('manual-auth');
        if (manualAuth) {
            manualAuth.style.display = 'block';
        }
    }

    showManualAuthenticationFallback(address) {
        this.showManualAuthentication();
        
        // Pre-fill address if input exists
        const addressInput = document.querySelector('#manual-auth input[type="text"]');
        if (addressInput && address) {
            addressInput.value = address;
        }

        this.showNotification('⚠️ Automatic authentication failed. Please use manual signing.', 'warning');
    }

    async checkClaimableRewards(address) {
        try {
            // Check which rewards this address can claim
            const ownedOrinals = await this.checkOrdinalOwnership(address);
            
            ownedOrinals.forEach(ordinal => {
                this.enableOrdinalReward(ordinal);
            });
            
            if (ownedOrinals.length > 0) {
                this.showNotification(`🎁 You have ${ownedOrinals.length} claimable reward(s)!`, 'success');
            }
            
        } catch (error) {
            console.error('[Enhanced BSV Rewards] Error checking rewards:', error);
        }
    }

    async checkOrdinalOwnership(address) {
        // Implement ordinal ownership verification
        // This would query ordinal indexers/APIs to verify ownership
        try {
            // Placeholder implementation - replace with actual API calls
            const ownedOrdinals = [];
            
            // Example: Check specific ordinal collections
            const ordinalCollections = [
                'ordinalrainbows_vol1',
                'ordinalrainbows_special'
            ];
            
            for (const collection of ordinalCollections) {
                // Mock API call - replace with real implementation
                const response = await fetch(`/api/check-ownership/${collection}/${address}`);
                if (response.ok) {
                    const data = await response.json();
                    ownedOrdinals.push(...data.ownedOrdinals);
                }
            }
            
            return ownedOrdinals;
        } catch (error) {
            console.error('Ordinal ownership check failed:', error);
            return [];
        }
    }

    enableOrdinalReward(ordinal) {
        const rewardCard = document.querySelector(`[data-ordinal="${ordinal.id}"]`);
        if (rewardCard) {
            rewardCard.classList.add('claimable');
            const claimBtn = rewardCard.querySelector('.claim-btn');
            if (claimBtn) {
                claimBtn.disabled = false;
                claimBtn.textContent = 'Claim Your Reward';
                claimBtn.classList.add('ready');
            }
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `bsv-notification ${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#00ff0020' : type === 'error' ? '#ff000020' : type === 'warning' ? '#ffaa0020' : '#ffffff20'};
            border: 1px solid ${type === 'success' ? '#00ff00' : type === 'error' ? '#ff0000' : type === 'warning' ? '#ffaa00' : '#ffffff'};
            color: white;
            padding: 15px 20px;
            border-radius: 12px;
            backdrop-filter: blur(10px);
            z-index: 10001;
            max-width: 300px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 5000);
    }

    // Claim reward with enhanced error handling
    async claimReward(ordinalId, rewardType = 'standard') {
        try {
            if (!this.isConnected) {
                throw new Error('Wallet not connected');
            }

            const authStatus = window.BSVAuth?.authenticatedSessions?.has(this.address);
            if (!authStatus) {
                throw new Error('Wallet not authenticated');
            }

            this.showNotification('🎁 Processing reward claim...', 'info');

            // Create claim transaction
            const claimData = {
                ordinalId,
                rewardType,
                address: this.address,
                walletType: this.walletType,
                timestamp: Date.now()
            };

            // Sign claim data
            const signature = await this.signMessage(JSON.stringify(claimData));

            // Submit to reward API
            const response = await fetch('/api/claim-reward', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...claimData,
                    signature: signature.signature
                })
            });

            if (response.ok) {
                const result = await response.json();
                this.showNotification(`✅ Reward claimed successfully! TX: ${result.txid}`, 'success');
                
                // Update UI to show claimed status
                this.markRewardAsClaimed(ordinalId);
                
                return result;
            } else {
                throw new Error('Claim submission failed');
            }

        } catch (error) {
            console.error('[Enhanced BSV Rewards] Claim failed:', error);
            this.showNotification(`❌ Claim failed: ${error.message}`, 'error');
            throw error;
        }
    }

    markRewardAsClaimed(ordinalId) {
        const rewardCard = document.querySelector(`[data-ordinal="${ordinalId}"]`);
        if (rewardCard) {
            rewardCard.classList.add('claimed');
            const claimBtn = rewardCard.querySelector('.claim-btn');
            if (claimBtn) {
                claimBtn.disabled = true;
                claimBtn.textContent = 'Already Claimed';
                claimBtn.classList.add('claimed');
            }
        }
    }

    // Public API for compatibility
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            address: this.address,
            walletType: this.walletType,
            wallet: this.wallet
        };
    }
}

// Initialize enhanced rewards system
let enhancedBSVRewards;

document.addEventListener('DOMContentLoaded', () => {
    enhancedBSVRewards = new EnhancedBSVRewardsIntegration({
        network: 'mainnet',
        vaultAddress: 'YOUR_VAULT_ADDRESS',
        claimAddress: 'YOUR_CLAIM_ADDRESS'
    });

    // Make available globally for compatibility
    window.BSVRewards = enhancedBSVRewards;
    
    console.log('[Enhanced BSV Rewards] System initialized with SDK support');
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedBSVRewardsIntegration;
}

console.log('[Enhanced BSV Rewards] Integration loaded');