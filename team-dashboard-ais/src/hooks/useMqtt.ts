
import { useEffect, useState, useRef, useMemo } from 'react';
import mqtt, { MqttClient } from 'mqtt';

export const useMqtt = (brokerUrl: string, topics: string | string[]) => {
  const [client, setClient] = useState<MqttClient | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('connecting');
  const clientRef = useRef<MqttClient | null>(null);

  // Memoize topics to prevent recreating array on every render
  const topicList = useMemo(() => {
    return Array.isArray(topics) ? topics : [topics];
  }, [JSON.stringify(topics)]); // Use JSON.stringify for deep comparison

  useEffect(() => {
    // Prevent multiple connections
    if (clientRef.current) {
      return;
    }

    console.log('Creating MQTT connection to:', brokerUrl);
    const mqttClient = mqtt.connect(brokerUrl, {
      reconnectPeriod: 5000, // Reconnect every 5 seconds if disconnected
      connectTimeout: 30000, // 30 second connection timeout
    });

    clientRef.current = mqttClient;
    setClient(mqttClient);

    mqttClient.on('connect', () => {
      console.log('Connected to MQTT broker');
      setConnectionStatus('connected');

      topicList.forEach(topic => {
        mqttClient.subscribe(topic, (err) => {
          if (err) {
            console.error(`Subscription error for ${topic}:`, err);
          } else {
            console.log(`Subscribed to topic: ${topic}`);
          }
        });
      });
    });

    mqttClient.on('message', (topic, payload) => {
      const message = payload.toString();
      console.log(`Received message on topic ${topic}:`, message);
      setMessages((prevMessages) => [...prevMessages, message]);
    });

    mqttClient.on('error', (err) => {
      console.error('MQTT error:', err);
      setConnectionStatus('disconnected');
    });

    mqttClient.on('reconnect', () => {
      console.log('Attempting to reconnect to MQTT broker...');
      setConnectionStatus('reconnecting');
    });

    mqttClient.on('close', () => {
      console.log('MQTT connection closed');
      setConnectionStatus('disconnected');
    });

    mqttClient.on('offline', () => {
      console.log('MQTT client offline');
      setConnectionStatus('disconnected');
    });

    return () => {
      if (clientRef.current) {
        console.log('Disconnecting MQTT client');
        clientRef.current.end();
        clientRef.current = null;
      }
    };
  }, [brokerUrl]); // Only depend on brokerUrl, not topics

  // Subscribe to new topics if they change
  useEffect(() => {
    if (client && client.connected) {
      topicList.forEach(topic => {
        client.subscribe(topic, (err) => {
          if (err) {
            console.error(`Subscription error for ${topic}:`, err);
          } else {
            console.log(`Subscribed to topic: ${topic}`);
          }
        });
      });
    }
  }, [client, topicList]);

  return { client, messages, connectionStatus };
};
