// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract HimaInsuranceEscrow {
    address public owner;

    // Supported payment tokens (e.g., USDC)
    mapping(address => bool) public supportedTokens;

    // Policy struct
    struct Policy {
        address rider;
        address token;
        uint256 premium;
        uint256 createdAt;
        bool isActive;
        uint256 claimId;
    }

    // Claim struct
    struct Claim {
        address rider;
        address token;
        uint256 amount;
        uint256 filedAt;
        bool approved;
        bool paid;
    }

    uint256 public policyCounter;
    uint256 public claimCounter;

    mapping(uint256 => Policy) public policies;    // policyId => Policy
    mapping(uint256 => Claim) public claims;       // claimId => Claim

    // rider => token => escrowed amount (active policies only)
    mapping(address => mapping(address => uint256)) public balances; 

    event PolicyCreated(uint256 indexed policyId, address indexed rider, address token, uint256 premium);
    event ClaimFiled(uint256 indexed claimId, uint256 indexed policyId, address indexed rider, uint256 amount);
    event ClaimApproved(uint256 indexed claimId, uint256 indexed policyId, address indexed rider);
    event ClaimPaid(uint256 indexed claimId, address indexed rider, uint256 amount);
    event PolicyCancelled(uint256 indexed policyId, address indexed rider, uint256 refund);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address _usdc) {
        owner = msg.sender;
        supportedTokens[_usdc] = true;
    }

    function addSupportedToken(address token) external onlyOwner {
        supportedTokens[token] = true;
    }

    // Deposit premium for a new policy
    function createPolicy(address token, uint256 premium, address rider) external onlyOwner returns (uint256) {
        require(supportedTokens[token], "Token not supported");
        require(IERC20(token).transferFrom(msg.sender, address(this), premium), "Transfer failed");
        balances[rider][token] += premium;

        policyCounter += 1;
        policies[policyCounter] = Policy({
            rider: rider,
            token: token,
            premium: premium,
            createdAt: block.timestamp,
            isActive: true,
            claimId: 0
        });
        emit PolicyCreated(policyCounter, rider, token, premium);
        return policyCounter;
    }

    function getRiderBalance(address rider, address token) external view returns (uint256) {
        require(supportedTokens[token], "Token not supported");
        return balances[rider][token];
    }

    // File a claim against a policy. Only owner (backend) can call.
    function fileClaim(uint256 policyId, uint256 amount) external onlyOwner returns (uint256) {
        Policy storage policy = policies[policyId];
        require(policy.isActive, "Policy not active");
        require(amount <= policy.premium, "Claim exceeds premium");

        claimCounter += 1;
        claims[claimCounter] = Claim({
            rider: policy.rider,
            token: policy.token,
            amount: amount,
            filedAt: block.timestamp,
            approved: false,
            paid: false
        });
        policy.claimId = claimCounter;

        emit ClaimFiled(claimCounter, policyId, policy.rider, amount);
        return claimCounter;
    }

    // Approve a claim (only owner)
    function approveClaim(uint256 claimId) external onlyOwner {
        Claim storage claim = claims[claimId];
        require(!claim.approved, "Already approved");
        claim.approved = true;
        emit ClaimApproved(claimId, claimId, claim.rider);
    }

    // Payout claim after approval
    function payoutClaim(uint256 claimId) external onlyOwner {
        Claim storage claim = claims[claimId];
        require(claim.approved, "Not approved");
        require(!claim.paid, "Already paid");
        require(balances[claim.rider][claim.token] >= claim.amount, "Insufficient balance");
        claim.paid = true;

        balances[claim.rider][claim.token] -= claim.amount;
        require(IERC20(claim.token).transfer(claim.rider, claim.amount), "Payout failed");
        emit ClaimPaid(claimId, claim.rider, claim.amount);
    }

    // Cancel a policy and optionally refund unused premium (only owner)
    function cancelPolicy(uint256 policyId) external onlyOwner {
        Policy storage policy = policies[policyId];
        require(policy.isActive, "Policy not active");
        policy.isActive = false;

        uint256 refund = balances[policy.rider][policy.token];
        balances[policy.rider][policy.token] = 0;
        if (refund > 0) {
            require(IERC20(policy.token).transfer(policy.rider, refund), "Refund failed");
        }
        emit PolicyCancelled(policyId, policy.rider, refund);
    }
}
