'use strict'

const assert = require('assert')
const debug = require('debug')('ilp-plugin-xrp-paychan-shared')

// WARNING: do not change the string literal 'ilp-plugin-xrp-paychan-shared-txsubmitter'
// It ensures that different versions of this package create only one tx submitter object.
const sym = Symbol.for('ilp-plugin-xrp-paychan-shared-txsubmitter')
const submitterCreated = () => Object.getOwnPropertySymbols(global).indexOf(sym) > -1

const allowedFnNames = [
  'preparePayment',
  'preparePaymentChannelCreate',
  'preparePaymentChannelClaim',
  'preparePaymentChannelFund']

const txPipeline = Promise.resolve()
async function submitTx (_api, _address, _secret, fn, ...args) {
  assert(typeof fn === 'string', 'parameter fn must be string')
  assert(allowedFnNames.includes(fn), 'parameter fn must be one of preparePaymentChannel(Create|Fund|Claim) or preparePayment')

  const result = await new Promise((resolve, reject) => {
    txPipeline.then(async () => {
      try {
        const tx = await _api[fn](_address, ...args)
        const signed = _api.sign(tx.txJSON, _secret)
        debug(`submitting tx. tx=${tx}`)
        const result = await _api.submit(signed.signedTransaction)
        resolve(result)
      } catch (err) {
        reject(err)
      }
    })
  })

  return result
}

module.exports = function (_api, _address, _secret) {
  if (!submitterCreated()) {
    const instance = submitTx.bind(null, _api, _address, _secret)
    global[sym] = instance
  }
  return global[sym]
}
