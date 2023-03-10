import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

describe("MerkleVault", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployContractFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount, proposer, validator] =
      await ethers.getSigners();

    const MerkleVault = await ethers.getContractFactory("MerkleVault");
    const TestCoin = await ethers.getContractFactory("TestCoin");
    const merkleVault = await MerkleVault.deploy(
      proposer.address,
      validator.address
    );
    const testCoin = await TestCoin.deploy();

    await merkleVault.setAllowedToken(testCoin.address, true);

    return { merkleVault, testCoin, owner, otherAccount, proposer, validator };
  }

  describe("Deployment", function () {
    it("Should deploy with zero balance", async function () {
      const { merkleVault, testCoin } = await loadFixture(
        deployContractFixture
      );

      expect(await merkleVault.balance(testCoin.address)).to.equal(0);
    });
  });

  it("Should allow deposit", async function () {
    const { merkleVault, testCoin, owner, otherAccount } = await loadFixture(
      deployContractFixture
    );

    await testCoin.mint(otherAccount.address, 1 * 1e8);

    await testCoin.connect(otherAccount).approve(merkleVault.address, 1 * 1e8);
    expect(
      await merkleVault
        .connect(otherAccount)
        .depositToken(testCoin.address, 1 * 1e8)
    )
      .to.emit(merkleVault, "NewDeposit")
      .withArgs(testCoin.address, otherAccount.address, 1 * 1e8);

    expect(await merkleVault.balance(testCoin.address)).to.equal(1 * 1e8);
  });

  it("Should allow deposits", async function () {
    const { merkleVault, testCoin, owner, otherAccount } = await loadFixture(
      deployContractFixture
    );

    await testCoin.mint(otherAccount.address, 1 * 1e8);
    await testCoin.mint(owner.address, 1 * 1e8);

    await testCoin.connect(otherAccount).approve(merkleVault.address, 1 * 1e8);
    expect(
      await merkleVault
        .connect(otherAccount)
        .depositToken(testCoin.address, 1 * 1e8)
    )
      .to.emit(merkleVault, "NewDeposit")
      .withArgs(testCoin.address, otherAccount.address, 1 * 1e8);

    await testCoin.approve(merkleVault.address, 1 * 1e8);
    expect(await merkleVault.depositToken(testCoin.address, 1 * 1e8))
      .to.emit(merkleVault, "NewDeposit")
      .withArgs(testCoin.address, otherAccount.address, 1 * 1e8);

    expect(await merkleVault.balance(testCoin.address)).to.equal(2 * 1e8);
  });

  it("Should allow post of merkle root", async function () {
    const { merkleVault, testCoin, owner, otherAccount, proposer, validator } =
      await loadFixture(deployContractFixture);

    await testCoin.mint(otherAccount.address, 1 * 1e8);
    await testCoin.mint(owner.address, 1 * 1e8);

    await testCoin.connect(otherAccount).approve(merkleVault.address, 1 * 1e8);
    expect(
      await merkleVault
        .connect(otherAccount)
        .depositToken(testCoin.address, 1 * 1e8)
    )
      .to.emit(merkleVault, "NewDeposit")
      .withArgs(testCoin.address, otherAccount.address, 1 * 1e8);

    await testCoin.approve(merkleVault.address, 1 * 1e8);
    expect(await merkleVault.depositToken(testCoin.address, 1 * 1e8))
      .to.emit(merkleVault, "NewDeposit")
      .withArgs(testCoin.address, otherAccount.address, 1 * 1e8);

    expect(await merkleVault.balance(testCoin.address)).to.equal(2 * 1e8);

    const values = [
      [0, testCoin.address, owner.address, 1e4],
      [1, testCoin.address, otherAccount.address, 1e4],
    ];

    const tree = StandardMerkleTree.of(values, [
      "uint256",
      "address",
      "address",
      "uint256",
    ]);

    const dateInSecs = Math.floor(new Date().getTime() / 1000);

    await merkleVault
      .connect(proposer)
      .proposeRoot(
        tree.root,
        1,
        dateInSecs,
        "0x01701220",
        "0xd429550056530f9752a818e902f5803517f7260ed045ad7752bcc828faeea122"
      );

    await merkleVault.connect(validator).validateRoot(1);

    const root = await merkleVault.merkleRoots(1);
    expect(root.merkleRoot).to.equal(tree.root);
  });

  it("Should allow withdrawals based on merkle proof", async function () {
    const { merkleVault, testCoin, owner, otherAccount, proposer, validator } =
      await loadFixture(deployContractFixture);

    await testCoin.mint(otherAccount.address, 1 * 1e8);
    await testCoin.mint(owner.address, 1 * 1e8);

    await testCoin.connect(otherAccount).approve(merkleVault.address, 1 * 1e8);
    expect(
      await merkleVault
        .connect(otherAccount)
        .depositToken(testCoin.address, 1 * 1e8)
    )
      .to.emit(merkleVault, "NewDeposit")
      .withArgs(testCoin.address, otherAccount.address, 1 * 1e8);

    await testCoin.approve(merkleVault.address, 1 * 1e8);
    expect(await merkleVault.depositToken(testCoin.address, 1 * 1e8))
      .to.emit(merkleVault, "NewDeposit")
      .withArgs(testCoin.address, otherAccount.address, 1 * 1e8);

    expect(await merkleVault.balance(testCoin.address)).to.equal(2 * 1e8);

    const values = [
      [0, testCoin.address, owner.address, 1e4],
      [1, testCoin.address, otherAccount.address, 1e4],
    ];

    const tree = StandardMerkleTree.of(values, [
      "uint256",
      "address",
      "address",
      "uint256",
    ]);

    const dateInSecs = Math.floor(new Date().getTime() / 1000);

    await merkleVault
      .connect(proposer)
      .proposeRoot(
        tree.root,
        1,
        dateInSecs,
        "0x01701220",
        "0xd429550056530f9752a818e902f5803517f7260ed045ad7752bcc828faeea122"
      );

    await merkleVault.connect(validator).validateRoot(1);

    const root = await merkleVault.merkleRoots(1);

    expect(root.merkleRoot).to.equal(tree.root);

    for (const [i, v] of tree.entries()) {
      const proof = tree.getProof(i);

      const a: string = v[2].toString();

      expect(await testCoin.connect(a).balanceOf(a)).to.equal(0);

      await merkleVault.withdraw(a, testCoin.address, 1, v[0], 1 * 1e4, proof);

      expect(await testCoin.connect(a).balanceOf(a)).to.equal(1 * 1e4);
    }
  });

  it("Should not allow withdrawals more than once", async function () {
    const { merkleVault, testCoin, owner, otherAccount, proposer, validator } =
      await loadFixture(deployContractFixture);

    await testCoin.mint(otherAccount.address, 1 * 1e8);
    await testCoin.mint(owner.address, 1 * 1e8);

    await testCoin.connect(otherAccount).approve(merkleVault.address, 1 * 1e8);
    expect(
      await merkleVault
        .connect(otherAccount)
        .depositToken(testCoin.address, 1 * 1e8)
    )
      .to.emit(merkleVault, "NewDeposit")
      .withArgs(testCoin.address, otherAccount.address, 1 * 1e8);

    await testCoin.approve(merkleVault.address, 1 * 1e8);
    expect(await merkleVault.depositToken(testCoin.address, 1 * 1e8))
      .to.emit(merkleVault, "NewDeposit")
      .withArgs(testCoin.address, otherAccount.address, 1 * 1e8);

    expect(await merkleVault.balance(testCoin.address)).to.equal(2 * 1e8);

    const values = [
      [0, testCoin.address, owner.address, 1e4],
      [1, testCoin.address, otherAccount.address, 1e4],
    ];

    const tree = StandardMerkleTree.of(values, [
      "uint256",
      "address",
      "address",
      "uint256",
    ]);

    const dateInSecs = Math.floor(new Date().getTime() / 1000);

    await merkleVault
      .connect(proposer)
      .proposeRoot(
        tree.root,
        1,
        dateInSecs,
        "0x01701220",
        "0xd429550056530f9752a818e902f5803517f7260ed045ad7752bcc828faeea122"
      );

    await merkleVault.connect(validator).validateRoot(1);

    const root = await merkleVault.merkleRoots(1);

    expect(root.merkleRoot).to.equal(tree.root);

    for (const [i, v] of tree.entries()) {
      const proof = tree.getProof(i);

      const a: string = v[2].toString();

      expect(await testCoin.connect(a).balanceOf(a)).to.equal(0);

      await merkleVault.withdraw(a, testCoin.address, 1, v[0], 1 * 1e4, proof);

      expect(await testCoin.connect(a).balanceOf(a)).to.equal(1 * 1e4);

      await expect(
        merkleVault.withdraw(a, testCoin.address, 1, v[0], 1 * 1e4, proof)
      ).to.be.to.be.revertedWithCustomError(merkleVault, "AlreadyClaimed");
    }

    expect(await merkleVault.balance(testCoin.address)).to.equal(
      2 * 1e8 - 2 * 1e4
    );
  });
});
