const bignum = require('bignum')
const debug = require('debug')('ilp-plugin-xrp:util')
const BigNumber = require('bignumber.js')
const crypto = require('crypto')
const addressCodec = require('ripple-address-codec')

const INFO_REQUEST_ALL = 2
const MIN_SETTLE_DELAY = 3600
const DEFAULT_CLAIM_INTERVAL = 5 * 60 * 1000

const DROPS_PER_XRP = 1000000
const dropsToXrp = (drops) => new BigNumber(drops).div(DROPS_PER_XRP).toString()
const xrpToDrops = (xrp) => new BigNumber(xrp).mul(DROPS_PER_XRP).toString()

function hmac (key, message) {
  const h = crypto.createHmac('sha256', key)
  h.update(message)
  return h.digest()
}

function computeChannelId (src, dest, sequence) {
  const preimage = Buffer.concat([
    Buffer.from('\0x', 'ascii'),
    Buffer.from(addressCodec.decodeAccountID(src)),
    Buffer.from(addressCodec.decodeAccountID(dest)),
    bignum(sequence).toBuffer({ endian: 'big', size: 4 })
  ])

  return crypto.createHash('sha512')
    .update(preimage)
    .digest()
    .slice(0, 32) // first half sha512
    .toString('hex')
    .toUpperCase()
} 

function encodeClaim (amount, id) {
  return Buffer.concat([
    Buffer.from('CLM\0'),
    Buffer.from(id, 'hex'),
    bignum(amount).toBuffer({
      endian: 'big',
      size: 8
    })
  ])
}

function randomTag () {
  return bignum.fromBuffer(crypto.randomBytes(4), {
    endian: 'big',
    size: 4
  }).toNumber()
}

async function _requestId () {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(4, (err, buf) => {
      if (err) reject(err)
      resolve(buf.readUInt32BE(0))
    })
  })
}

function checkChannelExpiry (expiry) {
  const isAfter = moment().add(MIN_SETTLE_DELAY, 'seconds').isAfter(expiry)

  if (isAfter) {
    debug('incoming payment channel expires too soon. ' +
        'Minimum expiry is ' + MIN_SETTLE_DELAY + ' seconds.')
    throw new Error('incoming channel expires too soon')
  }
}

async function fundChannel ({ api, channel, amount, address, secret }) {
  debug('preparing fund tx')
  const xrpAmount = dropsToXrp(amount)
  const tx = await api.preparePaymentChannelFund(address, {
    amount: xrpAmount,
    channel
  })

  debug('submitting fund tx')
  const signedTx = api.sign(tx.txJSON, secret)
  const { resultCode, resultMessage } = await api.submit(signedTx.signedTransaction)

  debug('got fund submit result', resultCode)
  if (resultCode !== 'tesSUCCESS') {
    debug('unable to fund channel:', resultCode, resultMessage)
    throw new Error('unable to fund channel: ' + resultCode + ' ' + resultMessage)
  }

  return new Promise((resolve) => {
    async function handleTransaction (ev) {
      if (ev.transaction.hash !== signedTx.id) return
      if (ev.engine_result !== 'tesSUCCESS') {
        debug('failed fund tx:', ev) 
        reject(new Error('failed fund tx: ' + JSON.stringify(ev)))
      }

      debug('funded channel')
      setImmediate(() => api.connection
        .removeListener('transaction', handleTransaction))

      resolve()
    }

    api.connection.on('transaction', handleTransaction)
  })
}

function encodeChannelProof (channel, account) {
  return Buffer.concat([
    Buffer.from('channel_signature'),
    Buffer.from(channel, 'hex'),
    Buffer.from(account, 'base64')
  ])
}

module.exports = {
  INFO_REQUEST_ALL,
  MIN_SETTLE_DELAY, 
  DEFAULT_CLAIM_INTERVAL,
  DROPS_PER_XRP,
  dropsToXrp,
  xrpToDrops,
  hmac,
  computeChannelId,
  encodeClaim,
  randomTag,
  _requestId,
  checkChannelExpiry,
  fundChannel,
  encodeChannelProof
}
