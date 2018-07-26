const cluster = require('cluster')
const dgram = require('dgram')
const crypto = require('crypto')
const assert = require('assert')

const express = require('express')
const parser = require('body-parser')
const request = require('request')

const lastOf = list => list[list.length - 1]


class Block {

  constructor(index, previousHash, timestamp, data, nonce = 0, hash = '') {
    this.index = index
    this.previousHash = previousHash
    this.timestamp = timestamp
    this.data = data
    this.nonce = nonce
    this.hash = hash
  }

  calculateHash() {
    const { hash, ...data } = this
    return crypto
      .createHmac('sha256', JSON.stringify(data))
      .digest('hex')
  }

  static get GENESIS() {
    return new Block(
      0, '', 1522983367254, null, 0,
      'e063dac549f070b523b0cb724efb1d4f81de67ea790f78419f9527aa3450f64c'
    )
  }

  static fromPrevious({ index, hash }, data) {
    // Initialize next block using previous block and transaction data
    // assert(typeof hash === 'string' && hash.length === 64)
    return new Block(index + 1, hash, Date.now(), data, 0)
  }

  static fromJson({ index, previousHash, timestamp, data, nonce, hash }) {
    const block = new Block(index, previousHash, timestamp, data, nonce, hash)
    assert(block.calculateHash() === block.hash)
    return block
  }
}
function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time))
}


class Server {

  constructor() {
    this.blocks = [Block.GENESIS]
    this.peers = {}
    this.state = {}
    this.peerServer = dgram.createSocket('udp4')
    this.peerServer.on('listening', this.onPeerServerListening.bind(this))
    this.peerServer.on('message', this.onPeerMessage.bind(this))

    this.httpServer = express()
    this.httpServer.use(parser.json())
    this.httpServer.get('/peers', this.showPeers.bind(this))
    this.httpServer.get('/accounts', this.createAccount.bind(this))
    this.httpServer.get('/blocks', this.showBlocks.bind(this))
    this.httpServer.post('/blocks', this.processBlocks.bind(this))
    this.httpServer.post('/transactions', this.processTransaction.bind(this))
  }

  start() {
    if (!cluster.isMaster) return
    cluster.fork().on('online', _ => this.peerServer.bind(2346))
    cluster.fork().on('online', _ => this.httpServer.listen(2345, _ => {
      console.info('RPC server started at port 2345.')
    }))
  }

  onPeerServerListening() {
    const address = this.peerServer.address()
    console.info(
      `Peer discovery server started at ${address.address}:${address.port}.`
    )

    this.peerServer.setBroadcast(true)
    const message = new Buffer('hello')
    setInterval(_ => {
      this.peerServer.send(message, 0, message.length, address.port, '172.28.0.0')
    }, 1000)
  }

  onPeerMessage(message, remote) {
    if (this.peers[remote.address]) return

    this.peers[remote.address] = remote
    console.log(`Peer discovered: ${remote.address}:${remote.port}`)
  }

  showPeers(req, resp) { resp.json(this.peers) }
  showBlocks(req, resp) { resp.json(this.blocks) }

  processTransaction(req, resp) {
    console.log("Access")
    var transaction = { "from": req.body.from, "to": req.body.to, "amount": req.body.amount }
    // - Verify signature
    if (Object.keys(this.state).indexOf(transaction.from)) {

      // - Verify balance
      if (this.state[transaction.from] >= transaction.amount) {

        // - Current block
        if (!this.currentBlock) {
          this.currentBlock = Block.fromPrevious(Block.GENESIS)
        }
        else {
          this.currentBlock = Block.fromPrevious(this.currentBlock)
        }
        this.currentBlock.data = transaction

        // Notice 30s
        sleep(30000).then(() => {
          console.log("Just a moment")
        })

        // - Proof-of-work
        while (!this.currentBlock.hash.startsWith('000')) {
          this.currentBlock.nonce += 1
          this.currentBlock.hash = this.currentBlock.calculateHash()
        }

        //Respone
        this.peerServer.setBroadcast(true)
        console.log(this.peerServer.address())
        Object.keys(this.peers).forEach((address) => {
          setInterval(_ => {
            this.peerServer.send("Transaction", 0, "Transaction".length, 2346, address)
          }, 1000)
        })
      }
    }
  }

  processBlocks(req, resp) {
    // TODO
    block.hash.startsWith('000')
    block.hash === block.calculateHash()
    block.previousHash === this.blocks[block.index - 1].hash
    block.index > lastOf(this.blocks).index
    this.blocks.push(block)
  }

  createAccount(req, resp) {
    // TODO
    // - Generate key pair based on password
    var user = { "password": req.body.password }
    var account = crypto.createECDH('secp256k1')
    account.setPrivateKey(crypto.createHash('sha256').update(Buffer.from(user.password), 'utf-8').digest())
    this.state[crypto.createHmac('sha256', account.getPublicKey()).digest('hex')] = 10
    console.log(`Public key: ${account.getPublicKey('hex')}`)
    console.log(`Private key: ${account.getPrivateKey('hex')}`)
    console.log(this.state)
    // - Response
  }
}

exports.Block = Block
exports.Server = Server
