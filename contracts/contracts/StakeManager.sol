// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./TestUSDC.sol";

/**
 * @title StakeManager
 * @dev Agents stake tUSDC to register; slash on low reputation.
 */
contract StakeManager is Ownable {
    TestUSDC public token;
    uint256 public minimumStake = 10 * 10 ** 6; // 10 tUSDC (6 decimals)
    address public arbiter;

    mapping(uint256 => uint256) public stakes;

    event Staked(uint256 indexed agentId, address indexed staker, uint256 amount);
    event Slashed(uint256 indexed agentId, uint256 amount, string reason);

    constructor(address _token, address _arbiter) Ownable(msg.sender) {
        token = TestUSDC(_token);
        arbiter = _arbiter;
    }

    function stake(uint256 agentId, uint256 amount) external {
        require(amount >= minimumStake, "Below minimum stake");
        token.transferFrom(msg.sender, address(this), amount);
        stakes[agentId] += amount;
        emit Staked(agentId, msg.sender, amount);
    }

    function getStake(uint256 agentId) external view returns (uint256) {
        return stakes[agentId];
    }

    function slash(uint256 agentId, uint256 amount, string calldata reason) external {
        require(msg.sender == arbiter || msg.sender == owner(), "Not arbiter");
        require(stakes[agentId] >= amount, "Insufficient stake");
        stakes[agentId] -= amount;
        token.transfer(arbiter, amount);
        emit Slashed(agentId, amount, reason);
    }

    function setMinimumStake(uint256 amount) external onlyOwner {
        minimumStake = amount;
    }
}
