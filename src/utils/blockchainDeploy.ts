import { BlockchainNetwork, getChainConfig } from '../configs/blockchain';
import { sendTransactionWithGasSponsorship } from '../utils/paymasterutil';
import { Client, AccountId, PrivateKey, TransferTransaction } from '@hashgraph/sdk';
import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { ethers } from 'ethers';
import { PrivyClient } from '@privy-io/node';
import { createPublicClient, http } from 'viem';
import { baseSepolia, celo } from 'viem/chains';

type DeploymentResult = { [chain in BlockchainNetwork]?: string | undefined | object };

// Initialize Privy client
const privy = new PrivyClient({
  appId: process.env.PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!
});

export async function deployWalletOnNetworks(
  walletId: string,
  walletAddress: string,
  polkadotMnemonic: string,
  chains: BlockchainNetwork[],
  buildUserOp: (walletAddress: string, chain: BlockchainNetwork) => Promise<any>,
  sendSponsoredOp: (sponsoredOp: any, chain: BlockchainNetwork) => Promise<string>
): Promise<DeploymentResult> {
  const results: DeploymentResult = {};

  for (const chain of chains) {
    try {
      const config = getChainConfig(chain);
      if (!config) throw new Error('Unsupported blockchain network');

      switch (chain) {
        case BlockchainNetwork.BASE:
        case BlockchainNetwork.CELO: {
          const { caip2, chainId, rpc } = config as { caip2: string; chainId: number; rpc: string };
          if (!caip2 || !chainId || !rpc) throw new Error('Missing EVM config');

          console.log(`[Deployment] Deploying to ${chain}...`);

          // Build user operation using provided/bound SDK function
          const userOp = await buildUserOp(walletAddress, chain);

          // Get public client for the chain
          const viemChain = chain === BlockchainNetwork.BASE ? baseSepolia : celo;
          const publicClient = createPublicClient({
            chain: viemChain,
            transport: http(rpc)
          });

          // Send transaction with gas sponsorship via paymasterUtil
          const txHash = await sendTransactionWithGasSponsorship(
            userOp,
            publicClient,
            privy,
            walletId,
            walletAddress,
            chain
          );

          if (!txHash) throw new Error('Failed to get transaction hash');
          results[chain] = txHash;
          console.log(`[Deployment] ${chain} deployment successful: ${txHash}`);
          break;
        }

        case BlockchainNetwork.HEDERA: {
          const { network } = config as { network: string };
          if (!network) throw new Error('Missing Hedera config');

          console.log(`[Deployment] Deploying to Hedera ${network}...`);

          const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID!);
          const operatorKey = PrivateKey.fromString(process.env.HEDERA_OPERATOR_KEY!);
          const client = Client.forName(network).setOperator(operatorId, operatorKey);

          const tx = new TransferTransaction()
            .addHbarTransfer(operatorId, -1)
            .addHbarTransfer(walletAddress, 1);

          const txResponse = await tx.execute(client);
          const receipt = await txResponse.getReceipt(client);

          results[chain] = receipt.status.toString();
          console.log(`[Deployment] Hedera deployment successful: ${receipt.status.toString()}`);
          break;
        }

        case BlockchainNetwork.POLKADOT: {
          const { nodeUrl } = config as { nodeUrl?: string };
          if (!nodeUrl) throw new Error('Missing Polkadot nodeUrl');

          console.log(`[Deployment] Deploying to Polkadot...`);

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
          console.log(`[Deployment] Polkadot deployment successful: ${hash.toString()}`);
          break;
        }

        default:
          throw new Error('Blockchain not yet supported');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Deployment] Error on ${chain}:`, errorMsg);
      results[chain] = `Error: ${errorMsg}`;
    }
  }

  return results;
}