// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/structs/BitMaps.sol";

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract MerkleVault is AccessControl {
  using SafeERC20 for IERC20;
  using BitMaps for BitMaps.BitMap;

  error AlreadyClaimed();
  error AlreadySet();
  error CannotBeZero();
  error ClaimNotFound();
  error InsufficientBalance();
  error InvalidSequence();
  error TokenNotAllowed();

  bytes32 public constant PROPOSAL_ROLE = keccak256("PROPOSAL_ROLE");
  bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");

  struct MerkleRoot {
    bytes32 merkleRoot; // root of claims merkle tree
    uint256 merkleNumber;
    uint endTime; // time in seconds that this block ended
    bytes4 ipfs_cid_prefix; // see https://stackoverflow.com/questions/66927626/how-to-store-ipfs-hash-on-ethereum-blockchain-using-smart-contracts
    bytes32 ipfs_cid_hash; // see https://stackoverflow.com/questions/66927626/how-to-store-ipfs-hash-on-ethereum-blockchain-using-smart-contracts
  }

  mapping(address => uint256) public balance; // balance[tokenAddress]
  mapping(address => bool) public allowList;
  
  uint256 public proposedRootCount;
  mapping(uint256 => MerkleRoot) public proposedRoots;
  uint256 public merkleRootCount;
  mapping(uint256 => MerkleRoot) public merkleRoots;
  mapping(uint256 => BitMaps.BitMap) private bitMaps;

  event NewDeposit(
    address indexed tokenAddress,
    address indexed from,
    uint256 amount
  );

  event NewWithdrawal(
    address indexed tokenAddress,
    address indexed from,
    uint256 amount
  );

  event ProposedMerkleTree(
    uint256 indexed proposalNumber
  );

  event NewMerkleTree(
    uint256 indexed merkleNumber
  );

  event AllowListChange(
    address indexed tokenAddress,
    bool allowed
  );

  constructor(address proposal, address validator) {
    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    _grantRole(PROPOSAL_ROLE, proposal);
    _grantRole(VALIDATOR_ROLE, validator);
  }

  function depositNativeToken() external payable {
    return depositNativeTokenFor(msg.sender);
  }

  function depositNativeTokenFor(
    address _recipient // gift a deposit to someone else
  ) public payable {
    if (allowList[address(0)] == true) revert TokenNotAllowed();
    balance[address(0)] += msg.value;
    emit NewDeposit(address(0), _recipient, msg.value);
  }

  function setAllowedToken(
    address _tokenAddress,
    bool _allowed
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (allowList[_tokenAddress] == _allowed) revert AlreadySet();

    allowList[_tokenAddress] = _allowed;

    emit AllowListChange(_tokenAddress, _allowed);
  }

  function depositToken(
    address _tokenAddress,
    uint256 _amount
  ) external {
    return depositTokenFor(_tokenAddress, _amount, msg.sender);
  }

  function depositTokenFor(
    address _tokenAddress,
    uint256 _amount,
    address _recipient // gift a deposit to someone else
  ) public {
    if (_amount == 0) revert CannotBeZero();
    if (allowList[_tokenAddress] != true) revert TokenNotAllowed();

    // transfer token to this contract
    IERC20 token = IERC20(_tokenAddress);
    token.safeTransferFrom(msg.sender, address(this), _amount);

    balance[_tokenAddress] += _amount;

    emit NewDeposit(_tokenAddress, _recipient, _amount);
  }

  function proposeRoot(
    bytes32 _merkleRoot,
    uint256 _merkleNumber,
    uint _endTime, // exclusive
    bytes4 _ipfs_cid_prefix, // see https://stackoverflow.com/questions/66927626/how-to-store-ipfs-hash-on-ethereum-blockchain-using-smart-contracts
    bytes32 _ipfs_cid_hash
  ) external onlyRole(PROPOSAL_ROLE) {
    if (_merkleRoot == 0) revert CannotBeZero();
    if (_merkleNumber != merkleRootCount + 1) revert InvalidSequence();

    proposedRootCount = proposedRootCount + 1;
    proposedRoots[proposedRootCount] = MerkleRoot(
      _merkleRoot, _merkleNumber, _endTime, _ipfs_cid_prefix, _ipfs_cid_hash
    );

    emit ProposedMerkleTree(proposedRootCount);
  }

  function validateRoot(
    uint256 _proposalNumber
  ) external onlyRole(VALIDATOR_ROLE) {

    MerkleRoot memory proposed = proposedRoots[_proposalNumber];
    if (proposed.merkleNumber != merkleRootCount + 1) revert InvalidSequence();

    merkleRootCount = merkleRootCount + 1;
    merkleRoots[merkleRootCount] = proposed;

    emit NewMerkleTree(merkleRootCount);
  }

  function isClaimed(uint256 _merkleCount, uint256 index) public view returns (bool) {
    return bitMaps[_merkleCount].get(index);
  }

  function _setClaimed(uint256 _merkleCount, uint256 index) private {
    bitMaps[_merkleCount].setTo(index, true);
  }

  function withdraw(
    address payable _recipient,
    address _tokenAddress,
    uint256 _merkleCount,
    uint256 _merkleIndex,
    uint256 _amount,
    bytes32[] calldata _merkleProof
  ) external {
    if (isClaimed(_merkleCount, _merkleIndex) != false) revert AlreadyClaimed();
    if (balance[_tokenAddress] < _amount) revert InsufficientBalance();

    bytes32 leaf = _leafHash(_merkleIndex, _tokenAddress, _recipient, _amount);

    // merkle proof valid?
    if (MerkleProof.verify(_merkleProof, merkleRoots[_merkleCount].merkleRoot, leaf) != true) revert ClaimNotFound();

    _setClaimed(_merkleCount, _merkleIndex);
    balance[_tokenAddress] = balance[_tokenAddress] - _amount;
    
    if(_tokenAddress == address(0)) {
      _recipient.transfer(_amount);
    } else {
      IERC20(_tokenAddress).safeTransfer(_recipient, _amount); 
    }

    emit NewWithdrawal(_tokenAddress, msg.sender, _amount);
  }

  // generate hash of (claim holder, amount)
  // claim holder must be the caller
  function _leafHash(uint256 index, address tokenAddress, address recipient, uint256 amount) internal pure returns (bytes32) {
    return keccak256(bytes.concat(keccak256(abi.encode(index, tokenAddress, recipient, amount))));
  }
}