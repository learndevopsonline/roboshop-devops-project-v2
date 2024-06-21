import json
import pika
import os
import logging
import sys
from pythonjsonlogger import jsonlogger

# Configure JSON logging
log_handler = logging.StreamHandler(sys.stdout)
formatter = jsonlogger.JsonFormatter()
log_handler.setFormatter(formatter)

logger = logging.getLogger()
logger.addHandler(log_handler)
logger.setLevel(logging.INFO)

class Publisher:
    HOST = os.getenv('AMQP_HOST', 'rabbitmq')
    VIRTUAL_HOST = '/'
    EXCHANGE = 'robot-shop'
    TYPE = 'direct'
    ROUTING_KEY = 'orders'

    def __init__(self, logger):
        self._logger = logger
        self._params = pika.connection.ConnectionParameters(
            host=self.HOST,
            virtual_host=self.VIRTUAL_HOST,
            credentials=pika.credentials.PlainCredentials('guest', 'guest'))
        self._conn = None
        self._channel = None

    def _connect(self):
        if not self._conn or self._conn.is_closed or self._channel is None or self._channel.is_closed:
            self._conn = pika.BlockingConnection(self._params)
            self._channel = self._conn.channel()
            self._channel.exchange_declare(exchange=self.EXCHANGE, exchange_type=self.TYPE, durable=True)
            self._logger.info('connected to broker', extra={"event": "broker_connection"})

    def _publish(self, msg, headers):
        self._channel.basic_publish(exchange=self.EXCHANGE,
                                    routing_key=self.ROUTING_KEY,
                                    properties=pika.BasicProperties(headers=headers),
                                    body=json.dumps(msg).encode())
        self._logger.info('message sent', extra={"event": "message_sent", "message": msg})

    # Publish msg, reconnecting if necessary.
    def publish(self, msg, headers):
        if self._channel is None or self._channel.is_closed or self._conn is None or self._conn.is_closed:
            self._connect()
        try:
            self._publish(msg, headers)
        except (pika.exceptions.ConnectionClosed, pika.exceptions.StreamLostError):
            self._logger.info('reconnecting to queue', extra={"event": "reconnection"})
            self._connect()
            self._publish(msg, headers)

if __name__ == '__main__':
    publisher = Publisher(logger)
    message = {"order_id": 123, "product": "widget"}
    headers = {"content_type": "application/json"}
    publisher.publish(message, headers)
