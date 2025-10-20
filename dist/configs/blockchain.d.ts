export declare enum BlockchainNetwork {
    BASE = "base",
    CELO = "celo",
    HEDERA = "hedera",
    POLKADOT = "polkadot"
}
export declare const TestnetConfigs: {
    base: {
        caip2: string;
        chainId: number;
        rpc: string;
    };
    celo: {
        caip2: string;
        chainId: number;
        rpc: string;
    };
    hedera: {
        network: string;
        rpc: string;
    };
    polkadot: {
        nodeUrl: string;
    };
};
export declare const MainnetConfigs: {
    base: {
        caip2: string;
        chainId: number;
        rpc: string;
    };
    celo: {
        caip2: string;
        chainId: number;
        rpc: string;
    };
    hedera: {
        network: string;
        rpc: string;
    };
    polkadot: {
        nodeUrl: string;
    };
};
export declare const getChainConfig: (chain: BlockchainNetwork) => {
    caip2: string;
    chainId: number;
    rpc: string;
} | {
    network: string;
    rpc: string;
} | {
    nodeUrl: string;
};
//# sourceMappingURL=blockchain.d.ts.map