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
        rpc: string | undefined;
    };
    celo: {
        caip2: string;
        chainId: number;
        rpc: string | undefined;
    };
    hedera: {
        network: string;
        rpc: string | undefined;
    };
    polkadot: {
        nodeUrl: string | undefined;
    };
};
export declare const MainnetConfigs: {
    base: {
        caip2: string;
        chainId: number;
        rpc: string | undefined;
    };
    celo: {
        caip2: string;
        chainId: number;
        rpc: string | undefined;
    };
    hedera: {
        network: string;
        rpc: string | undefined;
    };
    polkadot: {
        nodeUrl: string | undefined;
    };
};
export declare const getChainConfig: (chain: BlockchainNetwork) => {
    caip2: string;
    chainId: number;
    rpc: string | undefined;
} | {
    network: string;
    rpc: string | undefined;
} | {
    nodeUrl: string | undefined;
};
//# sourceMappingURL=blockchain.d.ts.map