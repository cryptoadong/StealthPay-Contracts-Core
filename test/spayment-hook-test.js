const { ethers, web3, artifacts } = require('hardhat');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { argumentBytes } = require('./sample-data');
const { signMetaWithdrawal } = require('./utils');

const StealthPay = artifacts.require('StealthPay');
const ERC20Token = artifacts.require('ERC20Token');
const MockHook = artifacts.require('MockHook');
const { toWei, fromWei } = web3.utils; // eslint-disable-line @typescript-eslint/unbound-method
const AddressZero = ethers.constants.AddressZero;

describe('StealthPay Hooks', () => {
  const ctx = {};
  let owner, sender, receiver, acceptor, relayer;

  // amount that will be configured as the eth toll
  const toll = toWei('0.01', 'ether');

  // token fee the relayer will charge for meta-tx withdrawal
  const relayerTokenFee = toWei('2', 'ether');

  // The ethers wallet that will be used when testing meta tx withdrawals
  const metaWallet = ethers.Wallet.createRandom();

  // helper function to mint test tokens
  const mintToken = async (toAddr, amount) => {
    await ctx.token.mint(toAddr, toWei(amount));
  };

  // helper function to send test tokens to stealth address
  const sendToken = async (fromAddr, stealthAddr, amount) => {
    const toll = await ctx.StealthPay.toll();
    const weiAmount = toWei(amount);

    await ctx.token.approve(ctx.StealthPay.address, weiAmount, { from: fromAddr });

    await ctx.StealthPay.sendToken(stealthAddr, ctx.token.address, weiAmount, ...argumentBytes, {
      from: fromAddr,
      value: toll,
    });
  };

  // helper function to mint and send tokens to steatlh address
  const mintAndSendToken = async (fromAddr, stealthAddr, amount) => {
    await mintToken(fromAddr, amount);
    await sendToken(fromAddr, stealthAddr, amount);
  };

  before(async () => {
    [owner, sender, receiver, acceptor, relayer] = await web3.eth.getAccounts();
    ctx.chainId = await web3.eth.getChainId();
  });

  beforeEach(async () => {
    ctx.StealthPay = await StealthPay.new(toll, owner, owner, { from: owner });
    ctx.token = await ERC20Token.new('ERC20Token', 'TT');
    ctx.hook = await MockHook.new();
  });

  it('should see the deployed StealthPay contract', () => {
    expect(ctx.StealthPay.address.startsWith('0x')).to.be.true;
    expect(ctx.StealthPay.address.length).to.equal(42);
    expect(ctx.token.address.startsWith('0x')).to.be.true;
    expect(ctx.token.address.length).to.equal(42);
    expect(ctx.hook.address.startsWith('0x')).to.be.true;
    expect(ctx.hook.address.length).to.equal(42);
  });

  describe('Direct withdrawal + hooks', () => {
    it('should call the hook contract when the stealth receiver withdraws directly', async () => {
      await mintAndSendToken(sender, receiver, '100');

      await ctx.StealthPay.withdrawTokenAndCall(acceptor, ctx.token.address, ctx.hook.address, '0xbeefc0ffee', {
        from: receiver,
      });

      const callData = await ctx.hook.lastCallData();

      expect(fromWei(callData.amount)).to.equal('100');
      expect(callData.stealthAddr).to.equal(receiver);
      expect(callData.acceptor).to.equal(acceptor);
      expect(callData.tokenAddr).to.equal(ctx.token.address);
      expect(callData.sponsor).to.equal(AddressZero);
      expect(fromWei(callData.sponsorFee)).to.equal('0');
      expect(callData.data).to.equal('0xbeefc0ffee');

      const balance = await ctx.token.balanceOf(acceptor);
      expect(fromWei(balance)).to.equal('100');
    });

    it('should call the hook contract when the stealth receiver withdraws directly with empty data', async () => {
      await mintAndSendToken(sender, receiver, '100');

      await ctx.StealthPay.withdrawTokenAndCall(acceptor, ctx.token.address, ctx.hook.address, '0x', {
        from: receiver,
      });

      const callData = await ctx.hook.lastCallData();

      expect(fromWei(callData.amount)).to.equal('100');
      expect(callData.stealthAddr).to.equal(receiver);
      expect(callData.acceptor).to.equal(acceptor);
      expect(callData.tokenAddr).to.equal(ctx.token.address);
      expect(callData.sponsor).to.equal(AddressZero);
      expect(fromWei(callData.sponsorFee)).to.equal('0');
      expect(callData.data).to.equal(null);

      const balance = await ctx.token.balanceOf(acceptor);
      expect(fromWei(balance)).to.equal('100');
    });

    it('should call the hook contract when the stealth receiver withdraws directly to the hook contract', async () => {
      await mintAndSendToken(sender, receiver, '100');

      await ctx.StealthPay.withdrawTokenAndCall(ctx.hook.address, ctx.token.address, ctx.hook.address, '0xbeefc0ffee', {
        from: receiver,
      });

      const callData = await ctx.hook.lastCallData();

      expect(fromWei(callData.amount)).to.equal('100');
      expect(callData.stealthAddr).to.equal(receiver);
      expect(callData.acceptor).to.equal(ctx.hook.address);
      expect(callData.tokenAddr).to.equal(ctx.token.address);
      expect(callData.sponsor).to.equal(AddressZero);
      expect(fromWei(callData.sponsorFee)).to.equal('0');
      expect(callData.data).to.equal('0xbeefc0ffee');

      const balance = await ctx.token.balanceOf(ctx.hook.address);
      expect(fromWei(balance)).to.equal('100');
    });

    it('should not call the hook when the stealth receiver withdraws directly if the hook address is 0', async () => {
      await mintAndSendToken(sender, receiver, '100');

      await ctx.StealthPay.withdrawTokenAndCall(acceptor, ctx.token.address, AddressZero, '0xbeefc0ffee', {
        from: receiver,
      });

      const callData = await ctx.hook.lastCallData();

      // call data in the mock trigger should still be zeroes
      expect(fromWei(callData.amount)).to.equal('0');
      expect(callData.stealthAddr).to.equal(AddressZero);
      expect(callData.acceptor).to.equal(AddressZero);
      expect(callData.tokenAddr).to.equal(AddressZero);
      expect(callData.sponsor).to.equal(AddressZero);
      expect(fromWei(callData.sponsorFee)).to.equal('0');
      expect(callData.data).to.equal(null);

      // the withdrawal transfer should still work
      const balance = await ctx.token.balanceOf(acceptor);
      expect(fromWei(balance)).to.equal('100');
    });
  });

  describe('Meta withdrawal + hooks', () => {
    it('should call the hook contract when the stealth receiver withdraws via meta tx', async () => {
      await mintAndSendToken(sender, metaWallet.address, '100');

      const { v, r, s } = await signMetaWithdrawal(
        metaWallet,
        ctx.chainId,
        ctx.StealthPay.address,
        acceptor,
        ctx.token.address,
        relayer,
        relayerTokenFee,
        ctx.hook.address,
        '0xbeefc0ffee'
      );

      await ctx.StealthPay.withdrawTokenAndCallOnBehalf(
        metaWallet.address,
        acceptor,
        ctx.token.address,
        relayer,
        relayerTokenFee,
        ctx.hook.address,
        '0xbeefc0ffee',
        v,
        r,
        s,
        { from: relayer }
      );

      const callData = await ctx.hook.lastCallData();

      expect(fromWei(callData.amount)).to.equal('98');
      expect(callData.stealthAddr).to.equal(metaWallet.address);
      expect(callData.acceptor).to.equal(acceptor);
      expect(callData.tokenAddr).to.equal(ctx.token.address);
      expect(callData.sponsor).to.equal(relayer);
      expect(fromWei(callData.sponsorFee)).to.equal('2');
      expect(callData.data).to.equal('0xbeefc0ffee');

      const balance = await ctx.token.balanceOf(acceptor);
      expect(fromWei(balance)).to.equal('98');

      const sponsorBalance = await ctx.token.balanceOf(relayer);
      expect(fromWei(sponsorBalance)).to.equal('2');
    });

    it('should call the hook contract when the stealth receiver withdraws via meta tx with empty data', async () => {
      await mintAndSendToken(sender, metaWallet.address, '100');

      const { v, r, s } = await signMetaWithdrawal(
        metaWallet,
        ctx.chainId,
        ctx.StealthPay.address,
        acceptor,
        ctx.token.address,
        relayer,
        relayerTokenFee,
        ctx.hook.address,
        '0x'
      );

      await ctx.StealthPay.withdrawTokenAndCallOnBehalf(
        metaWallet.address,
        acceptor,
        ctx.token.address,
        relayer,
        relayerTokenFee,
        ctx.hook.address,
        '0x',
        v,
        r,
        s,
        { from: relayer }
      );

      const callData = await ctx.hook.lastCallData();

      expect(fromWei(callData.amount)).to.equal('98');
      expect(callData.stealthAddr).to.equal(metaWallet.address);
      expect(callData.acceptor).to.equal(acceptor);
      expect(callData.tokenAddr).to.equal(ctx.token.address);
      expect(callData.sponsor).to.equal(relayer);
      expect(fromWei(callData.sponsorFee)).to.equal('2');
      expect(callData.data).to.equal(null);

      const balance = await ctx.token.balanceOf(acceptor);
      expect(fromWei(balance)).to.equal('98');

      const sponsorBalance = await ctx.token.balanceOf(relayer);
      expect(fromWei(sponsorBalance)).to.equal('2');
    });

    it('should not call the hook if the hook contract is 0 when the stealth receiver withdraws via meta tx', async () => {
      await mintAndSendToken(sender, metaWallet.address, '100');

      const { v, r, s } = await signMetaWithdrawal(
        metaWallet,
        ctx.chainId,
        ctx.StealthPay.address,
        acceptor,
        ctx.token.address,
        relayer,
        relayerTokenFee,
        AddressZero,
        '0xbeefc0ffee'
      );

      await ctx.StealthPay.withdrawTokenAndCallOnBehalf(
        metaWallet.address,
        acceptor,
        ctx.token.address,
        relayer,
        relayerTokenFee,
        AddressZero,
        '0xbeefc0ffee',
        v,
        r,
        s,
        { from: relayer }
      );

      const callData = await ctx.hook.lastCallData();

      // call data in the mock trigger should still be zeroes
      expect(fromWei(callData.amount)).to.equal('0');
      expect(callData.stealthAddr).to.equal(AddressZero);
      expect(callData.acceptor).to.equal(AddressZero);
      expect(callData.tokenAddr).to.equal(AddressZero);
      expect(callData.sponsor).to.equal(AddressZero);
      expect(fromWei(callData.sponsorFee)).to.equal('0');
      expect(callData.data).to.equal(null);

      const balance = await ctx.token.balanceOf(acceptor);
      expect(fromWei(balance)).to.equal('98');

      const sponsorBalance = await ctx.token.balanceOf(relayer);
      expect(fromWei(sponsorBalance)).to.equal('2');
    });

    it('should call the hook contract when the stealth receiver withdraws via meta tx to the hook contract', async () => {
      await mintAndSendToken(sender, metaWallet.address, '100');

      const { v, r, s } = await signMetaWithdrawal(
        metaWallet,
        ctx.chainId,
        ctx.StealthPay.address,
        ctx.hook.address,
        ctx.token.address,
        relayer,
        relayerTokenFee,
        ctx.hook.address,
        '0xbeefc0ffee'
      );

      await ctx.StealthPay.withdrawTokenAndCallOnBehalf(
        metaWallet.address,
        ctx.hook.address,
        ctx.token.address,
        relayer,
        relayerTokenFee,
        ctx.hook.address,
        '0xbeefc0ffee',
        v,
        r,
        s,
        { from: relayer }
      );

      const callData = await ctx.hook.lastCallData();

      expect(fromWei(callData.amount)).to.equal('98');
      expect(callData.stealthAddr).to.equal(metaWallet.address);
      expect(callData.acceptor).to.equal(ctx.hook.address);
      expect(callData.tokenAddr).to.equal(ctx.token.address);
      expect(callData.sponsor).to.equal(relayer);
      expect(fromWei(callData.sponsorFee)).to.equal('2');
      expect(callData.data).to.equal('0xbeefc0ffee');

      const balance = await ctx.token.balanceOf(ctx.hook.address);
      expect(fromWei(balance)).to.equal('98');

      const sponsorBalance = await ctx.token.balanceOf(relayer);
      expect(fromWei(sponsorBalance)).to.equal('2');
    });
  });

  describe('Meta withdrawal + hooks + dishonest relayer', () => {
    it('should fail if the relayer sends the wrong hook address', async () => {
      await mintAndSendToken(sender, metaWallet.address, '100');

      const { v, r, s } = await signMetaWithdrawal(
        metaWallet,
        ctx.chainId,
        ctx.StealthPay.address,
        acceptor,
        ctx.token.address,
        relayer,
        relayerTokenFee,
        ctx.hook.address,
        '0xbeefc0ffee'
      );

      await expectRevert(
        ctx.StealthPay.withdrawTokenAndCallOnBehalf(
          metaWallet.address,
          acceptor,
          ctx.token.address,
          relayer,
          relayerTokenFee,
          ethers.Wallet.createRandom().address, // this should be the hook address
          '0xbeefc0ffee',
          v,
          r,
          s,
          { from: relayer }
        ),
        'StealthPay: Invalid Signature'
      );
    });

    it('should fail if the relayer sends the wrong hook call cata', async () => {
      await mintAndSendToken(sender, metaWallet.address, '100');

      const { v, r, s } = await signMetaWithdrawal(
        metaWallet,
        ctx.chainId,
        ctx.StealthPay.address,
        acceptor,
        ctx.token.address,
        relayer,
        relayerTokenFee,
        ctx.hook.address,
        '0xbeefc0ffee'
      );

      await expectRevert(
        ctx.StealthPay.withdrawTokenAndCallOnBehalf(
          metaWallet.address,
          acceptor,
          ctx.token.address,
          relayer,
          relayerTokenFee,
          ctx.hook.address,
          '0xbeefcafe', // this should be 0xbeefc0ffee
          v,
          r,
          s,
          { from: relayer }
        ),
        'StealthPay: Invalid Signature'
      );
    });
  });
});
