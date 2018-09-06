'use strict'

const assert = require('assert')
const debug = require('debug')('ilp-plugin-xrp-paychan-shared')
const {RippleAPI} = require('ripple-lib')
const TransactionFactory = require('./transaction-factory')

// Alternative rippled server. Uses s2 (full history server)
const ALT_RIPPLED_URL = 'wss://s2.ripple.com'

// WARNING: do not change the string literal 'ilp-plugin-xrp-paychan-shared-txsubmitter'
// It ensures that different versions of this package create only one TxSubmitter instance.
const sym = Symbol.for('ilp-plugin-xrp-paychan-shared-txsubmitter')
const submitterCreated = (address) => {
  if (sym in global) {
    return (address in global[sym])
  }
  global[sym] = {}
  return false
}

const allowedFnNames = [
  'preparePayment',
  'preparePaymentChannelCreate',
  'preparePaymentChannelClaim',
  'preparePaymentChannelFund']

class TxSubmitter {
  constructor (api, address, secret, store) {
    this._apiConnecting = false
    this._api = api
    this._altApi = new RippleAPI({server: ALT_RIPPLED_URL})
    this._address = address
    this._secret = secret

    this._txPipeline = Promise.resolve()
    this._pendingTxPromises = {}
    this._pendingTx = {}
    this._lastLedgerVersion = 1

    this._store = store
    this._txFactory = new TransactionFactory({store: this._store})

    this._addTransactionHandler()
    this._addLedgerClosedHandler()
  }

  _addPendingTx (maxLedgerVersion, txDetails) {
    const transactions = this._pendingTx[maxLedgerVersion] || []
    transactions.push(txDetails) // have the tx object here
    this._pendingTx[maxLedgerVersion] = transactions
  }

  _removePendingTx (maxLedgerVersion, txId) {
    delete this._pendingTxPromises[txId]

    const transactions = this._pendingTx[maxLedgerVersion]
    const txDetails = transactions.find(i => i.tx.getId() === txId)
    if (txDetails) {
      transactions.splice(txDetails, 1)
      const tx = txDetails.tx
      tx.delete().catch(err => debug(`error deleting tx from store. id=${tx.getId()}`, err))
    }
    if (transactions.length === 0) {
      delete this._pendingTx[maxLedgerVersion]
    }
  }

  _removeAllPendingTx (maxLedgerVersion) {
    if (!this._pendingTx[maxLedgerVersion]) return

    this._pendingTx[maxLedgerVersion].forEach(txId => delete this._pendingTxPromises[txId])
    delete this._pendingTx[maxLedgerVersion]
  }

  _addTransactionHandler () {
    this._api.connection.on('transaction', (ev) => {
      if (ev.validated && ev.transaction && this._pendingTxPromises[ev.transaction.hash]) {
        const txId = ev.transaction.hash
        const {resolve, reject} = this._pendingTxPromises[ev.transaction.hash]
        this._removePendingTx(ev.transaction.LastLedgerSequence, ev.transaction.hash)
        if (!ev.meta || !ev.meta.TransactionResult) {
          reject(new Error('Could not determine tx result: ' + JSON.stringify(ev)))
        } else if (ev.meta.TransactionResult !== 'tesSUCCESS') {
          debug(`tx ${txId} failed:`, ev)
          reject(new Error('tx failed: ' + JSON.stringify(ev)))
        } else {
          debug(`tx ${txId} was included in a validated ledger`)
          resolve(ev)
        }
      }
    })
  }

  _addLedgerClosedHandler () {
    this._api.connection.on('ledgerClosed', async (ledger) => {
      this._lastLedgerVersion = ledger.ledger_index

      for (const v of Object.keys(this._pendingTx).map(x => Number(x))) {
        if (await this._api.connection.hasLedgerVersion(v)) {
          // check what happened to the transactions that reached LastLedgerSequence
          for (const {tx, minLedgerVersion} of this._pendingTx[v]) {
            const opts = {minLedgerVersion, maxLedgerVersion: v}
            debug(`Obtaining transaction details for ${tx.getId()}.`)
            try {
              await this._verifyTx(tx.getId(), opts)
            } catch (err) {
              if (err.name === 'MissingLedgerHistoryError') {
                debug(`default rippled instance ${this._api.connection._url} has incomplete ledger history`)
                debug(`querying alternative rippled instance ${ALT_RIPPLED_URL}`)
                await this._verifyTx(tx.getId(), opts, true)
              }
            }
            this._removePendingTx(v, tx.getId())
          }
        }
      }
    })
  }

