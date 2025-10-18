import { createPublicClient, http, type PublicClient, getAddress } from "viem";
import { baseSepolia, celo } from "viem/chains";
import { PrivyClient } from "@privy-io/node";
import { ethers } from "ethers";
import { BlockchainNetwork, getChainConfig } from "../configs/blockchain";

interface GetSponsoredSmartWalletClientParams {
  privy: PrivyClient;
  privyWalletId: string;
  evmAddress: string;
  chain?: BlockchainNetwork;
}

interface SmartWalletClientResult {
  smartAccountClient: any;
  publicClient: PublicClient;
}

/**
 * Creates a smart wallet client with gas sponsorship capabilities for specific chain
 * Returns both the smart account client (for sending operations) and public client (for querying)
 */
export const getSponsoredSmartWalletClient = async ({
  privy,
  privyWalletId,
  evmAddress,
  chain = BlockchainNetwork.BASE
}: GetSponsoredSmartWalletClientParams): Promise<SmartWalletClientResult> => {
  const config = getChainConfig(chain);
  if (!config || !('rpc' in config)) {
    throw new Error(`No RPC URL for chain ${chain}`);
  }

  const rpcUrl = config.rpc;
  if (!rpcUrl) {
    throw new Error(`RPC URL not configured for chain ${chain}`);
  }

  // Map BlockchainNetwork to viem chain
  const viemChain = chain === BlockchainNetwork.BASE ? baseSepolia : celo;

  const publicClient = createPublicClient({
    chain: viemChain,
    transport: http(rpcUrl)
  });

  const smartAccountClient = {
    sendUserOperation: async (userOp: any) => {
      return sendTransactionWithGasSponsorship(
        userOp,
        publicClient,
        privy,
        privyWalletId,
        evmAddress,
        chain || BlockchainNetwork.BASE
      );
    },
    waitForUserOperationReceipt: async (params: any) => {
      return waitForTransactionReceipt(params.hash, publicClient);
    }
  };

  return {
    smartAccountClient,
    publicClient
  };
};

/**
 * Send transaction with gas sponsorship from a separate funder wallet
 * Supports multiple EVM chains (BASE, CELO)
 * 
 * Flow:
 * 1. Check if user has enough for gas
 * 2. If not, funder wallet sends gas to user
 * 3. Funder wallet then sends the transaction
 * 
 * @param userOp - User operation containing transaction details (to, data, value)
 * @param publicClient - Viem public client for blockchain queries
 * @param privy - Privy client for wallet management
 * @param privyWalletId - Wallet ID from Privy
 * @param evmAddress - User's EVM address
 * @param chain - Blockchain network (BASE or CELO)
 * @returns Transaction hash and userOpHash
 */
