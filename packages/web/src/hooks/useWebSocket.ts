import { useEffect, useState } from 'react';

export interface WebSocketMessage {
  type: string;
  payload: unknown;
}

export interface UseWebSocketReturn {
  isConnected: boolean;
  lastMessage: WebSocketMessage | null;
  sendMessage: (message: WebSocketMessage) => void;
}

/**
 * WebSocket hook for connecting to the Olympus CLI server.
 * This is a placeholder implementation that will be connected to the actual WS server.
 *
 * Expected server URL: ws://localhost:8080
 */
export function useWebSocket(url = 'ws://localhost:8080'): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  useEffect(() => {
    // TODO: Implement actual WebSocket connection
    // const ws = new WebSocket(url);

    // ws.onopen = () => setIsConnected(true);
    // ws.onclose = () => setIsConnected(false);
    // ws.onmessage = (event) => {
    //   const message = JSON.parse(event.data);
    //   setLastMessage(message);
    // };

    // Placeholder: simulate connection after 1 second
    const timer = setTimeout(() => {
      setIsConnected(true);
    }, 1000);

    return () => {
      clearTimeout(timer);
      // ws.close();
    };
  }, [url]);

  const sendMessage = (message: WebSocketMessage) => {
    // TODO: Implement actual message sending
    // ws.send(JSON.stringify(message));
    console.log('Sending message:', message);
  };

  return {
    isConnected,
    lastMessage,
    sendMessage,
  };
}
