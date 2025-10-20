import { PrivyClient } from '@privy-io/node';
export declare const privy: PrivyClient;
/**
 * Create Ethereum wallet via Privy
 */
export declare function createPrivyWallet(phone: string): Promise<{
    address: string;
    walletId: string;
}>;
/**
 * Create Polkadot wallet
 */
export declare function createPolkadotWallet(): Promise<{
    address: string;
    mnemonic: string;
}>;
/**
 * Create permissionless smart wallet using Kernel account abstraction
 * @param walletId - Privy wallet ID
 * @param evmAddress - EVM address from Privy wallet
 * @returns Smart wallet address
 */
export declare function createSmartWallet(walletId: string, evmAddress: string): Promise<string>;
/**
 * Deploy wallet on EVM chain via Privy
 */
export declare function deployWalletOnEVM(walletId: string, to: string, caip2: string, chainId: number): Promise<string>;
//# sourceMappingURL=privyUtil.d.ts.map