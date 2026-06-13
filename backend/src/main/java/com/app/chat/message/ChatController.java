package com.app.chat.message;

import com.app.chat.message.dto.MessagePayload;
import com.app.chat.room.Room;
import com.app.chat.room.RoomRepository;
import com.app.chat.user.User;
import com.app.chat.user.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.time.LocalDateTime;

@Controller
public class ChatController {

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @Autowired
    private MessageRepository messageRepository;

    @Autowired
    private RoomRepository roomRepository;

    @Autowired
    private UserRepository userRepository;

    @MessageMapping("/chat.sendMessage/{roomId}")
    public void sendMessage(
            @DestinationVariable String roomId,
            @Payload MessagePayload messagePayload,
            Principal principal) {
        
        if (principal == null) {
            return;
        }

        String email = principal.getName();
        User sender = userRepository.findByEmail(email).orElse(null);
        if (sender == null) {
            return;
        }

        Room room = roomRepository.findByRoomId(roomId).orElse(null);
        if (room == null) {
            return;
        }

        // If history policy is enabled, persist to DB
        if (Boolean.TRUE.equals(room.getPreserveHistory())) {
            Message message = new Message(
                    room,
                    sender,
                    messagePayload.getMessageType(),
                    messagePayload.getContent(),
                    messagePayload.getFileUrl()
            );
            messageRepository.save(message);
        }

        // Prepare broadcast payload with verified server/DB values
        MessagePayload broadcastPayload = new MessagePayload(
                sender.getEmail(),
                sender.getDisplayName(),
                sender.getAvatarUrl(),
                messagePayload.getMessageType(),
                messagePayload.getContent(),
                messagePayload.getFileUrl(),
                LocalDateTime.now()
        );

        // Send message to all room subscribers
        messagingTemplate.convertAndSend("/topic/room/" + roomId, broadcastPayload);
    }

    @MessageMapping("/chat.typing/{roomId}")
    public void broadcastTyping(
            @DestinationVariable String roomId,
            @Payload com.app.chat.message.dto.TypingPayload typingPayload,
            Principal principal) {
        
        if (principal == null) {
            return;
        }
        
        String email = principal.getName();
        User sender = userRepository.findByEmail(email).orElse(null);
        if (sender == null) {
            return;
        }

        typingPayload.setEmail(sender.getEmail());
        typingPayload.setDisplayName(sender.getDisplayName());
        
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/typing", typingPayload);
    }
}
