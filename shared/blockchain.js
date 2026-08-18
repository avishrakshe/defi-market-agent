import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  keccak256,
  toHex,
  encodePacked,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadDeployed() {
  const p = path.join(__dirname, "deployed.json");
  if (!fs.existsSync(p)) {
    throw new Error("shared/deployed.json not found — run contract deployment first");
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function getChainConfig() {
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:9650";
  const chainId = parseInt(process.env.CHAIN_ID || "99999", 10);
  return {
    id: chainId,
    name: "agentmarket",
    nativeCurrency: { name: "tAGT", symbol: "tAGT", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };
}

export function getPublicClient() {
  const chain = getChainConfig();
  return createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  });
}

export function getWalletClient(privateKey = process.env.DEV_PRIVATE_KEY) {
  const chain = getChainConfig();
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
    account,
  });
}

export function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return ("0x" + Buffer.from(bytes).toString("hex")) ;
}

export async function signEIP3009Transfer({
  privateKey,
  tokenAddress,
  from,
  to,
  value,
  validAfter = 0,
  validBefore = Math.floor(Date.now() / 1000) + 3600,
  nonce = randomNonce(),
}) {
  const chain = getChainConfig();
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
    account,
  });

  const domain = {
    name: "Test USD Coin",
    version: "1",
    chainId: chain.id,
    verifyingContract: tokenAddress,
  };

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  const message = { from, to, value, validAfter, validBefore, nonce };
  const signature = await walletClient.signTypedData({
    account,
    domain,
    types,
    primaryType: "TransferWithAuthorization",
    message,
  });

  const sig = (await import("viem")).parseSignature(signature);

  return {
    authorization: {
      from,
      to,
      value,
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce,
      v: Number(sig.v),
      r: sig.r,
      s: sig.s,
    },
    nonce,
  };
}

export { parseUnits, keccak256, toHex, encodePacked };
