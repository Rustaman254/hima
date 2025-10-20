import { type PublicClient } from "viem";
import { PrivyClient } from "@privy-io/node";
import { ethers } from "ethers";
interface GetSponsoredSmartWalletClientParams {
    privy: PrivyClient;
    privyWalletId: string;
    evmAddress: string;
}
interface SmartWalletClientResult {
    smartAccountClient: any;
    publicClient: PublicClient;
}
/**
 * Creates a smart wallet client with gas sponsorship capabilities
 * Returns both the smart account client (for sending operations) and public client (for querying)
 */
export declare const getSponsoredSmartWalletClient: ({ privy, privyWalletId, evmAddress }: GetSponsoredSmartWalletClientParams) => Promise<SmartWalletClientResult>;
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
export declare const sendTransactionWithGasSponsorship: (userOp: any, publicClient: PublicClient, privy: PrivyClient, privyWalletId: string, evmAddress: string) => Promise<any>;
/**
 * Fund merchant wallet from funder wallet (separate wallet)
 * The funder wallet has its private key stored securely in FUNDER_PRIVATE_KEY env var
 *
 * @param merchantAddress - Address of merchant/user wallet to fund
 * @param amount - Amount of ETH to send (in wei)
 * @param provider - Ethers provider
 * @returns Transaction hash of funding transaction
 */
export declare const fundMerchantWallet: (merchantAddress: string, amount: bigint, provider: ethers.JsonRpcProvider) => Promise<string>;
/**
 * Wait for transaction receipt with timeout
 *
 * @param hash - Transaction hash to wait for
 * @param publicClient - Viem public client
 * @returns Receipt details
 */
export declare const waitForTransactionReceipt: (hash: string, publicClient: PublicClient) => Promise<any>;
export {};
//# sourceMappingURL=pimlicoPaymaster.d.ts.map