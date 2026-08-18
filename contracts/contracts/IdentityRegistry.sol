// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title IdentityRegistry
 * @dev ERC-8004 style agent identity registry as ERC-721 tokens.
 */
contract IdentityRegistry is ERC721, Ownable {
    struct AgentInfo {
        uint256 tokenId;
        address wallet;
        string metadataURI;
    }

    uint256 private _nextTokenId = 1;
    mapping(uint256 => address) public agentWallets;
    mapping(uint256 => string) public agentMetadataURIs;
    mapping(address => uint256) public walletToTokenId;
    uint256[] private _allTokenIds;

    event AgentRegistered(uint256 indexed tokenId, address indexed wallet, string metadataURI);

    constructor() ERC721("AgentID", "AGENT") Ownable(msg.sender) {}

    function registerAgent(address agentWallet, string calldata metadataURI) external returns (uint256) {
        require(agentWallet != address(0), "Invalid wallet");
        require(walletToTokenId[agentWallet] == 0, "Agent already registered");

        uint256 tokenId = _nextTokenId++;
        _mint(agentWallet, tokenId);
        agentWallets[tokenId] = agentWallet;
        agentMetadataURIs[tokenId] = metadataURI;
        walletToTokenId[agentWallet] = tokenId;
        _allTokenIds.push(tokenId);

        emit AgentRegistered(tokenId, agentWallet, metadataURI);
        return tokenId;
    }

    function getAgent(uint256 tokenId) external view returns (AgentInfo memory) {
        require(tokenId > 0 && tokenId < _nextTokenId, "Agent not found");
        return AgentInfo({
            tokenId: tokenId,
            wallet: agentWallets[tokenId],
            metadataURI: agentMetadataURIs[tokenId]
        });
    }

    function getAllAgents() external view returns (AgentInfo[] memory) {
        AgentInfo[] memory agents = new AgentInfo[](_allTokenIds.length);
        for (uint256 i = 0; i < _allTokenIds.length; i++) {
            uint256 tokenId = _allTokenIds[i];
            agents[i] = AgentInfo({
                tokenId: tokenId,
                wallet: agentWallets[tokenId],
                metadataURI: agentMetadataURIs[tokenId]
            });
        }
        return agents;
    }

    function totalAgents() external view returns (uint256) {
        return _allTokenIds.length;
    }
}