export const sendTransactionWithGasSponsorship = async (
  userOp: any,
  publicClient: PublicClient,
  privy: PrivyClient,
  privyWalletId: string,
  evmAddress: string,
  chain: BlockchainNetwork = BlockchainNetwork.BASE
): Promise<any> => {
  try {
    const config = getChainConfig(chain);
    if (!config || !('rpc' in config)) {
      throw new Error(`No RPC URL for chain ${chain}`);
    }

    const rpcUrl = config.rpc;
    if (!rpcUrl) {
      throw new Error(`RPC URL not configured for chain ${chain}`);
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const chainConfig = config as { caip2: string; chainId: number; rpc: string };

    const to = userOp.to || userOp.target;
    const data = userOp.data || userOp.callData;
    const value = userOp.value || "0";

    if (!to || !data) {
      throw new Error("Missing 'to' or 'data' in userOp");
    }

    console.log(`[Gas Sponsorship] Chain: ${chain}`);
    console.log(`[Gas Sponsorship] User Wallet: ${evmAddress}`);
    console.log(`[Gas Sponsorship] To: ${to}`);

    // Step 1: Get user's current balance
    const userBalance = await provider.getBalance(evmAddress);
    console.log(`[Gas Sponsorship] User balance: ${ethers.formatEther(userBalance)} ETH`);

    // Step 2: Estimate gas for the transaction
    const gasEstimate = await provider.estimateGas({
      to: getAddress(to),
      from: getAddress(evmAddress),
      data: data,
      value: value
    });

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || BigInt(1000000000);
    const gasNeeded = gasEstimate * gasPrice;
    
    console.log(`[Gas Sponsorship] Gas needed: ${ethers.formatEther(gasNeeded)} ETH`);

    // Step 3: Check if user needs gas funding
    if (userBalance < gasNeeded) {
      const gasShortfall = gasNeeded - userBalance;
      console.log(`[Gas Sponsorship] User needs ${ethers.formatEther(gasShortfall)} ETH for gas`);

      // Fund user from funder wallet
      await fundUserWallet(evmAddress, gasShortfall, provider, chain);
      
      // Wait for the funding to settle
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Step 4: Send transaction via funder wallet
    console.log(`[Gas Sponsorship] Sending transaction via funder wallet on ${chain}`);

    const funderPrivateKey = process.env.PAYMASTER_WALLET_PRIVATE_KEY;
    if (!funderPrivateKey) {
      throw new Error("PAYMASTER_WALLET_PRIVATE_KEY not set. Cannot send transaction.");
    }

    const funderWallet = new ethers.Wallet(funderPrivateKey, provider);
    
    const tx = await funderWallet.sendTransaction({
      to: getAddress(to),
      data: data,
      value: value === "0" ? BigInt(0) : BigInt(value),
      from: funderWallet.address
    });

    console.log(`[Gas Sponsorship] Transaction sent from funder on ${chain}: ${tx.hash}`);

    return {
      hash: tx.hash,
      userOpHash: tx.hash
    };
  } catch (error) {
    console.error("[Gas Sponsorship] Error:", error);
    throw new Error(
      `Failed to send transaction with gas sponsorship on ${chain}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

/**
 * Fund user wallet from funder wallet (separate wallet)
 * The funder wallet has its private key stored securely in PAYMASTER_WALLET_PRIVATE_KEY env var
 * 
 * @param userAddress - Address of user/merchant wallet to fund
 * @param amount - Amount of ETH to send (in wei)
 * @param provider - Ethers provider
 * @param chain - Blockchain network
 * @returns Transaction hash of funding transaction
 */
export const fundUserWallet = async (
  userAddress: string,
  amount: bigint,
  provider: ethers.JsonRpcProvider,
  chain: BlockchainNetwork = BlockchainNetwork.BASE
): Promise<string> => {
  try {
    const funderPrivateKey = process.env.PAYMASTER_WALLET_PRIVATE_KEY;
    if (!funderPrivateKey) {
      throw new Error("PAYMASTER_WALLET_PRIVATE_KEY not set in environment. Cannot sponsor gas.");
    }

    const funderWallet = new ethers.Wallet(funderPrivateKey, provider);
    console.log(`[Gas Sponsorship] Funding from: ${funderWallet.address} on ${chain}`);

    // Check if user address is a smart contract or EOA
    const code = await provider.getCode(userAddress);
    const isContract = code !== "0x";
    console.log(`[Gas Sponsorship] User address is ${isContract ? "smart contract" : "EOA"}`);

    // Prepare transaction parameters
    const txParams: any = {
      to: getAddress(userAddress),
      value: amount
    };

    // For contracts, need more gas; for EOAs, standard 21000 gas
    if (isContract) {
      txParams.gasLimit = BigInt(100000);
    } else {
      txParams.gasLimit = BigInt(21000);
    }

    console.log(`[Gas Sponsorship] Sending ${ethers.formatEther(amount)} ETH with gasLimit ${txParams.gasLimit}`);

    const tx = await funderWallet.sendTransaction(txParams);

    console.log(`[Gas Sponsorship] Funding transaction sent: ${tx.hash}`);

    // Wait for confirmation (but don't fail if it reverts)
    const receipt = await provider.waitForTransaction(tx.hash, 1, 60000);
    
    if (receipt && receipt.status === 0) {
      console.warn("[Gas Sponsorship] Funding transaction reverted (contract may not accept ETH)");
      // Don't throw - contract might not have receive() function
      // We'll try the main transaction anyway
      return tx.hash;
    }

    console.log(`[Gas Sponsorship] Funding confirmed: ${receipt?.transactionHash}`);
    return receipt?.transactionHash || tx.hash;
  } catch (error) {
    console.error("[Gas Sponsorship] Funding error:", error);
    // Don't throw - continue with main transaction even if funding fails
    // The user wallet might have other sources of funds
    console.warn("[Gas Sponsorship] Continuing despite funding failure");
    return "0x";
  }
};

/**
 * Fund merchant wallet from funder wallet (separate wallet)
 * The funder wallet has its private key stored securely in FUNDER_PRIVATE_KEY env var
 * 
 * @param merchantAddress - Address of merchant/user wallet to fund
 * @param amount - Amount of ETH to send (in wei)
 * @param provider - Ethers provider
 * @returns Transaction hash of funding transaction
 */
export const fundMerchantWallet = async (
  merchantAddress: string,
  amount: bigint,
  provider: ethers.JsonRpcProvider
): Promise<string> => {
  return fundUserWallet(merchantAddress, amount, provider);
};

/**
 * Wait for transaction receipt with timeout
 * 
 * @param hash - Transaction hash to wait for
 * @param publicClient - Viem public client
 * @returns Receipt details
 */
export const waitForTransactionReceipt = async (
  hash: string,
  publicClient: PublicClient
): Promise<any> => {
  try {
    console.log(`[TX] Waiting for receipt: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      timeout: 120_000
    });

    console.log(`[TX] Confirmed: ${receipt.transactionHash}`);

    return {
      transactionHash: receipt.transactionHash,
      receipt: receipt
    };
  } catch (error) {
    console.error("[TX] Receipt error:", error);
    throw error;
  }
};