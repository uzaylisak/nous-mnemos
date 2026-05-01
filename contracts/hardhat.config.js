require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

const PRIVATE_KEY     = process.env.DEPLOYER_PRIVATE_KEY || '';
const BASE_SEPOLIA    = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
const BASESCAN_KEY    = process.env.BASESCAN_API_KEY || '';

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 1000 },
      viaIR: true,
    },
  },
  paths: {
    sources: './src',
    tests: './test',
    artifacts: './artifacts',
    cache: './cache',
  },
  networks: {
    hardhat: { chainId: 31337 },
    baseSepolia: {
      url: BASE_SEPOLIA,
      chainId: 84532,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      baseSepolia: BASESCAN_KEY,
    },
    customChains: [
      {
        network: 'baseSepolia',
        chainId: 84532,
        urls: {
          apiURL: 'https://api-sepolia.basescan.org/api',
          browserURL: 'https://sepolia.basescan.org',
        },
      },
    ],
  },
};
