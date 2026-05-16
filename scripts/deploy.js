const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const balance = await deployer.getBalance();
  console.log("Account balance:", hre.ethers.utils.formatEther(balance));

  // BUG: Hardcoded gas price - will overpay or underpay depending on network conditions
  const gasPrice = hre.ethers.utils.parseUnits("35", "gwei");

  // Deploy staking token
  const StakingToken = await hre.ethers.getContractFactory("StakingToken");
  const stakingToken = await StakingToken.deploy({ gasPrice });
  await stakingToken.deployed();
  console.log("StakingToken deployed to:", stakingToken.address);

  // Deploy reward token
  const RewardToken = await hre.ethers.getContractFactory("RewardToken");
  const rewardToken = await RewardToken.deploy({ gasPrice });
  await rewardToken.deployed();
  console.log("RewardToken deployed to:", rewardToken.address);

  // Deploy StakingRewards
  const StakingRewards = await hre.ethers.getContractFactory("StakingRewards");
  const stakingRewards = await StakingRewards.deploy(
    stakingToken.address,
    rewardToken.address,
    { gasPrice }
  );
  await stakingRewards.deployed();
  console.log("StakingRewards deployed to:", stakingRewards.address);

  // BUG: No contract verification step - contracts won't be verified on Etherscan
  // BUG: No deployment artifact saved - addresses will be lost if console output is missed
  console.log("\nDeployment complete. Remember to verify contracts manually.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
