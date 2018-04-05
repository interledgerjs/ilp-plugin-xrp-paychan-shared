'use strict' /* eslint-env mocha */

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const assert = chai.assert
chai.use(chaiAsPromised)

const Transaction = require('../lib/transaction')
const Store = require('ilp-store-memory')

describe('transaction test suite', function () {
  beforeEach(function () {
    this.store = new Store()
    this.txOpts = {
      id: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      details: 'JSON string with tx details',
      pending: true,
      store: this.store
    }
  })

  describe('constructor', function () {
    it('initializes fields', function () {
      const tx = new Transaction(this.txOpts)
      assert.strictEqual(tx.getId(), this.txOpts.id)
      assert.strictEqual(tx.getDetails(), this.txOpts.details)
      assert.strictEqual(tx.isPending(), this.txOpts.pending)
      assert.strictEqual(tx._store, this.store)
    })

    it('validates parameter id', function () {
      this.txOpts.id = 'INVALID_ID'
      assert.throws(() => new Transaction(this.txOpts), 'parameter id must be payment channel id')
    })

    it('validates parameter details', function () {
      this.txOpts.details = {}
      assert.throws(() => new Transaction(this.txOpts), 'parameter details must be string')
    })

    it('validates parameter pending', function () {
      this.txOpts.pending = 'not a boolean'
      assert.throws(() => new Transaction(this.txOpts), 'parameter pending must be boolean')
    })

    it('validates parameter store', function () {
      this.txOpts.store = 'not an object'
      assert.throws(() => new Transaction(this.txOpts), 'parameter store must be object')
    })
  })

  describe('save', function () {
    beforeEach(function () {
      this.tx = new Transaction(this.txOpts)
      this.txOpts.id = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
      this.anotherTx = new Transaction(this.txOpts)
    })

    it('saves pending tx id to store', async function () {
      await this.tx.save()
      const actualPending = async () => this.store.get('tx-submitter:pending')
      assert.strictEqual(this.tx.getId(), await actualPending())

      await this.anotherTx.save()
      const expectedPendingIds = this.tx.getId() + ':' + this.anotherTx.getId()
      assert.strictEqual(expectedPendingIds, await actualPending())
    })

    it('saves tx details to the store', async function () {
      await this.tx.save()
      const details = await this.store.get(this.tx.getId())
      assert.strictEqual(this.tx.getDetails(), details)
    })
  })

  describe('delete', function () {
    beforeEach(async function () {
      this.tx = new Transaction(this.txOpts)
      this.txOpts.id = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
      this.anotherTx = new Transaction(this.txOpts)

      await this.tx.save()
      await this.anotherTx.save()
    })

    it('deletes pending tx id from store', async function () {
      const actualPending = async () => this.store.get('tx-submitter:pending')
      await this.tx.delete()
      assert.strictEqual(this.anotherTx.getId(), await actualPending())
      await this.anotherTx.delete()
      assert.strictEqual('', await actualPending())
    })

    it('deletes tx details from the store', async function () {
      await this.tx.delete()
      const details = await this.store.get(this.tx.getId())
      assert.isUndefined(details)
    })
  })
})
