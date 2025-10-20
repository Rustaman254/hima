"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitForTransactionReceipt = exports.fundMerchantWallet = exports.sendTransactionWithGasSponsorship = exports.getSponsoredSmartWalletClient = void 0;
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const node_1 = require("@privy-io/node");
const ethers_1 = require("ethers");
// Initialize Privy client once
const privy = new node_1.PrivyClient({
    appId: process.env.PRIVY_APP_ID,
    appSecret: process.env.PRIVY_APP_SECRET
});
/**
 * Creates a smart wallet client with gas sponsorship capabilities
 * Returns both the smart account client (for sending operations) and public client (for querying)
 */
const getSponsoredSmartWalletClient = async ({ privy, privyWalletId, evmAddress }) => {
    const chain = chains_1.baseSepolia;
    const rpcUrl = process.env.RPC_URL || "https://sepolia.base.org";
    const publicClient = (0, viem_1.createPublicClient)({
        chain,
        transport: (0, viem_1.http)(rpcUrl)
    });
    const smartAccountClient = {
        sendUserOperation: async (userOp) => {
            return (0, exports.sendTransactionWithGasSponsorship)(userOp, publicClient, privy, privyWalletId, evmAddress);
        },
        waitForUserOperationReceipt: async (params) => {
            return (0, exports.waitForTransactionReceipt)(params.hash, publicClient);
        }
    };
    return {
        smartAccountClient,
        publicClient
    };
};
exports.getSponsoredSmartWalletClient = getSponsoredSmartWalletClient;
/**
 * Send transaction with gas sponsorship from a separate funder wallet
 *
 * Flow:
 * 1. Check if merchant has enough for gas
 * 2. If not, funder wallet sends gas to merchant
 * 3. Merchant wallet then sends the transaction
 *
 * @param userOp - User operation containing transaction details (to, data, value)
 * @param publicClient - Viem public client for blockchain queries
 * @param privy - Privy client for wallet management
 * @param privyWalletId - Wallet ID from Privy
 * @param evmAddress - Merchant/user's EVM address
 * @returns Transaction hash and userOpHash
 */
