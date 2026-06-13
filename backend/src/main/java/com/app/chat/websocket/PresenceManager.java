package com.app.chat.websocket;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.socket.messaging.SessionSubscribeEvent;
import org.springframework.web.socket.messaging.SessionUnsubscribeEvent;

import java.security.Principal;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

@Component
public class PresenceManager {

    private static final Logger logger = LoggerFactory.getLogger(PresenceManager.class);

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    // Map of roomId -> Set of online emails
    private final ConcurrentHashMap<String, Set<String>> roomActiveUsers = new ConcurrentHashMap<>();

    // Map of sessionId -> roomId
    private final ConcurrentHashMap<String, String> sessionRoomMap = new ConcurrentHashMap<>();

    // Map of sessionId -> email
    private final ConcurrentHashMap<String, String> sessionUserMap = new ConcurrentHashMap<>();

    @EventListener
    public void handleSessionSubscribe(SessionSubscribeEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String destination = accessor.getDestination();
        Principal principal = accessor.getUser();
        String sessionId = accessor.getSessionId();

        if (destination != null && principal != null && sessionId != null) {
            String[] parts = destination.split("/");
            if (parts.length == 4 && "topic".equals(parts[1]) && "room".equals(parts[2])) {
                String roomId = parts[3];
                String email = principal.getName();

                logger.info("User {} subscribed to room {} (Session ID: {})", email, roomId, sessionId);

                // Add to maps
                sessionRoomMap.put(sessionId, roomId);
                sessionUserMap.put(sessionId, email);

                roomActiveUsers.computeIfAbsent(roomId, k -> new CopyOnWriteArraySet<>()).add(email);

                // Broadcast the updated online users list
                broadcastPresenceList(roomId);
            }
        }
    }

    @EventListener
    public void handleSessionUnsubscribe(SessionUnsubscribeEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = accessor.getSessionId();
        cleanUpSession(sessionId);
    }

    @EventListener
    public void handleSessionDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = accessor.getSessionId();
        cleanUpSession(sessionId);
    }

    private void cleanUpSession(String sessionId) {
        if (sessionId == null) {
            return;
        }

        String roomId = sessionRoomMap.remove(sessionId);
        String email = sessionUserMap.remove(sessionId);

        if (roomId != null && email != null) {
            logger.info("User {} unsubscribed/disconnected from room {} (Session ID: {})", email, roomId, sessionId);

            Set<String> activeUsers = roomActiveUsers.get(roomId);
            if (activeUsers != null) {
                // If the user has other active sessions in the same room (e.g. multi-tab), do not remove them yet
                boolean hasOtherSessions = false;
                for (Map.Entry<String, String> entry : sessionUserMap.entrySet()) {
                    String sId = entry.getKey();
                    String userEmail = entry.getValue();
                    String userRoomId = sessionRoomMap.get(sId);
                    if (email.equals(userEmail) && roomId.equals(userRoomId)) {
                        hasOtherSessions = true;
                        break;
                    }
                }

                if (!hasOtherSessions) {
                    activeUsers.remove(email);
                    logger.info("User {} is now offline in room {}", email, roomId);
                }
            }

            // Broadcast the updated online users list
            broadcastPresenceList(roomId);
        }
    }

    private void broadcastPresenceList(String roomId) {
        Set<String> activeUsers = roomActiveUsers.get(roomId);
        List<String> presenceList = activeUsers != null ? new ArrayList<>(activeUsers) : Collections.emptyList();

        try {
            messagingTemplate.convertAndSend("/topic/room/" + roomId + "/presence", presenceList);
            logger.info("Broadcasted online presence list for room {}: {}", roomId, presenceList);
        } catch (Exception e) {
            logger.error("Failed to broadcast presence list for room {}", roomId, e);
        }
    }
}
