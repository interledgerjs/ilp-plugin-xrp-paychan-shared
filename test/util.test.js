/* global describe, it, beforeEach, afterEach */
'use strict'

const Util = require('../lib/util.js')
const sinon = require('sinon')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const assert = chai.assert
chai.use(chaiAsPromised)

describe('Util', () => {
  describe('toU32BE', () => {
    it('should write a 32-bit integer', () => {
      assert.deepEqual(Util.toU32BE('100'), Buffer.from([ 0, 0, 0, 100 ]))
    })

    it('should throw an error if too low', () => {
      assert.throws(() => Util.toU32BE('-1'), /number out of range for u32/)
    })

    it('should throw an error if too high', () => {
      assert.throws(() => Util.toU32BE('4294967296'), /number out of range for u32/)
    })
  })

  describe('toU64BE', () => {
    it('should write a 64-bit integer', () => {
      assert.deepEqual(Util.toU64BE('4294967296'), Buffer.from([ 0, 0, 0, 1, 0, 0, 0, 0 ]))
    })

    it('should throw an error if too low', () => {
      assert.throws(() => Util.toU64BE('-1'), /number out of range for u64/)
    })

    it('should throw an error if too high', () => {
      assert.throws(() => Util.toU64BE('18446744073709551616'), /number out of range for u64/)
    })
  })

  describe('fromU32BE', () => {
    it('should read a 32-bit integer', () => {
      assert.equal(Util.fromU32BE(Buffer.from([ 0, 0, 0, 100 ])).toNumber(), 100)
    })
  })

  describe('encodeClaim', () => {
    it('should encode a claim', () => {
      assert.deepEqual(Util.encodeClaim(100, Buffer.alloc(32)), Buffer.concat([
        Buffer.from('CLM\0'),
        Buffer.alloc(32),
        Buffer.from([ 0, 0, 0, 0, 0, 0, 0, 100 ])
      ]))
    })

    it('should not encode a claim for a malformed amount', () => {
      assert.throws(() => Util.encodeClaim('1e5', Buffer.alloc(32)),
        /amount is not a valid xrp amount./)
    })
  })
})
