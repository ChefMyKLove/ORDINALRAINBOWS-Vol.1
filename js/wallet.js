// Shared Yours Wallet helpers on window.CWI (BRC-100). Current Yours no longer injects window.yours.
// Each 1sat sits on its own derived key; the wallet keeps that key's derivation in the output's customInstructions.
(function () {
    var BASKET = '1sat';

    function cwi() {
        if (!window.CWI) throw new Error('Yours wallet not found. Install the Yours Wallet extension, unlock it, then reload this page.');
        return window.CWI;
    }

    // BRC-100 outpoints are "txid.vout"; 1sat origins are "txid_vout".
    function toUnderscore(outpoint) {
        return String(outpoint || '').replace('.', '_');
    }

    // Every 1sat output in the wallet: { outpoint, origin, derivation: {protocolID, keyID, counterparty} | null }
    async function listOrdinals() {
        var all = [];
        for (var offset = 0; ; ) {
            var r = await cwi().listOutputs({ basket: BASKET, includeTags: true, includeCustomInstructions: true, limit: 100, offset: offset });
            var outs = (r && r.outputs) || [];
            all = all.concat(outs);
            offset += outs.length;
            if (!outs.length || offset >= r.totalOutputs) break;
        }
        return all.map(function (o) {
            var tag = (o.tags || []).find(function (t) { return t.indexOf('origin:') === 0; });
            var derivation = null;
            try { derivation = JSON.parse(o.customInstructions); } catch (e) { /* missing or still encrypted */ }
            return { outpoint: toUnderscore(o.outpoint), origin: toUnderscore(tag ? tag.slice(7) : o.outpoint), derivation: derivation };
        });
    }

    // Signs message with the key that locks one 1sat. Returns { pubKey, sig } (sig = DER hex).
    async function signWith(derivation, message) {
        if (!derivation || !derivation.protocolID || !derivation.keyID) throw new Error('Wallet did not share the key details for this piece.');
        var args = { protocolID: derivation.protocolID, keyID: derivation.keyID, counterparty: derivation.counterparty || 'self' };
        var signed = await cwi().createSignature(Object.assign({ data: Array.from(new TextEncoder().encode(message)) }, args));
        var pub = await cwi().getPublicKey(Object.assign({ forSelf: true }, args));
        var hex = signed.signature.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        return { pubKey: pub.publicKey, sig: hex };
    }

    // Public key of the wallet's first deposit address (what Yours derives and syncs for receiving).
    async function getReceivePubKey() {
        var r = await cwi().getPublicKey({ protocolID: [0, 'onesat'], keyID: '1sat 0', forSelf: true });
        return r.publicKey;
    }

    window.ORWallet = {
        available: function () { return !!window.CWI; },
        listOrdinals: listOrdinals,
        signWith: signWith,
        getReceivePubKey: getReceivePubKey
    };
})();
