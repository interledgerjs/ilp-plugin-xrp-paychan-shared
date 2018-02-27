/* global describe, it, before, beforeEach, afterEach */
'use strict'

const createTxSubmitter = require('../lib/tx-submitter.js')
const sinon = require('sinon')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const assert = chai.assert
chai.use(chaiAsPromised)

const RippleAPI = require('ripple-lib').RippleAPI
const fixtures = require('./data/transactions.json')

describe('Tx Submitter', function () {
  before(async () => {
    this.createtx = fixtures.createtx
    this.fundtx = fixtures.fundtx
    this.claimtx = fixtures.claimtx

    this.address = 'rp7DvVASpusXHMsrTmDSkaCqc2Nqerbc6Z'
    this.secret = 'sh3gWYq1qEkZrJBFfbEZ468aca1ub'
    this.api = new RippleAPI({server: 'wss://s.altnet.rippletest.net:51233'})
    await this.api.connect()
  })

  describe('instantiation', () => {
    it('is a singleton', () => {
      const txSubmitter1 = createTxSubmitter(this.api, this.address, this.secret)
      const txSubmitter2 = createTxSubmitter(this.api, this.address, this.secret)
      assert.strictEqual(txSubmitter1, txSubmitter2, 'txSubmitter expected to be a singleton')
    })

    it('returns a function', () => {
      const txSubmitter = createTxSubmitter(this.api, this.address, this.secret)
      assert.isFunction(txSubmitter)
    })
  })

  describe('submission', () => {
    before(() => {
      this.stub = sinon.stub(this.api, 'submit').resolves()
    })

    beforeEach(async () => {
      this.submitter = createTxSubmitter(this.api, this.address, this.secret)
    })

    afterEach(() => {
      this.stub.reset()
    })

    it('prepares and submits a create tx', async () => {
      const {paymentChannelCreate, instructions} = fixtures.createtx
      await this.submitter('preparePaymentChannelCreate', paymentChannelCreate, instructions)
      assert(this.stub.calledOnce)
    })

    it('prepares and submits a fund tx', async () => {
      const {paymentChannelFund, instructions} = fixtures.fundtx
      await this.submitter('preparePaymentChannelFund', paymentChannelFund, instructions)
      assert(this.stub.calledOnce)
    })

    it('prepares and submits a claim tx', async () => {
      const {paymentChannelClaim, instructions} = fixtures.claimtx
      await this.submitter('preparePaymentChannelClaim', paymentChannelClaim, instructions)
      assert(this.stub.calledOnce)
    })

    it('prepares and submits a payment tx', async () => {
      const {payment, instructions} = fixtures.paymenttx
      await this.submitter('preparePayment', payment, instructions)
      assert(this.stub.calledOnce)
    })

    it('tx submission is atomic', async () => {
      const spy = sinon.spy(this.api, 'sign')
      const realFund = this.api.preparePaymentChannelFund
      const preparePaymentChannelFund = async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        return realFund.call(this.api, ...args)
      }
      this.api.preparePaymentChannelFund = preparePaymentChannelFund

      await this.submitter('preparePaymentChannelFund',
        this.fundtx.paymentChannelFund, this.fundtx.instructions)
      await this.submitter('preparePaymentChannelClaim',
        this.claimtx.paymentChannelClaim, this.claimtx.instructions)

      const parseTxType = (nthCall) => JSON.parse(nthCall.args[0]).TransactionType
      assert.strictEqual(parseTxType(spy.firstCall), 'PaymentChannelFund')
      assert.strictEqual(parseTxType(spy.secondCall), 'PaymentChannelClaim')
    })
  })
})
