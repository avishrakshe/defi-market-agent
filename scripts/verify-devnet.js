require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { createPublicClient, createWalletClient, http, formatEther } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

async function main() {
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:9650";
  const chainId = parseInt(process.env.CHAIN_ID || "99999", 10);
  const privateKey = process.env.DEV_PRIVATE_KEY;

  if (!privateKey) {
    console.error("DEV_PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  const chain = {
    id: chainId,
    name: "agentmarket",
    nativeCurrency: { name: "tAGT", symbol: "tAGT", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ chain, transport: http(rpcUrl), account });

  const id = await publicClient.getChainId();
  const balance = await publicClient.getBalance({ address: account.address });

  console.log("=== Devnet Verification ===");
  console.log("RPC URL:", rpcUrl);
  console.log("Chain ID:", id);
  console.log("Wallet:", account.address);
  console.log("Balance:", formatEther(balance), "tAGT");
  console.log("Wallet client ready:", !!walletClient);

  if (id !== chainId) {
    console.error(`Chain ID mismatch: expected ${chainId}, got ${id}`);
    process.exit(1);
  }

  console.log("VERIFICATION PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
