import { createPublicClient, http, type PublicClient, getAddress } from "viem";
import { baseSepolia } from "viem/chains";
import { PrivyClient } from "@privy-io/node";
import { ethers } from "ethers";

// Initialize Privy client once
const privy = new PrivyClient({
  appId: process.env.PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!
});

interface GetSponsoredSmartWalletClientParams {
  privy: PrivyClient;
  privyWalletId: string;
  evmAddress: string;
}

interface SmartWalletClientResult {
  smartAccountClient: any;
  publicClient: PublicClient;
}

/**
 * Creates a smart wallet client with gas sponsorship capabilities
 * Returns both the smart account client (for sending operations) and public client (for querying)
 */
export const getSponsoredSmartWalletClient = async ({
  privy,
  privyWalletId,
  evmAddress
}: GetSponsoredSmartWalletClientParams): Promise<SmartWalletClientResult> => {
  const chain = baseSepolia;
  const rpcUrl = process.env.RPC_URL || "https://sepolia.base.org";

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl)
  }) as any;

  const smartAccountClient = {
    sendUserOperation: async (userOp: any) => {
      return sendTransactionWithGasSponsorship(
        userOp,
        publicClient,
        privy,
        privyWalletId,
        evmAddress
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
 * 
 * Flow:
 * 1. Check if merchant has enough for gas
 * 2. If not, funder wallet sends gas to merchant
 * 3. Merchant wallet then sends the transaction
 * 
 * @param userOp - User operation containing transaction details (to, data, value)
 * @param publicClient - Viem public client for blockchain queries
 * @param privy - Privy client for wallet management
 * @param privyWalletId - Wallet ID from Privy
 * @param evmAddress - Merchant/user's EVM address
 * @returns Transaction hash and userOpHash
 */
export const sendTransactionWithGasSponsorship = async (
  userOp: any,
  publicClient: PublicClient,
  privy: PrivyClient,
  privyWalletId: string,
  evmAddress: string
): Promise<any> => {
  try {
    const rpcUrl = process.env.RPC_URL || "https://sepolia.base.org";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const chainId = publicClient.chain?.id || 84532;

    const to = userOp.to || userOp.target;
    const data = userOp.data || userOp.callData;
    const value = userOp.value || "0";

    if (!to || !data) {
      throw new Error("Missing 'to' or 'data' in userOp");
    }

    console.log(`[Gas Sponsorship] Merchant Wallet: ${evmAddress}`);
    console.log(`[Gas Sponsorship] To: ${to}`);

    // Step 1: Get merchant's current balance
    const merchantBalance = await provider.getBalance(evmAddress);
    console.log(`[Gas Sponsorship] Merchant balance: ${ethers.formatEther(merchantBalance)} ETH`);

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

    // Step 3: Check if merchant needs gas funding
    if (merchantBalance < gasNeeded) {
      const gasShortfall = gasNeeded - merchantBalance;
      console.log(`[Gas Sponsorship] Merchant needs ${ethers.formatEther(gasShortfall)} ETH for gas`);

      // Fund merchant from funder wallet
      await fundMerchantWallet(evmAddress, gasShortfall, provider);

      // Wait for the funding to settle
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Step 4: Send transaction via funder wallet
    console.log(`[Gas Sponsorship] Sending transaction via funder wallet`);

    const funderPrivateKey = process.env.FUNDER_PRIVATE_KEY;
    if (!funderPrivateKey) {
      throw new Error("FUNDER_PRIVATE_KEY not set. Cannot send transaction.");
    }

    const funderWallet = new ethers.Wallet(funderPrivateKey, provider);

    const tx = await funderWallet.sendTransaction({
      to: getAddress(to),
      data: data,
      value: value === "0" ? BigInt(0) : BigInt(value),
      from: funderWallet.address
    });

    console.log(`[Gas Sponsorship] Transaction sent from funder: ${tx.hash}`);

    return {
      hash: tx.hash,
      userOpHash: tx.hash
    };
  } catch (error) {
    console.error("[Gas Sponsorship] Error:", error);
    throw new Error(
      `Failed to send transaction with gas sponsorship: ${error instanceof Error ? error.message : String(error)
      }`
    );
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
  try {
    const funderPrivateKey = process.env.FUNDER_PRIVATE_KEY;
    if (!funderPrivateKey) {
      throw new Error("FUNDER_PRIVATE_KEY not set in environment. Cannot sponsor gas.");
    }

    const funderWallet = new ethers.Wallet(funderPrivateKey, provider);
    console.log(`[Gas Sponsorship] Funding from: ${funderWallet.address}`);

    // Check if merchant address is a smart contract or EOA
    const code = await provider.getCode(merchantAddress);
    const isContract = code !== "0x";
    console.log(`[Gas Sponsorship] Merchant is ${isContract ? "smart contract" : "EOA"}`);

    const txParams: {
      to: `0x${string}`;
      value: bigint;
      gas?: bigint;
    } = {
      to: getAddress(merchantAddress),
      value: amount
    };

    if (isContract) {
      txParams.gas = BigInt(100000);
    } else {
      txParams.gas = BigInt(21000);
    }

    console.log(`[Gas Sponsorship] Sending ${ethers.formatEther(amount)} ETH with gasLimit ${txParams.gas}`);

    const tx = await funderWallet.sendTransaction(txParams);

    console.log(`[Gas Sponsorship] Funding transaction sent: ${tx.hash}`);

    const receipt = await provider.waitForTransaction(tx.hash, 1, 60000);

    if (receipt && receipt.status === 0) {
      console.warn("[Gas Sponsorship] Funding transaction reverted (contract may not accept ETH)");
      // Don't throw - contract might not have receive() function
      // We'll try the main transaction anyway
      return tx.hash;
    }

    console.log(`[Gas Sponsorship] Funding confirmed: ${receipt?.hash}`);
    return receipt?.hash || tx.hash;
  } catch (error) {
    console.error("[Gas Sponsorship] Funding error:", error);
    // Don't throw - continue with main transaction even if funding fails
    // The merchant wallet might have other sources of funds
    console.warn("[Gas Sponsorship] Continuing despite funding failure");
    return "0x";
  }
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