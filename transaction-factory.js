'use strict'

const Transaction = require('./transaction')

class TransactionFactory {
  constructor ({store}) {
    this._store = store
  }

  async create ({id, details, pending}) {
    // if id exists load from store, otherwise new object
    const tx = new Transaction({id, details, pending, store: this._store})
    await tx.save()
    return tx
  }

  // createAllPending () {
  //   await this._store.get('tx-submitter:pending')
  // }
}

module.exports = TransactionFactory
