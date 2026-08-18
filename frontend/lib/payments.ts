import { parseSignature } from "viem";
import { CONTRACTS } from "./contracts";
import { CHAIN_ID } from "./wagmi";

export type PaymentAuth = {
  from: string;
  to: string;
  value: string;
  validAfter: number;
  validBefore: number;
  nonce: string;
  v: number;
  r: string;
  s: string;
};

export function buildEip3009TypedData(from: string, to: string, value: bigint, nonce: `0x${string}`, validBefore: number) {
  return {
    domain: {
      name: "Test USD Coin",
      version: "1",
      chainId: CHAIN_ID,
      verifyingContract: CONTRACTS.TestUSDC as `0x${string}`,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from: from as `0x${string}`,
      to: to as `0x${string}`,
      value,
      validAfter: BigInt(0),
      validBefore: BigInt(validBefore),
      nonce,
    },
  };
}

export function signatureToAuth(
  from: string,
  to: string,
  value: bigint,
  nonce: `0x${string}`,
  validBefore: number,
  signature: `0x${string}`,
): PaymentAuth {
  const { v, r, s } = parseSignature(signature);
  return {
    from,
    to,
    value: value.toString(),
    validAfter: 0,
    validBefore,
    nonce,
    v: Number(v),
    r,
    s,
  };
}

export function randomNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}
