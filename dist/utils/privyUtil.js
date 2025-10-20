"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.privy = void 0;
exports.createPrivyWallet = createPrivyWallet;
exports.createPolkadotWallet = createPolkadotWallet;
exports.createSmartWallet = createSmartWallet;
exports.deployWalletOnEVM = deployWalletOnEVM;
const node_1 = require("@privy-io/node");
const viem_1 = require("@privy-io/node/viem");
const viem_2 = require("viem");
const accounts_1 = require("permissionless/accounts");
const chains_1 = require("viem/chains");
const account_abstraction_1 = require("viem/account-abstraction");
const keyring_1 = require("@polkadot/keyring");
const util_crypto_1 = require("@polkadot/util-crypto");
exports.privy = new node_1.PrivyClient({
    appId: process.env.PRIVY_APP_ID || '',
    appSecret: process.env.PRIVY_APP_SECRET || '',
});
/**
 * Create Ethereum wallet via Privy
 */
async function createPrivyWallet(phone) {
    try {
        const createdWallet = await exports.privy.wallets().create({ chain_type: 'ethereum' });
        return {
            address: createdWallet.address,
            walletId: createdWallet.id,
        };
    }
    catch (error) {
        if (error instanceof node_1.APIError) {
            throw new Error(`Privy API Error [${error.status}]: ${error.name}`);
        }
        else if (error instanceof node_1.PrivyAPIError) {
            throw new Error(`Privy SDK Error: ${error.message}`);
        }
        else {
            throw error;
        }
    }
}
/**
 * Create Polkadot wallet
 */
async function createPolkadotWallet() {
    await (0, util_crypto_1.cryptoWaitReady)();
    const mnemonic = (0, util_crypto_1.mnemonicGenerate)();
    const keyring = new keyring_1.Keyring({ type: 'sr25519' });
    const pair = keyring.addFromUri(mnemonic);
    return {
        address: pair.address,
        mnemonic
    };
}
/**
 * Create permissionless smart wallet using Kernel account abstraction
 * @param walletId - Privy wallet ID
 * @param evmAddress - EVM address from Privy wallet
 * @returns Smart wallet address
 */
async function createSmartWallet(walletId, evmAddress) {
    try {
        // Create Viem account from Privy wallet
        const userViemAccount = await (0, viem_1.createViemAccount)(exports.privy, {
            walletId,
            address: evmAddress
        });
        // Create public client for Base Sepolia
        const publicClient = (0, viem_2.createPublicClient)({
            chain: chains_1.baseSepolia,
            transport: (0, viem_2.http)(process.env.RPC_URL || 'https://sepolia.base.org')
        });
        // Create Kernel smart account with Privy account as owner
        const smartAccount = await (0, accounts_1.toKernelSmartAccount)({
            client: publicClient,
            entryPoint: { address: account_abstraction_1.entryPoint07Address, version: '0.7' },
            owners: [userViemAccount]
        });
        console.log(`[Smart Wallet] Created smart wallet: ${smartAccount.address}`);
        return smartAccount.address;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Smart Wallet] Error creating smart wallet: ${errorMessage}`);
        throw new Error(`Failed to create smart wallet: ${errorMessage}`);
    }
}
/**
 * Deploy wallet on EVM chain via Privy
 */
async function deployWalletOnEVM(walletId, to, caip2, chainId) {
    const txResult = await exports.privy.wallets().ethereum().sendTransaction(walletId, {
        caip2,
        params: {
            transaction: {
                to,
                value: "0x0",
                chain_id: chainId,
            },
        },
    });
    return txResult.hash;
}
//# sourceMappingURL=privyUtil.js.map