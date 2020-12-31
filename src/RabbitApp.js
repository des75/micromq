const nanoid = require('nanoid')
const amqplib = require('amqplib')
const debug = require('./utils/debug')('micromq-rabbit')

class RabbitApp {
  constructor (options) {
    this.app = options.app
    this.backoff = 1000
    this.options = options
    this.id = nanoid()

    this.requestsQueueName = `${this.options.name}:requests`
    this.responsesQueueName = `${this.options.name}:responses`
  }

  set connection (connection) {
    this._connection = connection
  }

  get connection () {
    return this._connection
  }

  get queuePidName () {
    return `${this.responsesQueueName}-${this.id}`
  }

  onConnectionDown () {
    console.log('[MicroMQ] connection lost...')
    this.connection = null
    this.closeChannels()

    this.app.onConnectionDown()
  }

  async createConnection () {
    debug(() => '[MicroMQ] trying to connect...')

    if (!this.connection) {
      debug(() => 'creating connection')

      try {
        this.connection = await amqplib.connect(this.options.rabbit.url)

        debug(() => '[MicroMQ] connected')
        this.backoff = 1000
        
        ['error', 'close'].forEach(event => {
          this.connection.on(event, () => {
            this.onConnectionDown()
          })
        })
      } catch (e) {
        setTimeout(() => {
          this.backoff *= 2
          this.onConnectionDown()
        }, this.backoff)
      }
    }

    return this.connection
  }

  async createChannel (queueName, options) {
    const connection = await this.createConnection()

    try {
      const channel = await connection.createChannel()

      debug(() => `creating channel and asserting to ${queueName} queue`)

      if (queueName) {
        await channel.assertQueue(queueName, options)
      }

      return channel
    } catch (e) {
      setTimeout(() => {
        this.backoff *= 2
        this.createChannel(queueName, options)
        this.onConnectionDown()
      }, this.backoff)
    }
  }

  async createResponsesChannel () {
    if (!this.responsesChannel) {
      this.responsesChannel = await this.createChannel(this.responsesQueueName)
      ['error', 'close'].forEach(event => {
        this.responsesChannel.on(event, () => {
          this.onConnectionDown()
          this.responsesChannel = null
        })
      })
    }

    return this.responsesChannel
  }

  async createRequestsChannel () {
    if (!this.requestsChannel) {
      this.requestsChannel = await this.createChannel(this.requestsQueueName)
      ['error', 'close'].forEach(event => {
        this.requestsChannel.on(event, () => {
          this.onConnectionDown()
          this.requestsChannel = null
        })
      })
    }

    return this.requestsChannel
  }

  async createChannelByPid (options) {
    if (!this.pidChannel) {
      this.pidChannel = await this.createChannel(this.queuePidName, options)
      
      ['error', 'close'].forEach(event => {
        this.pidChannel.on(event, () => {
          this.onConnectionDown()
          this.pidChannel = null
        })
      })
    }

    return this.pidChannel
  }

  closeChannels () {
    if (this.responsesChannel) {
      this.responsesChannel.close()
    }
    if (this.requestsChannel) {
      this.requestsChannel.close()
    }
    if (this.pidChannel) {
      this.pidChannel.close()
    }
  }
}

module.exports = RabbitApp
