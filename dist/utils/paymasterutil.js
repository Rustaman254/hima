"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitForTransactionReceipt = exports.fundMerchantWallet = exports.fundUserWallet = exports.sendTransactionWithGasSponsorship = exports.getSponsoredSmartWalletClient = void 0;
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const ethers_1 = require("ethers");
const blockchain_1 = require("../configs/blockchain");
/**
 * Creates a smart wallet client with gas sponsorship capabilities for specific chain
 * Returns both the smart account client (for sending operations) and public client (for querying)
 */
const getSponsoredSmartWalletClient = async ({ privy, privyWalletId, evmAddress, chain = blockchain_1.BlockchainNetwork.BASE }) => {
    const config = (0, blockchain_1.getChainConfig)(chain);
    if (!config || !('rpc' in config)) {
        throw new Error(`No RPC URL for chain ${chain}`);
    }
    const rpcUrl = config.rpc;
    if (!rpcUrl) {
        throw new Error(`RPC URL not configured for chain ${chain}`);
    }
    // Map BlockchainNetwork to viem chain
    const viemChain = chain === blockchain_1.BlockchainNetwork.BASE ? chains_1.baseSepolia : chains_1.celo;
    const publicClient = (0, viem_1.createPublicClient)({
        chain: viemChain,
        transport: (0, viem_1.http)(rpcUrl)
    });
    const smartAccountClient = {
        sendUserOperation: async (userOp) => {
            return (0, exports.sendTransactionWithGasSponsorship)(userOp, publicClient, privy, privyWalletId, evmAddress, chain || blockchain_1.BlockchainNetwork.BASE);
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
 * Supports multiple EVM chains (BASE, CELO)
 *
 * Flow:
 * 1. Check if user has enough for gas
 * 2. If not, funder wallet sends gas to user
 * 3. Funder wallet then sends the transaction
 *
 * @param userOp - User operation containing transaction details (to, data, value)
 * @param publicClient - Viem public client for blockchain queries
 * @param privy - Privy client for wallet management
 * @param privyWalletId - Wallet ID from Privy
 * @param evmAddress - User's EVM address
 * @param chain - Blockchain network (BASE or CELO)
 * @returns Transaction hash and userOpHash
 */
const sendTransactionWithGasSponsorship = async (userOp, publicClient, privy, privyWalletId, evmAddress, chain = blockchain_1.BlockchainNetwork.BASE) => {
    try {
        const config = (0, blockchain_1.getChainConfig)(chain);
        if (!config || !('rpc' in config)) {
            throw new Error(`No RPC URL for chain ${chain}`);
        }
        const rpcUrl = config.rpc;
        if (!rpcUrl) {
            throw new Error(`RPC URL not configured for chain ${chain}`);
        }
        const provider = new ethers_1.ethers.JsonRpcProvider(rpcUrl);
        const chainConfig = config;
        const to = userOp.to || userOp.target;
        const data = userOp.data || userOp.callData;
        const value = userOp.value || "0";
        if (!to || !data) {
            throw new Error("Missing 'to' or 'data' in userOp");
        }
        console.log(`[Gas Sponsorship] Chain: ${chain}`);
        console.log(`[Gas Sponsorship] User Wallet: ${evmAddress}`);
        console.log(`[Gas Sponsorship] To: ${to}`);
        // Step 1: Get user's current balance
        const userBalance = await provider.getBalance(evmAddress);
        console.log(`[Gas Sponsorship] User balance: ${ethers_1.ethers.formatEther(userBalance)} ETH`);
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
        // Step 3: Check if user needs gas funding
        if (userBalance < gasNeeded) {
            const gasShortfall = gasNeeded - userBalance;
            console.log(`[Gas Sponsorship] User needs ${ethers_1.ethers.formatEther(gasShortfall)} ETH for gas`);
            // Fund user from funder wallet
            await (0, exports.fundUserWallet)(evmAddress, gasShortfall, provider, chain);
            // Wait for the funding to settle
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        // Step 4: Send transaction via funder wallet
        console.log(`[Gas Sponsorship] Sending transaction via funder wallet on ${chain}`);
        const funderPrivateKey = process.env.PAYMASTER_WALLET_PRIVATE_KEY;
        if (!funderPrivateKey) {
            throw new Error("PAYMASTER_WALLET_PRIVATE_KEY not set. Cannot send transaction.");
        }
        const funderWallet = new ethers_1.ethers.Wallet(funderPrivateKey, provider);
        const tx = await funderWallet.sendTransaction({
            to: (0, viem_1.getAddress)(to),
            data: data,
            value: value === "0" ? BigInt(0) : BigInt(value),
            from: funderWallet.address
        });
        console.log(`[Gas Sponsorship] Transaction sent from funder on ${chain}: ${tx.hash}`);
        return {
            hash: tx.hash,
            userOpHash: tx.hash
        };
    }
    catch (error) {
        console.error("[Gas Sponsorship] Error:", error);
        throw new Error(`Failed to send transaction with gas sponsorship on ${chain}: ${error instanceof Error ? error.message : String(error)}`);
    }
};
exports.sendTransactionWithGasSponsorship = sendTransactionWithGasSponsorship;
/**
 * Fund user wallet from funder wallet (separate wallet)
 * The funder wallet has its private key stored securely in PAYMASTER_WALLET_PRIVATE_KEY env var
 *
 * @param userAddress - Address of user/merchant wallet to fund
 * @param amount - Amount of ETH to send (in wei)
 * @param provider - Ethers provider
 * @param chain - Blockchain network
 * @returns Transaction hash of funding transaction
 */
const fundUserWallet = async (userAddress, amount, provider, chain = blockchain_1.BlockchainNetwork.BASE) => {
    try {
        const funderPrivateKey = process.env.PAYMASTER_WALLET_PRIVATE_KEY;
        if (!funderPrivateKey) {
            throw new Error("PAYMASTER_WALLET_PRIVATE_KEY not set in environment. Cannot sponsor gas.");
        }
        const funderWallet = new ethers_1.ethers.Wallet(funderPrivateKey, provider);
        console.log(`[Gas Sponsorship] Funding from: ${funderWallet.address} on ${chain}`);
        // Check if user address is a smart contract or EOA
        const code = await provider.getCode(userAddress);
        const isContract = code !== "0x";
        console.log(`[Gas Sponsorship] User address is ${isContract ? "smart contract" : "EOA"}`);
        // Prepare transaction parameters
        const txParams = {
            to: (0, viem_1.getAddress)(userAddress),
            value: amount
        };
        // For contracts, need more gas; for EOAs, standard 21000 gas
        if (isContract) {
            txParams.gasLimit = BigInt(100000);
        }
        else {
            txParams.gasLimit = BigInt(21000);
        }
        console.log(`[Gas Sponsorship] Sending ${ethers_1.ethers.formatEther(amount)} ETH with gasLimit ${txParams.gasLimit}`);
        const tx = await funderWallet.sendTransaction(txParams);
        console.log(`[Gas Sponsorship] Funding transaction sent: ${tx.hash}`);
        // Wait for confirmation (but don't fail if it reverts)
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
        // The user wallet might have other sources of funds
        console.warn("[Gas Sponsorship] Continuing despite funding failure");
        return "0x";
    }
};
exports.fundUserWallet = fundUserWallet;
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
    return (0, exports.fundUserWallet)(merchantAddress, amount, provider);
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
//# sourceMappingURL=paymasterutil.js.map