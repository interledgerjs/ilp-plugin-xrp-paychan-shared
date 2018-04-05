'use strict' /* eslint-env mocha */

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const assert = chai.assert
chai.use(chaiAsPromised)

const Factory = require('../lib/transaction-factory')
const Store = require('ilp-store-memory')

describe('transaction factory test suite', function () {
  beforeEach(function () {
    this.opts = {store: new Store()}
    this.createParams = {
      id: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      details: 'JSON string with tx details'
    }
    this.otherCreateParams = {
      id: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      details: 'JSON string with tx details'
    }

    this.assertTx = (tx, expected) => {
      assert.strictEqual(tx.getId(), expected.id)
      assert.strictEqual(tx.getDetails(), expected.details)
      assert.strictEqual(tx.isPending(), true)
      assert.strictEqual(tx._store, this.opts.store)
    }
  })

  describe('constructor', function () {
    it('instantiates an object', function () {
      assert.isObject(new Factory(this.opts))
    })
  })

  describe('create', function () {
    beforeEach(function () {
      this.factory = new Factory(this.opts)
    })

    it('returns an transaction object', async function () {
      const tx = await this.factory.create(this.createParams.id, this.createParams.details)
      this.assertTx(tx, this.createParams)
    })

    it('throws when trying to create an existing transaction', async function () {
      const tx = await this.factory.create(this.createParams.id, this.createParams.details)
      await tx.save()
      return assert.isRejected(this.factory.create(this.createParams.id, this.createParams.details))
    })
  })

  describe('load', function () {
    beforeEach(function () {
      this.factory = new Factory(this.opts)
    })

    it('returns empty array if there are no pending transactions', async function () {
      const txs = await this.factory.loadAllPending()
      assert.isArray(txs)
      assert.equal(txs.length, 0)
    })

    it('returns all pending transactions', async function () {
      const tx1 = await this.factory.create(this.createParams.id, this.createParams.details)
      const tx2 = await this.factory.create(this.otherCreateParams.id, this.otherCreateParams.details)
      await tx1.save()
      await tx2.save()

      const txs = await this.factory.loadAllPending()
      assert.isArray(txs)
      assert.equal(txs.length, 2)
      this.assertTx(txs[0], this.createParams)
      this.assertTx(txs[1], this.otherCreateParams)
    })
  })
})
