const nanoid = require("nanoid");
const amqplib = require("amqplib");
const debug = require("./utils/debug")("micromq-rabbit");

class RabbitApp {
  constructor(options) {
    this.backoff = 1000
    this.options = options;
    this.id = nanoid();

    this.requestsQueueName = `${this.options.name}:requests`;
    this.responsesQueueName = `${this.options.name}:responses`;
  }

  set connection(connection) {
    this._connection = connection;
  }

  get connection() {
    return this._connection;
  }

  get queuePidName() {
    return `${this.responsesQueueName}-${this.id}`;
  }

  async createConnection() {
    debug(() => "[MicroMQ] trying to connect...");

    if (!this.connection) {
      debug(() => "creating connection");

      try {
        this.connection = await amqplib.connect(this.options.rabbit.url);

        debug(() => "[MicroMQ] connected");
        this.backoff = 1000;

        ["error", "close"].forEach(event => {
          this.connection.on(event, () => {
            this.connection = null;
            this.createConnection();
          });
        });

      } catch(e) {
        setTimeout(() => {
          this.backoff *= 2;
          this.connection = null;
          this.createConnection();
        }, this.backoff)
      }
    }

    return this.connection;
  }

  async createChannel(queueName, options) {
    const connection = await this.createConnection();
    const channel = await connection.createChannel();

    debug(() => `creating channel and asserting to ${queueName} queue`);

    if (queueName) {
      await channel.assertQueue(queueName, options);
    }

    return channel;
  }

  async createResponsesChannel() {
    if (!this.responsesChannel) {
      this.responsesChannel = await this.createChannel(this.responsesQueueName);
    }

    return this.responsesChannel;
  }

  async createRequestsChannel() {
    if (!this.requestsChannel) {
      this.requestsChannel = await this.createChannel(this.requestsQueueName);
    }

    return this.requestsChannel;
  }

  async createChannelByPid(options) {
    if (!this.pidChannel) {
      this.pidChannel = await this.createChannel(this.queuePidName, options);
    }

    return this.pidChannel;
  }
}

module.exports = RabbitApp;
