const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('NousRecord', function () {
  async function deploy() {
    const [owner, attester, author, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('NousRecord');
    const c = await Factory.deploy();
    await c.waitForDeployment();
    return { c, owner, attester, author, stranger };
  }

  function hash(s)   { return ethers.keccak256(ethers.toUtf8Bytes(s)); }
  function bytes32(s){ return ethers.keccak256(ethers.toUtf8Bytes(s)); }

  const fixture = {
    conversationId: bytes32('conv-1'),
    model:          'Hermes-3-Llama-3.1-70B',
    arweaveCid:     'ar://aX2kL9JmN4xZ0Qp7R8sT3vU5wY6zQ8eR9tB2nC1dFgH',
  };

  async function signRecord(c, attester, author) {
    const promptHash     = hash('what is memory');
    const responseHash   = hash('memory is selective return');
    const plaintextHash  = hash('what is memory\nmemory is selective return');
    const ciphertextHash = hash('04a8f1c0b73e22d1f9e8...');
    const digest = await c.recordDigest(
      author.address,
      fixture.conversationId,
      fixture.model,
      promptHash, responseHash, plaintextHash, ciphertextHash,
      fixture.arweaveCid
    );
    const sig = await attester.signMessage(ethers.getBytes(digest));
    return { promptHash, responseHash, plaintextHash, ciphertextHash, sig };
  }

  it('deploys with owner = deployer and no attesters', async () => {
    const { c, owner, attester } = await deploy();
    expect(await c.owner()).to.equal(owner.address);
    expect(await c.trustedAttesters(attester.address)).to.equal(false);
    expect(await c.totalRecords()).to.equal(0n);
  });

  it('owner adds and revokes attesters; others cannot', async () => {
    const { c, owner, attester, stranger } = await deploy();

    await expect(c.connect(owner).addAttester(attester.address))
      .to.emit(c, 'AttesterAdded').withArgs(attester.address);
    expect(await c.trustedAttesters(attester.address)).to.equal(true);

    await expect(c.connect(stranger).addAttester(stranger.address))
      .to.be.revertedWithCustomError(c, 'NotOwner');

    await expect(c.connect(owner).revokeAttester(attester.address))
      .to.emit(c, 'AttesterRevoked').withArgs(attester.address);
    expect(await c.trustedAttesters(attester.address)).to.equal(false);
  });

  it('seal() stores the record and emits the event', async () => {
    const { c, owner, attester, author } = await deploy();
    await c.connect(owner).addAttester(attester.address);

    const r = await signRecord(c, attester, author);
    const tx = await c.connect(author).seal(
      fixture.conversationId, fixture.model,
      r.promptHash, r.responseHash, r.plaintextHash, r.ciphertextHash,
      fixture.arweaveCid, r.sig
    );
    await expect(tx).to.emit(c, 'RecordSealed');

    expect(await c.totalRecords()).to.equal(1n);
    const rec = await c.getRecord(0);
    expect(rec.author).to.equal(author.address);
    expect(rec.attester).to.equal(attester.address);
    expect(rec.model).to.equal(fixture.model);
    expect(rec.arweaveCid).to.equal(fixture.arweaveCid);

    const ids = await c.recordIdsOf(author.address);
    expect(ids.length).to.equal(1);
    expect(ids[0]).to.equal(0n);
  });

  it('rejects signatures from untrusted attesters', async () => {
    const { c, attester, author } = await deploy();
    // NOTE: attester NOT added
    const r = await signRecord(c, attester, author);
    await expect(c.connect(author).seal(
      fixture.conversationId, fixture.model,
      r.promptHash, r.responseHash, r.plaintextHash, r.ciphertextHash,
      fixture.arweaveCid, r.sig
    )).to.be.revertedWithCustomError(c, 'UntrustedAttester').withArgs(attester.address);
  });

  it('rejects a signature produced for a different author', async () => {
    const { c, owner, attester, author, stranger } = await deploy();
    await c.connect(owner).addAttester(attester.address);

    // attester signs with `author` as the subject
    const r = await signRecord(c, attester, author);

    // but `stranger` tries to submit it
    await expect(c.connect(stranger).seal(
      fixture.conversationId, fixture.model,
      r.promptHash, r.responseHash, r.plaintextHash, r.ciphertextHash,
      fixture.arweaveCid, r.sig
    )).to.be.revertedWithCustomError(c, 'UntrustedAttester');
  });

  it('rejects empty Arweave CID', async () => {
    const { c, owner, attester, author } = await deploy();
    await c.connect(owner).addAttester(attester.address);
    const r = await signRecord(c, attester, author);
    await expect(c.connect(author).seal(
      fixture.conversationId, fixture.model,
      r.promptHash, r.responseHash, r.plaintextHash, r.ciphertextHash,
      '', r.sig
    )).to.be.revertedWithCustomError(c, 'EmptyCid');
  });

  it('indexes by conversationId and paginates via recordsPage()', async () => {
    const { c, owner, attester, author } = await deploy();
    await c.connect(owner).addAttester(attester.address);

    for (let i = 0; i < 3; i++) {
      const r = await signRecord(c, attester, author);
      await c.connect(author).seal(
        fixture.conversationId, fixture.model,
        r.promptHash, r.responseHash, r.plaintextHash, r.ciphertextHash,
        fixture.arweaveCid, r.sig
      );
    }
    expect(await c.totalRecords()).to.equal(3n);
    const ids = await c.recordIdsIn(fixture.conversationId);
    expect(ids.length).to.equal(3);

    const page = await c.recordsPage(1, 10);
    expect(page.length).to.equal(2);
    expect(page[0].author).to.equal(author.address);
  });

  it('transferOwnership works and locks out the old owner', async () => {
    const { c, owner, stranger } = await deploy();
    await expect(c.connect(owner).transferOwnership(stranger.address))
      .to.emit(c, 'OwnerTransferred');
    expect(await c.owner()).to.equal(stranger.address);
    await expect(c.connect(owner).addAttester(owner.address))
      .to.be.revertedWithCustomError(c, 'NotOwner');
  });
});
