'use strict'

const EventEmitter2 = require('eventemitter2').EventEmitter2
const assert = require('assert')
const debug = require('debug')('ilp-xrp-channel-watcher')

class ChannelWatcher extends EventEmitter2 {
  constructor (pollInterval, rippleApi) {
    assert(pollInterval, 'pollInterval is required')
    assert(rippleApi, 'rippleApi is required')

    super()
    this.pollInterval = parseInt(pollInterval)
    this.channelIds = new Set()
    this.api = rippleApi

    this._start()
  }

  _emitChannelClose (channelId, paychan) {
    const closesAt = paychan.expiration || paychan.cancelAfter
    debug(`channel ${channelId} closes at ${closesAt}`)
    this.emit('channelClose', channelId, closesAt)
  }

  _start () {
    setInterval(() => {
      debug('checking channels for expiry')
      this.channelIds.forEach(async (id) => {
        try {
          await this._handleChannelExpiry(id)
        } catch (err) {
          // TODO: retry?
          debug(`Error checking if channel ${id} is closing.`, err)
        }
      })
    }, this.pollInterval)
  }

  async _handleChannelExpiry (channelId) {
    const paychan = await this._lookupChannel(channelId)
    if (paychan.expiration || paychan.cancelAfter) {
      this._emitChannelClose(channelId, paychan)
      this.channelIds.delete(channelId)
    }
  }

  async _lookupChannel (channelId) {
    let paychan
    try {
      await this.api.connect()
      paychan = await this.api.getPaymentChannel(channelId)
    } catch (err) {
      if (err.message === 'entryNotFound') {
        throw new Error(`Channel ${channelId} does not exist`)
      } else {
        throw new Error(`Unexpected error looking up details for channel ${channelId}`)
      }
    }

    return paychan
  }

  async watch (channelId) {
    assert(channelId, 'channelId is required')
    if (this.channelIds.has(channelId)) return

    const paychan = await this._lookupChannel(channelId)
    if (paychan.expiration || paychan.cancelAfter) {
      this._emitChannelClose(channelId, paychan)
    } else {
      if (paychan.settleDelay < this.pollInterval / 1000) {
        throw new Error(`Channel ${channelId} has a settle delay shorter than the configured pollInterval.`)
      } else {
        this.channelIds.add(channelId)
        debug(`watching paychan ${channelId}`)
      }
    }
  }
}

module.exports = ChannelWatcher