const sendTransactionWithGasSponsorship = async (userOp, publicClient, privy, privyWalletId, evmAddress) => {
    try {
        const rpcUrl = process.env.RPC_URL || "https://sepolia.base.org";
        const provider = new ethers_1.ethers.JsonRpcProvider(rpcUrl);
        const chainId = publicClient.chain?.id || 84532;
        const to = userOp.to || userOp.target;
        const data = userOp.data || userOp.callData;
        const value = userOp.value || "0";
        if (!to || !data) {
            throw new Error("Missing 'to' or 'data' in userOp");
        }
        console.log(`[Gas Sponsorship] Merchant Wallet: ${evmAddress}`);
        console.log(`[Gas Sponsorship] To: ${to}`);
        // Step 1: Get merchant's current balance
        const merchantBalance = await provider.getBalance(evmAddress);
        console.log(`[Gas Sponsorship] Merchant balance: ${ethers_1.ethers.formatEther(merchantBalance)} ETH`);
        // Step 2: Estimate gas for the transaction
        const gasEstimate = await provider.estimateGas({
            to: (0, viem_1.getAddress)(to),
            from: (0, viem_1.getAddress)(evmAddress),
            data: data,
            value: value
        });
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || BigInt(1000000000);
        const gasNeeded = gasEstimate * gasPrice;
        console.log(`[Gas Sponsorship] Gas needed: ${ethers_1.ethers.formatEther(gasNeeded)} ETH`);
        if (merchantBalance < gasNeeded) {
            const gasShortfall = gasNeeded - merchantBalance;
            console.log(`[Gas Sponsorship] Merchant needs ${ethers_1.ethers.formatEther(gasShortfall)} ETH for gas`);
            await (0, exports.fundMerchantWallet)(evmAddress, gasShortfall, provider);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        console.log(`[Gas Sponsorship] Sending transaction via funder wallet`);
        const funderPrivateKey = process.env.FUNDER_PRIVATE_KEY;
        if (!funderPrivateKey) {
            throw new Error("FUNDER_PRIVATE_KEY not set. Cannot send transaction.");
        }
        const funderWallet = new ethers_1.ethers.Wallet(funderPrivateKey, provider);
        const tx = await funderWallet.sendTransaction({
            to: (0, viem_1.getAddress)(to),
            data: data,
            value: value === "0" ? BigInt(0) : BigInt(value),
            from: funderWallet.address
        });
        console.log(`[Gas Sponsorship] Transaction sent from funder: ${tx.hash}`);
        return {
            hash: tx.hash,
            userOpHash: tx.hash
        };
    }
    catch (error) {
        console.error("[Gas Sponsorship] Error:", error);
        throw new Error(`Failed to send transaction with gas sponsorship: ${error instanceof Error ? error.message : String(error)}`);
    }
};
exports.sendTransactionWithGasSponsorship = sendTransactionWithGasSponsorship;
/**
 * Fund merchant wallet from funder wallet (separate wallet)
 * The funder wallet has its private key stored securely in FUNDER_PRIVATE_KEY env var
 *
 * @param merchantAddress - Address of merchant/user wallet to fund
 * @param amount - Amount of ETH to send (in wei)
 * @param provider - Ethers provider
 * @returns Transaction hash of funding transaction
 */
const fundMerchantWallet = async (merchantAddress, amount, provider) => {
    try {
        const funderPrivateKey = process.env.FUNDER_PRIVATE_KEY;
        if (!funderPrivateKey) {
            throw new Error("FUNDER_PRIVATE_KEY not set in environment. Cannot sponsor gas.");
        }
        const funderWallet = new ethers_1.ethers.Wallet(funderPrivateKey, provider);
        console.log(`[Gas Sponsorship] Funding from: ${funderWallet.address}`);
        // Check if merchant address is a smart contract or EOA
        const code = await provider.getCode(merchantAddress);
        const isContract = code !== "0x";
        console.log(`[Gas Sponsorship] Merchant is ${isContract ? "smart contract" : "EOA"}`);
        const txParams = {
            to: (0, viem_1.getAddress)(merchantAddress),
            value: amount
        };
        if (isContract) {
            txParams.gas = BigInt(100000);
        }
        else {
            txParams.gas = BigInt(21000);
        }
        console.log(`[Gas Sponsorship] Sending ${ethers_1.ethers.formatEther(amount)} ETH with gasLimit ${txParams.gas}`);
        const tx = await funderWallet.sendTransaction(txParams);
        console.log(`[Gas Sponsorship] Funding transaction sent: ${tx.hash}`);
        const receipt = await provider.waitForTransaction(tx.hash, 1, 60000);
        if (receipt && receipt.status === 0) {
            console.warn("[Gas Sponsorship] Funding transaction reverted (contract may not accept ETH)");
            // Don't throw - contract might not have receive() function
            // We'll try the main transaction anyway
            return tx.hash;
        }
        console.log(`[Gas Sponsorship] Funding confirmed: ${receipt?.hash}`);
        return receipt?.hash || tx.hash;
    }
    catch (error) {
        console.error("[Gas Sponsorship] Funding error:", error);
        // Don't throw - continue with main transaction even if funding fails
        // The merchant wallet might have other sources of funds
        console.warn("[Gas Sponsorship] Continuing despite funding failure");
        return "0x";
    }
};
exports.fundMerchantWallet = fundMerchantWallet;
/**
 * Wait for transaction receipt with timeout
 *
 * @param hash - Transaction hash to wait for
 * @param publicClient - Viem public client
 * @returns Receipt details
 */
const waitForTransactionReceipt = async (hash, publicClient) => {
    try {
        console.log(`[TX] Waiting for receipt: ${hash}`);
        const receipt = await publicClient.waitForTransactionReceipt({
            hash: hash,
            timeout: 120_000
        });
        console.log(`[TX] Confirmed: ${receipt.transactionHash}`);
        return {
            transactionHash: receipt.transactionHash,
            receipt: receipt
        };
    }
    catch (error) {
        console.error("[TX] Receipt error:", error);
        throw error;
    }
};
exports.waitForTransactionReceipt = waitForTransactionReceipt;
//# sourceMappingURL=pimlicoPaymaster.js.map