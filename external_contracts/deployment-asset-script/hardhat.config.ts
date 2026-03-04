import '@nomicfoundation/hardhat-toolbox';
import * as dotenv from 'dotenv';
import { HardhatUserConfig } from 'hardhat/config';

dotenv.config();

const config: HardhatUserConfig = {
  solidity: '0.8.24',
  networks: {
    pruvTestnet: {
      url: 'https://rpc.testnet.pruv.network',
      chainId: 7336,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    evmtest1: {
      url: 'http://127.0.0.1:8545',
      chainId: 31337,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    evmtest2: {
      url: 'http://127.0.0.1:8546',
      chainId: 31338,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      pruvTestnet: 'no-api-key-needed',
    },
    customChains: [
      {
        network: 'pruvTestnet',
        chainId: 7336,
        urls: {
          apiURL: 'https://explorer.testnet.pruv.network/api',
          browserURL: 'https://explorer.testnet.pruv.network',
        },
      },
    ],
  },
};

export default config;
