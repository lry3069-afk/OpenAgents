const hre = require("hardhat");

// BUG: API key hardcoded as placeholder - verification will fail on mainnet
const ETHERSCAN_API_KEY = "YOUR_ETHERSCAN_API_KEY_HERE";

async function verifyContract(address, constructorArgs) {
  console.log(`Verifying contract at ${address}...`);
  try {
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: constructorArgs,
      apiKey: ETHERSCAN_API_KEY,
    });
    console.log(`Contract at ${address} verified successfully.`);
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log(`Contract at ${address} is already verified.`);
    } else {
      console.error(`Verification failed for ${address}:`, error.message);
    }
  }
}

async function main() {
  const stakingToken = process.env.STAKING_TOKEN_ADDRESS;
  const rewardToken = process.env.REWARD_TOKEN_ADDRESS;
  const stakingRewards = process.env.STAKING_REWARDS_ADDRESS;

  await verifyContract(stakingToken, []);
  await verifyContract(rewardToken, []);
  await verifyContract(stakingRewards, [stakingToken, rewardToken]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
