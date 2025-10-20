"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deployWalletOnNetworks = deployWalletOnNetworks;
const blockchain_1 = require("../configs/blockchain");
const paymasterutil_1 = require("../utils/paymasterutil");
const sdk_1 = require("@hashgraph/sdk");
const api_1 = require("@polkadot/api");
const node_1 = require("@privy-io/node");
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
// Initialize Privy client
const privy = new node_1.PrivyClient({
    appId: process.env.PRIVY_APP_ID,
    appSecret: process.env.PRIVY_APP_SECRET
});
async function deployWalletOnNetworks(walletId, walletAddress, polkadotMnemonic, chains, buildUserOp, sendSponsoredOp) {
    const results = {};
    for (const chain of chains) {
        try {
            const config = (0, blockchain_1.getChainConfig)(chain);
            if (!config)
                throw new Error('Unsupported blockchain network');
            switch (chain) {
                case blockchain_1.BlockchainNetwork.BASE:
                case blockchain_1.BlockchainNetwork.CELO: {
                    const { caip2, chainId, rpc } = config;
                    if (!caip2 || !chainId || !rpc)
                        throw new Error('Missing EVM config');
                    console.log(`[Deployment] Deploying to ${chain}...`);
                    const userOp = await buildUserOp(walletAddress, chain);
                    const viemChain = chain === blockchain_1.BlockchainNetwork.BASE ? chains_1.baseSepolia : chains_1.celo;
                    const publicClient = (0, viem_1.createPublicClient)({
                        chain: viemChain,
                        transport: (0, viem_1.http)(rpc)
                    });
                    const txHash = await (0, paymasterutil_1.sendTransactionWithGasSponsorship)(userOp, publicClient, privy, walletId, walletAddress, chain);
                    if (!txHash)
                        throw new Error('Failed to get transaction hash');
                    results[chain] = txHash;
                    console.log(`[Deployment] ${chain} deployment successful: ${txHash}`);
                    break;
                }
                case blockchain_1.BlockchainNetwork.HEDERA: {
                    const { network } = config;
                    if (!network)
                        throw new Error('Missing Hedera config');
                    console.log(`[Deployment] Deploying to Hedera ${network}...`);
                    const operatorId = sdk_1.AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
                    const operatorKey = sdk_1.PrivateKey.fromString(process.env.HEDERA_OPERATOR_KEY);
                    const client = sdk_1.Client.forName(network).setOperator(operatorId, operatorKey);
                    const tx = new sdk_1.TransferTransaction()
                        .addHbarTransfer(operatorId, -1)
                        .addHbarTransfer(walletAddress, 1);
                    const txResponse = await tx.execute(client);
                    const receipt = await txResponse.getReceipt(client);
                    results[chain] = receipt.status.toString();
                    console.log(`[Deployment] Hedera deployment successful: ${receipt.status.toString()}`);
                    break;
                }
                case blockchain_1.BlockchainNetwork.POLKADOT: {
                    const { nodeUrl } = config;
                    if (!nodeUrl)
                        throw new Error('Missing Polkadot nodeUrl');
                    console.log(`[Deployment] Deploying to Polkadot...`);
                    const provider = new api_1.WsProvider(nodeUrl);
                    if (provider.ttl === undefined) {
                        // @ts-expect-error
                        provider.ttl = null;
                    }
                    const api = await api_1.ApiPromise.create({ provider: provider });
                    const transferCall = api.tx.balances?.transfer;
                    if (!transferCall)
                        throw new Error('Polkadot API balances pallet missing');
                    const keyring = new api_1.Keyring({ type: 'sr25519' });
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
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[Deployment] Error on ${chain}:`, errorMsg);
            results[chain] = `Error: ${errorMsg}`;
        }
    }
    return results;
}
//# sourceMappingURL=blockchainDeploy.js.map