const hre = require('hardhat');

async function main() {
  const contractAddr = process.env.NOUS_RECORD_ADDRESS;
  const attester     = process.env.ATTESTER_ADDRESS;
  if (!contractAddr) throw new Error('Set NOUS_RECORD_ADDRESS in .env');
  if (!attester)     throw new Error('Set ATTESTER_ADDRESS in .env');

  const [owner] = await hre.ethers.getSigners();
  const c = await hre.ethers.getContractAt('NousRecord', contractAddr, owner);
  const tx = await c.revokeAttester(attester);
  console.log('tx:', tx.hash);
  await tx.wait();
  console.log('Revoked', attester);
}

main().catch((err) => { console.error(err); process.exit(1); });
