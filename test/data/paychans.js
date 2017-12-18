'use strict'

const paychan = {
  'id': 'E30E709CF009A1F26E0E5C48F7AA1BFB79393764F15FB108BDC6E06D3CBD8415',
  'data': {
    'account': 'r6ZtfQFWbCkp4XqaUygzHaXsQXBT67xLj',
    'amount': '10',
    'balance': '0',
    'destination': 'rQf9vCwQtzQQwtnGvr6zc1fqzqg7QBuj7G',
    'publicKey': '02A05282CB6197E34490BACCD9405E81D9DFBE123B0969F9F40EC3F9987AD9A97D',
    'settleDelay': 10000,
    'previousAffectingTransactionID': 'F939A0BEF139465403C56CCDC49F59A77C868C78C5AEC184E29D15E9CD1FF675',
    'previousAffectingTransactionLedgerVersion': 151322
  }
}

const anotherPaychan = {
  'id': '51EF277D341ED8CA7C5DEC6DF790F53E9B18DC8371A40BBE9E46A26D257D3DFF',
  'data': {
    'account': 'rngbFpyoVGhZqgdxe827YtfpSYyDBE9QbB',
    'amount': '10',
    'balance': '0',
    'destination': 'r4N3fxPhvUV8jZvnqDpoGVnBxDDFdyfTqt',
    'publicKey': '02A05282CB6197E34490BACCD9405E81D9DFBE123B0969F9F40EC3F9987AD9A97D',
    'settleDelay': 98765,
    'previousAffectingTransactionID': 'F939A0BEF139465403C56CCDC49F59A77C868C78C5AEC184E29D15E9CD1FF675',
    'previousAffectingTransactionLedgerVersion': 151322
  }
}

const paychanWithExpiry = {
  'id': 'F527781D03C50962BAA5C386982C7E25666C9CEA3518A7824BAA814B70A5A928',
  'data': Object.assign({}, paychan.data, { expiration: '2017-12-15T21:00:19.915Z' })
}

const paychanWithCancelAfter = {
  'id': '80C873209940F9D7A308694A42096C19EEA6D3E371416B5970BF043204EB02D8',
  'data': Object.assign({}, paychan.data, { cancelAfter: '2017-12-15T21:00:19.915Z' })
}

const allPaychans = new Map()
allPaychans.set(paychan.id, paychan.data)
allPaychans.set(anotherPaychan.id, anotherPaychan.data)
allPaychans.set(paychanWithExpiry.id, paychanWithExpiry.data)
allPaychans.set(paychanWithCancelAfter.id, paychanWithCancelAfter.data)

module.exports = {
  allPaychans,
  paychan,
  anotherPaychan,
  paychanWithExpiry,
  paychanWithCancelAfter
}
