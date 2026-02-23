# 🌈 ORDINAL RAINBOWS - Authentication Troubleshooting Guide

## 🚀 **Quick Start Testing**

### **1. Start Development Server**
```bash
# Double-click this file to start server:
start-server.bat

# Or manually:
cd "c:\Users\micha\ordinalrainbowsproject\ORDINALRAINBOWS-Vol.1"
python -m http.server 8000
```

### **2. Open in Browser**
```
http://localhost:8000
```

### **3. Test Authentication Flow**
1. Open browser console (F12)
2. Load debug helper: `<script src="js/debug-helper.js"></script>`
3. Run system test: `BSVDebugger.runFullSystemTest()`

## 🔧 **Common Issues & Solutions**

### **❌ "BSV Library Failed to Load"**
**Problem:** External CDN blocked
**Solution:** 
- Check internet connection
- Try different browser (disable ad blockers)
- Download BSV library locally

### **❌ "Wallet Modal Doesn't Open"**
**Problem:** Wallet extension not installed
**Solution:**
1. Install Yours Wallet / HandCash extension
2. Make sure wallet is unlocked
3. Check browser console for errors

### **❌ "Signature Returns 'none'"**
**Problem:** ElectrumSV compatibility (known issue)
**Solution:**
- Use Yours Wallet or HandCash instead
- Test with different wallet software
- Check if wallet supports message signing

### **❌ "Authentication Fails"**
**Problem:** Signature verification failed
**Solution:**
1. Check console: `BSVDebugger.testAuthentication()`
2. Verify wallet address format
3. Ensure correct message signing

## 🧪 **Testing Commands**

### **In Browser Console:**

```javascript
// Test all systems
BSVDebugger.runFullSystemTest()

// Check specific wallet
BSVDebugger.testWalletDetection()

// Simulate authentication (for testing UI)
BSVDebugger.simulateAuthentication("your_wallet_address", "yours")

// Test ordinals detection
BSVDebugger.testOrdinalsDetection("wallet_address_with_ordinals")
```

## 📍 **Expected Flow**

### **✅ Successful Authentication:**
```
1. User clicks "Connect BSV Wallet"
2. Glass modal appears
3. Available wallets detected
4. User clicks wallet (Yours/HandCash)
5. Wallet modal opens automatically
6. User signs message in wallet
7. Modal closes
8. "Connected" state shows
9. ORDINAL RAINBOWS detected
10. Dashboard loads
```

### **🔍 Debug Outputs:**
```
[INIT] 🔗 Setting up BSV Wallet SDK event handlers...
[INIT] 🎉 Wallet authenticated via SDK: {address: "1abc...", wallet: "yours"}
[INIT] ✅ Wallet manager updated with SDK authentication
[INIT] 🌈 ORDINAL RAINBOWS detected! Loading rewards dashboard...
```

## 🎯 **Next Steps**

### **If Everything Works:**
1. ✅ Test with real wallets
2. ✅ Test with ORDINAL RAINBOWS addresses
3. ✅ Deploy to production
4. ✅ Add more wallet types as needed

### **If Issues Persist:**
1. 🔍 Check browser console for errors
2. 🔍 Test with different wallets
3. 🔍 Verify ORDINAL RAINBOWS inscription IDs
4. 🔍 Test on different browsers

## 📞 **Support Information**

**Files to Check:**
- [index.html](index.html) - Main page with wallet UI
- [js/bsv-wallet-sdk.js](js/bsv-wallet-sdk.js) - Wallet connection logic
- [js/bsv-auth-fixed.js](js/bsv-auth-fixed.js) - Authentication system
- [js/rewards-integration.js](js/rewards-integration.js) - Core rewards system

**Key Configuration:**
- All ordinals inscription IDs are hardcoded
- 1Sat Ordinals API integration for detection
- Glass morphism UI with responsive design
- Multi-wallet SDK support

---

**🌈 ORDINAL RAINBOWS Vol. 1 - Ready for Launch!** 🚀