import { PrivyClient, APIError, PrivyAPIError } from '@privy-io/node';
import { createViemAccount } from '@privy-io/node/viem';
import { createPublicClient, http } from "viem";
import { toKernelSmartAccount } from "permissionless/accounts";
import { baseSepolia } from "viem/chains";
import { entryPoint07Address } from "viem/account-abstraction";
import { Keyring } from '@polkadot/keyring';
import { mnemonicGenerate, cryptoWaitReady } from '@polkadot/util-crypto';

export const privy = new PrivyClient({
  appId: process.env.PRIVY_APP_ID || '',
  appSecret: process.env.PRIVY_APP_SECRET || '',
});

/**
 * Create Ethereum wallet via Privy
 */
export async function createPrivyWallet(phone: string): Promise<{ address: string, walletId: string }> {
  try {
    const createdWallet = await privy.wallets().create({ chain_type: 'ethereum' });
    return {
      address: createdWallet.address,
      walletId: createdWallet.id,
    };
  } catch (error) {
    if (error instanceof APIError) {
      throw new Error(`Privy API Error [${error.status}]: ${error.name}`);
    } else if (error instanceof PrivyAPIError) {
      throw new Error(`Privy SDK Error: ${error.message}`);
    } else {
      throw error;
    }
  }
}

/**
 * Create Polkadot wallet
 */
export async function createPolkadotWallet(): Promise<{ address: string; mnemonic: string }> {
  await cryptoWaitReady();

  const mnemonic = mnemonicGenerate();
  const keyring = new Keyring({ type: 'sr25519' });
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
export async function createSmartWallet(
  walletId: string,
  evmAddress: string
): Promise<string> {
  try {
    // Create Viem account from Privy wallet
    const userViemAccount = await createViemAccount(privy, {
      walletId,
      address: evmAddress as `0x${string}`
    });

    // Create public client for Base Sepolia
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.RPC_URL || 'https://sepolia.base.org')
    });

    // Create Kernel smart account with Privy account as owner
    const smartAccount = await toKernelSmartAccount({
      client: publicClient,
      entryPoint: { address: entryPoint07Address, version: '0.7' },
      owners: [userViemAccount]
    });

    console.log(`[Smart Wallet] Created smart wallet: ${smartAccount.address}`);
    return smartAccount.address;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Smart Wallet] Error creating smart wallet: ${errorMessage}`);
    throw new Error(`Failed to create smart wallet: ${errorMessage}`);
  }
}

/**
 * Deploy wallet on EVM chain via Privy
 */
export async function deployWalletOnEVM(
  walletId: string,
  to: string,
  caip2: string,
  chainId: number
): Promise<string> {
  const txResult = await privy.wallets().ethereum().sendTransaction(walletId, {
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