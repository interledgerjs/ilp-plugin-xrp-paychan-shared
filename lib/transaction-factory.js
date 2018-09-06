'use strict'

const Transaction = require('./transaction')
const Store = require('ilp-store-memory')

class TransactionFactory {
  constructor ({store}) {
    if (typeof store === 'object' && typeof store !== 'undefined') {
      this._store = store
    } else {
      this._store = new Store()
    }
  }

  async create (id, details, pending = true) {
    if (await this._store.get(id)) throw new Error(`transaction exists already. id=${id}`)
    return new Transaction({id, details, pending, store: this._store})
  }

  async loadAllPending () {
    const ids = await this._store.get('tx-submitter:pending')
    if (ids) {
      const txs = ids.split(':').map(async id => {
        const details = await this._store.get(id)
        return new Transaction({id, details, pending: true, store: this._store})
      })
      return Promise.all(txs)
    } else {
      return []
    }
  }
}

module.exports = TransactionFactory