  async _verifyTx (txId, txOpts, useAltRippled = false) {
    const {resolve, reject} = this._pendingTxPromises[txId]
    const api = (useAltRippled) ? this._altApi : this._api

    try {
      if (useAltRippled) await api.connect()
      const txData = await api.getTransaction(txId, txOpts)
      if (txData.outcome.result === 'tesSUCCESS') {
        debug(`tx ${txId} was included in a validated ledger`)
        resolve(txData)
      } else {
        debug(`tx ${txId} failed. details=${txData}`)
        reject(new Error('transaction submission failed'))
      }
    } catch (err) {
      if (err.name === 'MissingLedgerHistoryError' && !useAltRippled) {
        debug('default rippled has incomplete ledger history')
        throw err // don't reject yet, throwing allows us to query the alt rippled
      } else if (err.name === 'NotFoundError') {
        debug(`tx ${txId} failed. err=${err}`)
        reject(err)
      } else {
        debug(`tx ${txId} failed due to unkown error. err=${err}`)
        reject(err)
      }
    } finally {
      if (useAltRippled) await api.disconnect()
    }
  }

  async _ensureConnected () {
    if (this._api.isConnected() || this._apiConnecting) return

    this._apiConnecting = true
    try {
      await this._api.connect()
      await this._api.connection.request({
        command: 'subscribe',
        accounts: [ this._address ]
      })
      this._addTransactionHandler()
      this._addLedgerClosedHandler()
    } catch (err) {
      debug('could not connect to rippled:', err)
    } finally {
      this._apiConnecting = false
    }
  }

  async submit (fn, ...args) {
    assert(typeof fn === 'string', 'parameter fn must be string')
    assert(allowedFnNames.includes(fn), 'parameter fn must be one of preparePaymentChannel(Create|Fund|Claim) or preparePayment')

    await this._ensureConnected()

    // queue the transaction for submission
    const {tx, instructions, minLedgerVersion, result} = await new Promise((resolve, reject) => {
      this._txPipeline.then(async () => {
        let dbTx
        try {
          const minLedgerVersion = this._lastLedgerVersion
          const tx = await this._api[fn](this._address, ...args)
          const signed = this._api.sign(tx.txJSON, this._secret)
          dbTx = await this._txFactory.create(signed.id, tx.txJSON)
          await dbTx.save() // persist tx before submission
          debug(`submitting tx. txId=${signed.id} tx=${tx.txJSON}`)
          const result = await this._api.submit(signed.signedTransaction)
          resolve({tx: dbTx, instructions: tx.instructions, minLedgerVersion, result})
        } catch (err) {
          try {
            if (dbTx) dbTx.delete()
          } catch (err) { debug('could not delete tx from store. id=' + dbTx.getId()) }

          reject(err)
        }
      })
    })

    // malformed transactions fail immediately with finality
    if (/^tem/.test(result.resultCode)) {
      debug(`tx malformed. txId=${tx.getId()}`)
      tx.delete()
      throw new Error('Malformed transaction: ' + result.resultMessage)
    }

    this._addPendingTx(instructions.maxLedgerVersion, {tx, minLedgerVersion})

    // resolves if the transaction is included in a validated ledger
    // rejects if the transaction failed with finality
    debug(`waiting for transaction ${tx.getId()} to be included in a validated ledger`)
    return new Promise((resolve, reject) => {
      this._pendingTxPromises[tx.getId()] = { resolve, reject }
    })
  }
}

module.exports = function (_api, _address, _secret, store) {
  if (!submitterCreated(_address)) {
    const instance = new TxSubmitter(_api, _address, _secret, store)
    global[sym][_address] = instance
  }

  return global[sym][_address]
}
