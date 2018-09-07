/* global describe, it, before, beforeEach, afterEach */
'use strict'

const createTxSubmitter = require('../lib/tx-submitter.js')
const sinon = require('sinon')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const assert = chai.assert
chai.use(chaiAsPromised)

const RippleAPI = require('ripple-lib').RippleAPI
const Store = require('ilp-store-memory')
const fixtures = require('./data/transactions.json')

// TODO fix two broken tests
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
    it('one txSubmitter per address', () => {
      const txSubmitter1 = createTxSubmitter(this.api, this.address, this.secret, new Store())
      const txSubmitter2 = createTxSubmitter(this.api, this.address, this.secret, new Store())
      assert.strictEqual(txSubmitter1, txSubmitter2, 'txSubmitter expected to be a singleton')
    })

    it('returns an instance of TxSubmitter', () => {
      const txSubmitter = createTxSubmitter(this.api, this.address, this.secret, new Store())
      assert.isObject(txSubmitter)
    })

    it('makes two submitters for different addresses', () => {
      const txSubmitter1 = createTxSubmitter(this.api, this.address, this.secret, new Store())

      const otherAddress = 'rNtnt7i1LXjyHLrmFQMA4F6CxvY57Est5T'
      const otherSecret = 'ssJimN41FfXoucWshFiMiAfcseE5o'
      const otherApi = new RippleAPI({server: 'wss://s.altnet.rippletest.net:51233'})
      const txSubmitter2 = createTxSubmitter(otherApi, otherAddress, otherSecret, new Store())

      const sym = Symbol.for('ilp-plugin-xrp-paychan-shared-txsubmitter')
      assert.strictEqual(global[sym][this.address], txSubmitter1, 'submitter should be stored')
      assert.strictEqual(global[sym][otherAddress], txSubmitter2, 'submitter should be stored')
    })
  })

  describe('submission', () => {
    before(() => {
      this.realSign = this.api.sign.bind(this.api)
      this.signStub = sinon.stub(this.api, 'sign')
      this.submitStub = sinon.stub(this.api, 'submit')
    })

    beforeEach(async () => {
      this.signStub.callsFake((...args) => {
        const signed = this.realSign(...args)
        this.LastLedgerSequence = JSON.parse(args[0]).LastLedgerSequence
        this.txId = signed.id
        return signed
      })
      this.submitResult = {
        resultCode: 'tesSUCCESS',
        resultMessage: 'all good'
      }
      this.transactionResult = 'tesSUCCESS'
      this.submitStub.callsFake(async () => {
        setImmediate(() => { // tx submission is stubbed out, call listener manually
          const listenerFn = this.api.connection.listeners('transaction')[0]
          listenerFn({
            transaction: {
              hash: this.txId,
              LastLedgerSequence: this.LastLedgerSequence
            },
            meta: { TransactionResult: this.transactionResult },
            validated: true
          })
        })

        return this.submitResult
      })
      this.submitter = createTxSubmitter(this.api, this.address, this.secret, new Store())
    })

    afterEach(() => {
      this.signStub.reset()
      this.submitStub.reset()
    })

    it('prepares and submits a create tx', async () => {
      const spy = sinon.spy(this.api, 'preparePaymentChannelCreate')
      const {paymentChannelCreate, instructions} = fixtures.createtx
      await this.submitter.submit('preparePaymentChannelCreate', paymentChannelCreate, instructions)
      assert(spy.calledOnce)
      assert(this.signStub.calledOnce)
      assert(this.submitStub.calledOnce)
    })

    it('prepares and submits a fund tx', async () => {
      const spy = sinon.spy(this.api, 'preparePaymentChannelFund')
      const {paymentChannelFund, instructions} = fixtures.fundtx
      await this.submitter.submit('preparePaymentChannelFund', paymentChannelFund, instructions)
      assert(spy.calledOnce)
      assert(this.signStub.calledOnce)
      assert(this.submitStub.calledOnce)
    })

    it('prepares and submits a claim tx', async () => {
      const spy = sinon.spy(this.api, 'preparePaymentChannelClaim')
      const {paymentChannelClaim, instructions} = fixtures.claimtx
      await this.submitter.submit('preparePaymentChannelClaim', paymentChannelClaim, instructions)
      assert(spy.calledOnce)
      assert(this.signStub.calledOnce)
      assert(this.submitStub.calledOnce)
    })

    it('prepares and submits a payment tx', async () => {
      const spy = sinon.spy(this.api, 'preparePayment')
      const {payment, instructions} = fixtures.paymenttx
      await this.submitter.submit('preparePayment', payment, instructions)
      assert(spy.calledOnce)
      assert(this.signStub.calledOnce)
      assert(this.submitStub.calledOnce)
    })

    it('tx submission is atomic', async () => {
      const realFund = this.api.preparePaymentChannelFund
      const preparePaymentChannelFund = async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        return realFund.call(this.api, ...args)
      }
      this.api.preparePaymentChannelFund = preparePaymentChannelFund

      await this.submitter.submit('preparePaymentChannelFund',
        this.fundtx.paymentChannelFund, this.fundtx.instructions)
      await this.submitter.submit('preparePaymentChannelClaim',
        this.claimtx.paymentChannelClaim, this.claimtx.instructions)

      const parseTxType = (nthCall) => JSON.parse(nthCall.args[0]).TransactionType
      assert.strictEqual(parseTxType(this.signStub.firstCall), 'PaymentChannelFund')
      assert.strictEqual(parseTxType(this.signStub.secondCall), 'PaymentChannelClaim')
    })

    it('persists a tx before submitting it', async () => {
      const realSubmit = this.submitter._api.submit
      this.submitter._api.submit = async (...args) => {
        const tx = await this.submitter._store.get(this.txId)
        assert.isString(tx, 'expected tx to be persisted before submission')
        return realSubmit(...args)
      }

      const {paymentChannelCreate, instructions} = fixtures.createtx
      await this.submitter.submit('preparePaymentChannelCreate', paymentChannelCreate, instructions)
    })

    describe('tx verification', () => {
      it('resolves if tx was included in a validated ledger', async () => {
        const {paymentChannelCreate, instructions} = fixtures.createtx
        return assert.isFulfilled(this.submitter.submit('preparePaymentChannelCreate',
          paymentChannelCreate, instructions))
      })

      it('rejects if tx fails', () => {
        this.transactionResult = 'tefEXCEPTION'
        const {paymentChannelCreate, instructions} = fixtures.createtx
        return assert.isRejected(this.submitter.submit('preparePaymentChannelCreate',
          paymentChannelCreate, instructions), 'tx failed')
      })

      it('deletes a tx from store if tx succeded', async () => {
        const {paymentChannelCreate, instructions} = fixtures.createtx
        await this.submitter.submit('preparePaymentChannelCreate', paymentChannelCreate, instructions)

        const tx = await this.submitter._store.get(this.txId)
        assert.isUndefined(tx, 'expected tx to be removed from store')
      })

      it('deletes a tx from store if tx failed', async () => {
        this.transactionResult = 'tefEXCEPTION'
        const {paymentChannelCreate, instructions} = fixtures.createtx
        await assert.isRejected(this.submitter.submit('preparePaymentChannelCreate',
          paymentChannelCreate, instructions), 'tx failed')

        const tx = await this.submitter._store.get(this.txId)
        assert.isUndefined(tx, 'expected tx to be removed from store')
      })

      describe('queries ledger if LastLedgerSequence is reached', () => {
        before(() => {
          sinon.stub(this.api.connection, 'hasLedgerVersion').resolves(true)
          this.getTransactionStub = sinon.stub(this.api, 'getTransaction')
        })

        beforeEach(() => {
          this.submitStub.callsFake(async () => {
            setImmediate(() => { // submission is stubbed out, call the ledgerClosed listener manually
              const listeners = this.api.connection.listeners('ledgerClosed')
              const lastListener = listeners[listeners.length - 1]
              lastListener({ledger: { ledger_index: this.LastLedgerSequence }})
            })
            return this.submitResult
          })

          const {payment, instructions} = fixtures.paymenttx
          this.paymentOpts = payment
          this.paymentInstructions = instructions
        })

        it('resolves if tx was succesful', () => {
          this.timeout(3000)
          this.getTransactionStub.resolves({outcome: {result: 'tesSUCCESS'}})
          return this.submitter.submit('preparePayment', this.paymentOpts, this.paymentInstructions)
        })

        it('rejects if tx not found', () => {
          this.timeout(3000)
          this.getTransactionStub.rejects(new this.api.errors.NotFoundError())
          return assert.isRejected(this.submitter.submit('preparePayment', this.paymentOpts,
            this.paymentInstructions), 'Not found')
        })

        it('queries alternative rippled on MissingLedgerHistoryError', async () => {
          const connectStub = sinon.stub(this.submitter._altApi, 'connect').resolves()
          const disconnectStub = sinon.stub(this.submitter._altApi, 'disconnect').resolves()
          const stub = sinon.stub(this.submitter._altApi, 'getTransaction').resolves({outcome: {result: 'tesSUCCESS'}})
          this.getTransactionStub.rejects(new this.api.errors.MissingLedgerHistoryError())

          await this.submitter.submit('preparePayment', this.paymentOpts, this.paymentInstructions)

          assert(stub.calledOnce)
          assert(connectStub.called)
          assert(disconnectStub.called)
        })
      })
    })
  })
})
