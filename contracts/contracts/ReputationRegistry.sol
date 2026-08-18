// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PaymentSettlement.sol";

/**
 * @title ReputationRegistry
 * @dev ERC-8004 style reputation registry with payment tx cross-check.
 */
contract ReputationRegistry {
    struct Reputation {
        uint256 avgScore;
        uint256 feedbackCount;
    }

    struct Feedback {
        uint256 agentId;
        uint8 score;
        bytes32 paymentTxHash;
        string comment;
        uint256 timestamp;
    }

    PaymentSettlement public paymentSettlement;
    mapping(uint256 => uint256) public totalScore;
    mapping(uint256 => uint256) public feedbackCount;
    mapping(uint256 => Feedback[]) private _feedbackHistory;

    event FeedbackSubmitted(
        uint256 indexed agentId,
        uint8 score,
        bytes32 paymentTxHash,
        string comment
    );

    constructor(address _paymentSettlement) {
        paymentSettlement = PaymentSettlement(_paymentSettlement);
    }

    function submitFeedback(
        uint256 agentId,
        uint8 score,
        bytes32 paymentTxHash,
        string calldata comment
    ) external {
        require(score >= 1 && score <= 100, "Score must be 1-100");
        require(paymentTxHash != bytes32(0), "Invalid payment tx hash");
        require(
            paymentSettlement.isPaymentSettledByTxHash(paymentTxHash),
            "Payment tx not verified"
        );

        totalScore[agentId] += score;
        feedbackCount[agentId] += 1;

        _feedbackHistory[agentId].push(
            Feedback({
                agentId: agentId,
                score: score,
                paymentTxHash: paymentTxHash,
                comment: comment,
                timestamp: block.timestamp
            })
        );

        emit FeedbackSubmitted(agentId, score, paymentTxHash, comment);
    }

    function getReputation(uint256 agentId) external view returns (Reputation memory) {
        uint256 count = feedbackCount[agentId];
        uint256 avg = count == 0 ? 0 : totalScore[agentId] / count;
        return Reputation({ avgScore: avg, feedbackCount: count });
    }

    function getFeedbackHistory(uint256 agentId) external view returns (Feedback[] memory) {
        return _feedbackHistory[agentId];
    }
}
