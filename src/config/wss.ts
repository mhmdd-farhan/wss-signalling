import { debug } from "console";
import WebSocket, { Server as WebSocketServer } from "ws";

// Define channel structure: channelName -> { userId -> WebSocket }
interface Channels {
    [channelName: string]: {
        [userId: string]: WebSocket
    }
}

// Message body from client
interface MessagePayload {
    channelName: string;
    userId: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
}

// Full message from client
interface ParsedMessage {
    type: string;
    body: MessagePayload;
}

let channels: Channels = {};

export function init(port: number) {
    debug(`Initializing WebSocket Signaling Server with PC Control on port ${port}`);

    const wss = new WebSocketServer({ 
        port,
        perMessageDeflate: false
    });

    wss.on("connection", (socket: WebSocket, request) => {
        const clientIP = request.socket.remoteAddress;
        debug(`New client connected from ${clientIP}`);
        
        // Send welcome message
        socket.send(JSON.stringify({ 
            type: "welcome", 
            body: { message: "Connected to signaling server with PC control support" } 
        }));

        socket.on("error", (error) => {
            debug("Socket error:", error);
        });

        socket.on("message", (message: WebSocket.RawData) => {
            onMessage(socket, message);
        });

        socket.on("close", (code: number, reason: Buffer) => {
            debug(`Client disconnected. Code: ${code}, Reason: ${reason.toString()}`);
            onClose(socket, reason.toString());
        });
    });

    wss.on("error", (error) => {
        debug("WebSocket server error:", error);
    });

    debug(`WebSocket Signaling Server with PC Control started successfully on port ${port}`);
}

function send(wsClient: WebSocket, type: string, body: any) {
    if (wsClient.readyState === WebSocket.OPEN) {
        const message = JSON.stringify({ type, body });
        wsClient.send(message);
        debug(`Sent message type: ${type}`);
    } else {
        debug(`Cannot send message to client - WebSocket not open (state: ${wsClient.readyState})`);
    }
}

function clearClient(socket: WebSocket) {
    let removedFromChannels: string[] = [];
    
    Object.keys(channels).forEach((channelName) => {
        Object.keys(channels[channelName]).forEach((userId) => {
            if (channels[channelName][userId] === socket) {
                delete channels[channelName][userId];
                removedFromChannels.push(`${channelName}:${userId}`);
                
                // Clean up empty channels
                if (Object.keys(channels[channelName]).length === 0) {
                    delete channels[channelName];
                    debug(`Removed empty channel: ${channelName}`);
                }
            }
        });
    });
    
    if (removedFromChannels.length > 0) {
        debug(`Removed client from channels: ${removedFromChannels.join(", ")}`);
    }
}

function onMessage(
    socket: WebSocket,
    message: WebSocket.RawData
) {
    let parsedMessage: ParsedMessage;
    
    try {
        const messageStr = message.toString();
        parsedMessage = JSON.parse(messageStr);
        
        debug(`Received message: ${messageStr.substring(0, 200)}${messageStr.length > 200 ? "..." : ""}`);
    } catch (err) {
        debug("Invalid JSON message received:", err);
        send(socket, "error", { message: "Invalid JSON format" });
        return;
    }

    const { type, body } = parsedMessage;
    
    if (!body || !body.channelName || !body.userId) {
        debug("Invalid message structure - missing required fields");
        send(socket, "error", { message: "Missing required fields: channelName, userId" });
        return;
    }

    const { channelName, userId } = body;

    switch (type) {
        case "join": {
            debug(`User ${userId} joining channel ${channelName}`);
            
            // Initialize channel if it doesn't exist
            if (!channels[channelName]) {
                channels[channelName] = {};
            }
            
            // Add user to channel
            channels[channelName][userId] = socket;
            
            // Send list of users in channel
            const userIds = Object.keys(channels[channelName]);
            send(socket, "joined", { 
                channelName, 
                userId, 
                users: userIds,
                message: `Joined channel ${channelName}` 
            });
            
            debug(`Channel ${channelName} now has users: ${userIds.join(", ")}`);
            
            // Notify other users in the channel
            broadcastExceptSender(channelName, userId, "user_joined", { 
                userId,
                message: `User ${userId} joined the channel` 
            });
            break;
        }

        case "quit": {
            debug(`User ${userId} leaving channel ${channelName}`);
            
            if (channels[channelName] && channels[channelName][userId]) {
                delete channels[channelName][userId];
                
                // Clean up empty channel
                if (Object.keys(channels[channelName]).length === 0) {
                    delete channels[channelName];
                    debug(`Removed empty channel: ${channelName}`);
                }
                
                // Notify other users
                broadcastExceptSender(channelName, userId, "user_left", { 
                    userId, 
                    message: `User ${userId} left the channel` 
                });
            }
            break;
        }

        // WebRTC signaling messages
        case "send_offer": {
            const { sdp } = body;
            if (!sdp) {
                debug("No SDP in offer message");
                send(socket, "error", { message: "Missing SDP in offer" });
                return;
            }
            
            debug(`Relaying offer from ${userId} in channel ${channelName}`);
            broadcastExceptSender(channelName, userId, "offer_sdp_recieved", sdp);
            break;
        }

        case "send_answer": {
            const { sdp } = body;
            if (!sdp) {
                debug("No SDP in answer message");
                send(socket, "error", { message: "Missing SDP in answer" });
                return;
            }
            
            debug(`Relaying answer from ${userId} in channel ${channelName}`);
            broadcastExceptSender(channelName, userId, "answer_sdp_recieved", sdp);
            break;
        }

        case "send_ice_candidate": {
            const { candidate } = body;
            if (!candidate) {
                debug("No candidate in ICE message");
                send(socket, "error", { message: "Missing candidate in ICE message" });
                return;
            }
            
            debug(`Relaying ICE candidate from ${userId} in channel ${channelName}`);
            broadcastExceptSender(channelName, userId, "ice_candidate_recieved", candidate);
            break;
        }

        default:
            debug(`Unknown message type: ${type}`);
            send(socket, "error", { message: `Unknown message type: ${type}` });
            break;
    }
}

function broadcastExceptSender(
    channelName: string,
    senderId: string,
    eventType: string,
    data: any
) {
    const clients = channels[channelName];
    if (!clients) {
        debug(`No clients in channel ${channelName} for broadcast`);
        return;
    }

    const recipients: string[] = [];
    
    Object.keys(clients).forEach((userId) => {
        if (userId !== senderId) {
            const wsClient = clients[userId];
            if (wsClient.readyState === WebSocket.OPEN) {
                send(wsClient, eventType, data);
                recipients.push(userId);
            } else {
                debug(`Skipping client ${userId} - WebSocket not open`);
            }
        }
    });
}

function onClose(socket: WebSocket, reason: string) {
    debug(`Cleaning up client connection. Reason: ${reason}`);
    clearClient(socket);
}