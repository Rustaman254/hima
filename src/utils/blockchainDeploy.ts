import { BlockchainNetwork, getChainConfig } from '../configs/blockchain';
import { deployWalletOnEVM } from './privyUtil';
import { Client, AccountId, PrivateKey, TransferTransaction } from '@hashgraph/sdk';
import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';

type DeploymentResult = { [chain in BlockchainNetwork]?: string | undefined };

export async function deployWalletOnNetworks(
  walletId: string,
  walletAddress: string,
  polkadotMnemonic: string,
  chains: BlockchainNetwork[]
): Promise<DeploymentResult> {
  const results: DeploymentResult = {};

  for (const chain of chains) {
    try {
      const config = getChainConfig(chain);
      if (!config) throw new Error('Unsupported blockchain network');

      switch (chain) {
        case BlockchainNetwork.BASE:
        case BlockchainNetwork.CELO: {
          const { caip2, chainId } = config as { caip2: string; chainId: number; rpc?: string };
          if (!caip2 || !chainId) throw new Error('Missing EVM config');
          results[chain] = await deployWalletOnEVM(walletId, walletAddress, caip2, chainId);
          break;
        }
        case BlockchainNetwork.HEDERA: {
          const { network } = config as { network: string; rpc?: string };
          if (!network) throw new Error('Missing Hedera config');
          const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID!);
          const operatorKey = PrivateKey.fromString(process.env.HEDERA_OPERATOR_KEY!);
          const client = Client.forName(network).setOperator(operatorId, operatorKey);
          const tx = new TransferTransaction().addHbarTransfer(operatorId, -1).addHbarTransfer(walletAddress, 1);
          const txResponse = await tx.execute(client);
          const receipt = await txResponse.getReceipt(client);
          results[chain] = receipt.status.toString();
          break;
        }
        case BlockchainNetwork.POLKADOT: {
          const { nodeUrl } = config as { nodeUrl?: string };
          if (!nodeUrl) throw new Error('Missing Polkadot nodeUrl');
          const provider = new WsProvider(nodeUrl);
          if (provider.ttl === undefined) {
            // @ts-expect-error
            provider.ttl = null;
          }
          const api = await ApiPromise.create({ provider: provider as any });
          const transferCall = api.tx.balances?.transfer;
          if (!transferCall) throw new Error('Polkadot API balances pallet missing');
          const keyring = new Keyring({ type: 'sr25519' });
          const sender = keyring.addFromUri(polkadotMnemonic);
          const transfer = transferCall(walletAddress, 1);
          const hash = await transfer.signAndSend(sender);
          await api.disconnect();
          results[chain] = hash.toString();
          break;
        }
        default:
          throw new Error('Blockchain not yet supported');
      }
    } catch (error) {
      results[chain] = `Error: ${(error instanceof Error ? error.message : error)}`;
    }
  }
  return results;
}
