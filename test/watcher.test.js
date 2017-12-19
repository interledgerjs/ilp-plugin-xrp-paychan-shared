/* global describe, it, beforeEach, afterEach */
'use strict'

const ChannelWatcher = require('../lib/watcher.js')
const chans = require('./data/paychans.js')
const sinon = require('sinon')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const assert = chai.assert
chai.use(chaiAsPromised)

describe('ChannelWatcher', function () {
  describe('constructor', function () {
    it('instantiates an object', function () {
      const api = {isConnected: () => true}
      const watcherObj = new ChannelWatcher(99999, api)
      assert.instanceOf(watcherObj, ChannelWatcher)
    })
  })

  describe('watch()', function () {
    beforeEach(() => {
      this.clock = sinon.useFakeTimers({toFake: ['setInterval']})
      this.expectedInterval = 1000 * 60 * 60 // 1 hour
      this.api = {
        connect: () => Promise.resolve(),
        isConnected: () => true,
        getPaymentChannel: async (id) => chans.allPaychans.get(id)
      }
      this.watcher = new ChannelWatcher(this.expectedInterval, this.api)
    })

    afterEach(() => {
      this.clock.restore()
    })

    it('periodically loads channel details from rippled', async () => {
      await this.watcher.watch(chans.paychan.id)
      await this.watcher.watch(chans.anotherPaychan.id)

      const spy = sinon.spy(this.api, 'getPaymentChannel')
      // with each clock.tick the details of the two watched channels should be loaded from rippled
      this.clock.tick(this.expectedInterval)
      await Promise.resolve() // resolve all pending promises
      assert.equal(spy.callCount, 2)
      this.clock.tick(this.expectedInterval)
      await Promise.resolve() // resolve all pending promises
      assert.equal(spy.callCount, 4)
      this.clock.tick(this.expectedInterval)
      await Promise.resolve() // resolve all pending promises
      assert.equal(spy.callCount, 6)
    })

    it('connects api', async () => {
      sinon.spy(this.api, 'connect')
      await this.watcher.watch(chans.paychan.id)
      assert(this.api.connect.called)
    })

    it('throws if channel\'s settle delay is shorter than watcher\'s pollInterval', () => {
      const watcher = new ChannelWatcher(9999999999999, this.api)
      return assert.isRejected(watcher.watch(chans.paychan.id),
        'Channel E30E709CF009A1F26E0E5C48F7AA1BFB79393764F15FB108BDC6E06D3CBD8415 ' +
        'has a settle delay shorter than the configured pollInterval')
    })

    it('emits if channel has .cancelAfter set', async () => {
      const promise = new Promise((resolve) => this.watcher.on('channelClose', resolve))
      await this.watcher.watch(chans.paychanWithCancelAfter.id)
      this.clock.tick(this.expectedInterval)
      return promise
    })

    it('emits if channel has .expiration set', async () => {
      const promise = new Promise((resolve) => this.watcher.on('channelClose', resolve))
      await this.watcher.watch(chans.paychanWithExpiry.id)
      this.clock.tick(this.expectedInterval)
      return promise
    })

    it('emits if peer closes the channel', async () => {
      const promise = new Promise((resolve) => this.watcher.on('channelClose', resolve))
      await this.watcher.watch(chans.paychan.id)
      this.clock.tick(this.expectedInterval)

      // simulate peer closing the channel
      const channelWithExpiration = Object.assign({}, chans.paychan.data, {
        expiration: '2017-12-15T21:00:19.915Z'
      })
      sinon.stub(this.api, 'getPaymentChannel').returns(channelWithExpiration)

      this.clock.tick(this.expectedInterval)
      return promise
    })
  })
})
