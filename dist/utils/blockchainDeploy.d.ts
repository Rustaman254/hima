import { BlockchainNetwork } from '../configs/blockchain';
type DeploymentResult = {
    [chain in BlockchainNetwork]?: string | undefined | object;
};
export declare function deployWalletOnNetworks(walletId: string, walletAddress: string, polkadotMnemonic: string, chains: BlockchainNetwork[], buildUserOp: (walletAddress: string, chain: BlockchainNetwork) => Promise<any>, sendSponsoredOp: (sponsoredOp: any, chain: BlockchainNetwork) => Promise<string>): Promise<DeploymentResult>;
export {};
//# sourceMappingURL=blockchainDeploy.d.ts.map