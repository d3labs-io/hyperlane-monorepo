import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,  // Enable IR-based compiler to avoid "stack too deep" errors
    },
  },
  networks: {
    pruvTestnet: {
      url: "https://rpc.testnet.pruv.network",
      chainId: 7336,
      accounts: process.env.PRIVATE_KEY
        ? process.env.SECOND_PRIVATE_KEY
          ? [process.env.PRIVATE_KEY, process.env.SECOND_PRIVATE_KEY]
          : [process.env.PRIVATE_KEY]
        : [],
    },
  },
  etherscan: {
    apiKey: {
      pruvTestnet: "no-api-key-needed",
    },
    customChains: [
      {
        network: "pruvTestnet",
        chainId: 7336,
        urls: {
          apiURL: "https://explorer.testnet.pruv.network/api",
          browserURL: "https://explorer.testnet.pruv.network",
        },
      },
    ],
  },
};

export default config;
