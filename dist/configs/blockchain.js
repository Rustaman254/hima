export var BlockchainNetwork;
(function (BlockchainNetwork) {
    BlockchainNetwork["BASE"] = "base";
    BlockchainNetwork["CELO"] = "celo";
    BlockchainNetwork["HEDERA"] = "hedera";
    BlockchainNetwork["POLKADOT"] = "polkadot";
})(BlockchainNetwork || (BlockchainNetwork = {}));
export const TestnetConfigs = {
    [BlockchainNetwork.BASE]: { caip2: 'eip155:84532', chainId: 84532, rpc: process.env.BASE_TESTNET_RPC },
    [BlockchainNetwork.CELO]: { caip2: 'eip155:44787', chainId: 44787, rpc: process.env.CELO_TESTNET_RPC },
    [BlockchainNetwork.HEDERA]: { network: 'testnet', rpc: process.env.HEDERA_TESTNET_RPC },
    [BlockchainNetwork.POLKADOT]: { nodeUrl: process.env.POLKADOT_TESTNET_RPC }
};
export const MainnetConfigs = {
    [BlockchainNetwork.BASE]: { caip2: 'eip155:8453', chainId: 8453, rpc: process.env.BASE_MAINNET_RPC },
    [BlockchainNetwork.CELO]: { caip2: 'eip155:42220', chainId: 42220, rpc: process.env.CELO_MAINNET_RPC },
    [BlockchainNetwork.HEDERA]: { network: 'mainnet', rpc: process.env.HEDERA_MAINNET_RPC },
    [BlockchainNetwork.POLKADOT]: { nodeUrl: process.env.POLKADOT_MAINNET_RPC }
};
export const getChainConfig = (chain) => {
    if (process.env.DEPLOY_MAINNET === 'true') {
        return MainnetConfigs[chain];
    }
    return TestnetConfigs[chain];
};
//# sourceMappingURL=blockchain.js.map