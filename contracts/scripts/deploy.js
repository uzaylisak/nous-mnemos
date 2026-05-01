// Deploys NousRecord and writes the deployed address + ABI into a file
// that the web app can load directly.

const fs   = require('fs');
const path = require('path');
const hre  = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying from:', deployer.address);
  console.log('Balance:       ', (await hre.ethers.provider.getBalance(deployer.address)).toString());

  const Factory = await hre.ethers.getContractFactory('NousRecord');
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('\nNousRecord deployed at:', address);
  console.log('Owner:                 ', deployer.address);
  console.log('Chain id:              ', (await hre.ethers.provider.getNetwork()).chainId);

  // Pull the ABI out of artifacts so the web app always has the current one.
  const artifactPath = path.resolve(
    __dirname, '..', 'artifacts', 'src', 'NousRecord.sol', 'NousRecord.json'
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  const deployment = {
    address,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    owner: deployer.address,
    deployedAt: new Date().toISOString(),
    abi: artifact.abi,
  };

  // Emit to three places:
  //   1. contracts/deployments/<network>.json  — canonical source of truth
  //   2. ui_kits/web_app/nousRecordDeployment.json — web app picks this up
  const deployDir = path.resolve(__dirname, '..', 'deployments');
  fs.mkdirSync(deployDir, { recursive: true });
  const netName = hre.network.name;
  fs.writeFileSync(
    path.join(deployDir, `${netName}.json`),
    JSON.stringify(deployment, null, 2)
  );

  const webAppTarget = path.resolve(
    __dirname, '..', '..', 'ui_kits', 'web_app', 'nousRecordDeployment.json'
  );
  fs.writeFileSync(webAppTarget, JSON.stringify(deployment, null, 2));

  console.log('\nWrote:');
  console.log(' -', path.relative(process.cwd(), path.join(deployDir, `${netName}.json`)));
  console.log(' -', path.relative(process.cwd(), webAppTarget));
  console.log('\nNext: set NOUS_RECORD_ADDRESS in .env to', address);
}

main().catch((err) => { console.error(err); process.exit(1); });
