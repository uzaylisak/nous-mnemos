// Adds an attester address to a deployed NousRecord. The deployer (owner) signs.
// Reads NOUS_RECORD_ADDRESS and ATTESTER_ADDRESS from .env.

const hre = require('hardhat');

async function main() {
  const contractAddr = process.env.NOUS_RECORD_ADDRESS;
  const attester     = process.env.ATTESTER_ADDRESS;
  if (!contractAddr) throw new Error('Set NOUS_RECORD_ADDRESS in .env');
  if (!attester)     throw new Error('Set ATTESTER_ADDRESS in .env');

  const [owner] = await hre.ethers.getSigners();
  console.log('Owner signing: ', owner.address);
  console.log('Contract:      ', contractAddr);
  console.log('Adding attester:', attester);

  const c = await hre.ethers.getContractAt('NousRecord', contractAddr, owner);
  const tx = await c.addAttester(attester);
  console.log('tx:', tx.hash);
  const rc = await tx.wait();
  console.log('Mined in block', rc.blockNumber);
}

main().catch((err) => { console.error(err); process.exit(1); });
