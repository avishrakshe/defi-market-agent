// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TestUSDC.sol";

/**
 * @title PaymentSettlement
 * @dev Validates EIP-3009 authorizations and settles payments onchain.
 */
contract PaymentSettlement {
    struct Authorization {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    TestUSDC public token;
    mapping(bytes32 => bool) public settledPayments;
    mapping(bytes32 => bool) public settledTxHashes;

    event PaymentSettled(
        address indexed from,
        address indexed to,
        uint256 amount,
        bytes32 indexed nonce,
        address tokenAddress
    );

    constructor(address _token) {
        token = TestUSDC(_token);
    }

    function verifyAndSettle(Authorization calldata auth) external returns (bool) {
        require(!settledPayments[auth.nonce], "Already settled");

        token.transferWithAuthorization(
            auth.from,
            auth.to,
            auth.value,
            auth.validAfter,
            auth.validBefore,
            auth.nonce,
            auth.v,
            auth.r,
            auth.s
        );

        settledPayments[auth.nonce] = true;

        emit PaymentSettled(
            auth.from,
            auth.to,
            auth.value,
            auth.nonce,
            address(token)
        );

        return true;
    }

    function isPaymentSettled(bytes32 nonce) external view returns (bool) {
        return settledPayments[nonce];
    }

    function isPaymentSettledByTxHash(bytes32 txHash) external view returns (bool) {
        return settledTxHashes[txHash];
    }

    /// @dev Link an onchain tx hash to a settled authorization nonce
    function linkTxHash(bytes32 nonce, bytes32 txHash) external {
        require(settledPayments[nonce], "Nonce not settled");
        require(!settledTxHashes[txHash], "Tx hash already linked");
        settledTxHashes[txHash] = true;
    }
}
