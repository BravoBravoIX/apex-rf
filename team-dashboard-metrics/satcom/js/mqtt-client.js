/**
 * MQTT Client for SATCOM Dashboards
 * Based on the React useMqtt hook pattern
 */

class MQTTClient {
  constructor(brokerUrl, topics) {
    this.brokerUrl = brokerUrl;
    this.topics = Array.isArray(topics) ? topics : [topics];
    this.client = null;
    this.messageHandlers = [];
    this.statusHandlers = [];
    this.status = 'disconnected';
  }

  connect() {
    return new Promise((resolve, reject) => {
      console.log('Creating MQTT connection to:', this.brokerUrl);

      try {
        // Use Paho MQTT client (loaded via CDN)
        const clientId = 'satcom_' + Math.random().toString(16).substr(2, 8);

        // Extract host and port from WebSocket URL
        const url = new URL(this.brokerUrl);
        const host = url.hostname;
        const port = parseInt(url.port) || 9001;

        console.log(`Connecting to MQTT: ${host}:${port} with clientId: ${clientId}`);

        // Paho Client constructor: new Paho.Client(hostname, port, path, clientId)
        // For WebSocket, use empty path
        this.client = new Paho.Client(host, port, '/', clientId);

        // Set up callbacks
        this.client.onConnectionLost = (responseObject) => {
          if (responseObject.errorCode !== 0) {
            console.log('MQTT connection lost:', responseObject.errorMessage);
            this.updateStatus('disconnected');
          }
        };

        this.client.onMessageArrived = (message) => {
          const topic = message.destinationName;
          const payload = message.payloadString;
          console.log(`Received message on topic ${topic}:`, payload);

          try {
            const data = JSON.parse(payload);
            this.notifyMessageHandlers(topic, data);
          } catch (e) {
            console.error('Error parsing message:', e);
          }
        };

        // Connect with valid Paho options
        this.client.connect({
          onSuccess: () => {
            console.log('Connected to MQTT broker');
            this.updateStatus('connected');

            // Subscribe to topics
            this.topics.forEach(topic => {
              this.client.subscribe(topic);
              console.log(`Subscribed to topic: ${topic}`);
            });

            resolve(this);
          },
          onFailure: (error) => {
            console.error('MQTT connection failed:', error);
            this.updateStatus('disconnected');
            reject(error);
          },
          keepAliveInterval: 60,
          cleanSession: true,
          useSSL: false
        });
      } catch (err) {
        console.error('Error creating MQTT client:', err);
        this.updateStatus('disconnected');
        reject(err);
      }
    });
  }

  onMessage(handler) {
    this.messageHandlers.push(handler);
  }

  onStatus(handler) {
    this.statusHandlers.push(handler);
  }

  notifyMessageHandlers(topic, data) {
    this.messageHandlers.forEach(handler => {
      try {
        handler(topic, data);
      } catch (e) {
        console.error('Error in message handler:', e);
      }
    });
  }

  updateStatus(status) {
    this.status = status;
    this.statusHandlers.forEach(handler => {
      try {
        handler(status);
      } catch (e) {
        console.error('Error in status handler:', e);
      }
    });
  }

  disconnect() {
    if (this.client && this.client.isConnected()) {
      this.client.disconnect();
      console.log('Disconnected from MQTT broker');
    }
  }
}

// Export for use in dashboard scripts
window.MQTTClient = MQTTClient;
