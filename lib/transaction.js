'use strict'

const assert = require('assert')

const writeQueue = Promise.resolve()

class Transaction {
  constructor ({id, details, pending, store}) {
    assert(typeof store === 'object', 'parameter store must be object')
    this._store = store

    this.setId(id)
    this.setDetails(details)
    this.setPending(pending)
  }

  getId () {
    return this._id
  }

  setId (id) {
    assert(typeof id === 'string', 'parameter id must be string')
    assert(/^[0-9A-F]{64}$/i.test(id), 'parameter id must be payment channel id')
    this._id = id
  }

  getDetails () {
    return this._details
  }

  setDetails (details) {
    assert(typeof details === 'string', 'parameter details must be string')
    this._details = details
  }

  isPending () {
    return this._pending
  }

  setPending (pending) {
    assert(typeof pending === 'boolean', 'parameter pending must be boolean')
    this._pending = pending
  }

  async save () {
    if (!this._store) return

    await new Promise((resolve, reject) => {
      writeQueue.then(async () => {
        try {
          await this._savePending()
          await this._store.put(this._id, this._details)
          resolve()
        } catch (err) { reject(err) }
      })
    })
  }

  async delete () {
    if (!this._store) return

    await new Promise((resolve, reject) => {
      writeQueue.then(async () => {
        try {
          await this._store.del(this._id)
          await this._deletePending()
          resolve()
        } catch (err) { reject(err) }
      })
    })
  }

  async _savePending () {
    const pending = await this._store.get('tx-submitter:pending') || ''

    if (pending.indexOf(this._id) >= 0) return // nothing to add, is already pending
    const newPending = (pending.length > 0) ? pending + ':' + this._id : this._id
    await this._store.put('tx-submitter:pending', newPending)
  }

  async _deletePending () {
    const pending = await this._store.get('tx-submitter:pending') || ''

    if (pending.indexOf(this._id) === -1) return // nothing to delete, is not pending
    let newPending = (pending.indexOf(this._id) !== 0)
                        ? pending.replace(':' + this._id, '')
                        : pending.replace(this._id, '')
    newPending = (newPending[0] === ':')
                  ? newPending.slice(1)
                  : newPending

    await this._store.put('tx-submitter:pending', newPending)
  }
}

module.exports = Transaction
