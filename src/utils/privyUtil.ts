import { PrivyClient, APIError, PrivyAPIError } from '@privy-io/node';
import { Keyring } from '@polkadot/keyring';
import { mnemonicGenerate, cryptoWaitReady } from '@polkadot/util-crypto';

export const privy = new PrivyClient({
  appId: process.env.PRIVY_APP_ID || '',
  appSecret: process.env.PRIVY_APP_SECRET || '',
});

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
