package com.app.chat.room;

import com.app.chat.auth.dto.UserResponse;
import com.app.chat.message.Message;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import com.app.chat.message.MessageRepository;
import com.app.chat.message.dto.MessagePayload;
import com.app.chat.room.dto.CreateRoomRequest;
import com.app.chat.room.dto.RoomResponse;
import com.app.chat.security.UserPrincipal;
import com.app.chat.user.User;
import com.app.chat.user.UserRepository;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private static final String[] ADJECTIVES = {
            "cozy", "happy", "silent", "bright", "swift", "clever", "brave",
            "frosty", "golden", "magic", "wild", "gentle", "epic", "solar"
    };

    private static final String[] NOUNS = {
            "panda", "tiger", "falcon", "koala", "fox", "owl", "badger",
            "rabbit", "lion", "wolf", "eagle", "bear", "otter", "dolphin"
    };

    private final SecureRandom random = new SecureRandom();

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @Autowired
    private RoomRepository roomRepository;

    @Autowired
    private RoomMemberRepository roomMemberRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private MessageRepository messageRepository;

    @PostMapping("/create")
    public ResponseEntity<?> createRoom(
            @Valid @RequestBody CreateRoomRequest createRoomRequest,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {

        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not authenticated");
        }

        User user = userRepository.findById(userPrincipal.getId()).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("User not found");
        }

        // Generate unique room ID
        String roomId = generateUniqueRoomId();

        Room room = new Room(roomId, createRoomRequest.getName(), createRoomRequest.getPreserveHistory(), createRoomRequest.getRetentionPolicy());
        roomRepository.save(room);

        // Add creator as owner
        RoomMember ownerMember = new RoomMember(room, user, "OWNER");
        roomMemberRepository.save(ownerMember);

        RoomResponse response = new RoomResponse(
                room.getRoomId(),
                room.getName(),
                room.getPreserveHistory(),
                room.getRetentionPolicy(),
                room.getCreatedAt(),
                user.getDisplayName()
        );

        return ResponseEntity.ok(response);
    }

    @PostMapping("/join/{roomId}")
    public ResponseEntity<?> joinRoom(
            @PathVariable String roomId,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {

        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not authenticated");
        }

        User user = userRepository.findById(userPrincipal.getId()).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("User not found");
        }

        Room room = roomRepository.findByRoomId(roomId).orElse(null);
        if (room == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Room not found");
        }

        // Check if user already joined
        Optional<RoomMember> memberOptional = roomMemberRepository.findByRoomAndUser(room, user);
        if (memberOptional.isPresent()) {
            return ResponseEntity.ok(createRoomResponse(room));
        }

        // Add as member
        RoomMember member = new RoomMember(room, user, "MEMBER");
        roomMemberRepository.save(member);

        // If history is preserved, save the JOIN log in database
        if (Boolean.TRUE.equals(room.getPreserveHistory())) {
            Message systemMessage = new Message(room, user, "JOIN", "joined the room", null);
            messageRepository.save(systemMessage);
        }

        // Broadcast to WebSocket subscribers that a user has joined
        com.app.chat.message.dto.MessagePayload joinPayload = new com.app.chat.message.dto.MessagePayload(
                user.getEmail(),
                user.getDisplayName(),
                user.getAvatarUrl(),
                "JOIN",
                "joined the room",
                null,
                java.time.LocalDateTime.now()
        );
        messagingTemplate.convertAndSend("/topic/room/" + roomId, joinPayload);

        return ResponseEntity.ok(createRoomResponse(room));
    }

    @GetMapping("/my")
    public ResponseEntity<?> getMyRooms(@AuthenticationPrincipal UserPrincipal userPrincipal) {
        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not authenticated");
        }

        User user = userRepository.findById(userPrincipal.getId()).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("User not found");
        }

        List<RoomMember> memberships = roomMemberRepository.findByUser(user);
        List<RoomResponse> responses = memberships.stream()
                .map(m -> createRoomResponse(m.getRoom()))
                .collect(Collectors.toList());

        return ResponseEntity.ok(responses);
    }

    @GetMapping("/{roomId}/messages")
    public ResponseEntity<?> getRoomMessages(
            @PathVariable String roomId,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {

        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not authenticated");
        }

        Room room = roomRepository.findByRoomId(roomId).orElse(null);
        if (room == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Room not found");
        }

        // Check if user is a member of the room
        User user = userRepository.findById(userPrincipal.getId()).orElse(null);
        if (user == null || !roomMemberRepository.existsByRoomAndUser(room, user)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Access denied to room messages");
        }

        // Return messages only if history is preserved
        if (Boolean.FALSE.equals(room.getPreserveHistory())) {
            return ResponseEntity.ok(new ArrayList<>()); // Ephemeral chat returns empty initial list
        }

        List<Message> messages = messageRepository.findByRoomOrderBySentAtAsc(room);
        List<MessagePayload> payloads = messages.stream().map(m -> new MessagePayload(
                m.getSender().getEmail(),
                m.getSender().getDisplayName(),
                m.getSender().getAvatarUrl(),
                m.getMessageType(),
                m.getContent(),
                m.getFileUrl(),
                m.getSentAt()
        )).collect(Collectors.toList());

        return ResponseEntity.ok(payloads);
    }

    @GetMapping("/{roomId}/members")
    public ResponseEntity<?> getRoomMembers(
            @PathVariable String roomId,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {

        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not authenticated");
        }

        Room room = roomRepository.findByRoomId(roomId).orElse(null);
        if (room == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Room not found");
        }

        List<RoomMember> members = roomMemberRepository.findByRoom(room);
        List<UserResponse> responses = members.stream()
                .map(m -> new UserResponse(
                        m.getUser().getId(),
                        m.getUser().getEmail(),
                        m.getUser().getDisplayName(),
                        m.getUser().getAvatarUrl()
                )).collect(Collectors.toList());

        return ResponseEntity.ok(responses);
    }

    @DeleteMapping("/{roomId}")
    public ResponseEntity<?> deleteRoom(
            @PathVariable String roomId,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {

        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not authenticated");
        }

        Room room = roomRepository.findByRoomId(roomId).orElse(null);
        if (room == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Room not found");
        }

        User user = userRepository.findById(userPrincipal.getId()).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("User not found");
        }

        // Validate user is owner of the room
        RoomMember membership = roomMemberRepository.findByRoomAndUser(room, user).orElse(null);
        if (membership == null || !"OWNER".equals(membership.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Only the owner can delete the room");
        }

        // Broadcast delete notification via websocket before removing records
        com.app.chat.message.dto.MessagePayload deletePayload = new com.app.chat.message.dto.MessagePayload(
                user.getEmail(),
                user.getDisplayName(),
                user.getAvatarUrl(),
                "DELETE",
                "Room has been deleted",
                null,
                java.time.LocalDateTime.now()
        );
        messagingTemplate.convertAndSend("/topic/room/" + roomId, deletePayload);

        // Delete all messages associated with the room
        List<Message> messages = messageRepository.findByRoomOrderBySentAtAsc(room);
        messageRepository.deleteAll(messages);

        // Delete all memberships
        List<RoomMember> memberships = roomMemberRepository.findByRoom(room);
        roomMemberRepository.deleteAll(memberships);

        // Delete room itself
        roomRepository.delete(room);

        return ResponseEntity.ok("Room deleted successfully");
    }

    @PostMapping("/leave/{roomId}")
    public ResponseEntity<?> leaveRoom(
            @PathVariable String roomId,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {

        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not authenticated");
        }

        Room room = roomRepository.findByRoomId(roomId).orElse(null);
        if (room == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Room not found");
        }

        User user = userRepository.findById(userPrincipal.getId()).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("User not found");
        }

        // Find membership
        RoomMember membership = roomMemberRepository.findByRoomAndUser(room, user).orElse(null);
        if (membership == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("User is not a member of this room");
        }

        // If user is owner, they cannot leave without deleting
        if ("OWNER".equals(membership.getRole())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Owner cannot leave the room. Please delete the room instead.");
        }

        // Remove membership
        roomMemberRepository.delete(membership);

        // If history is preserved, save the LEAVE log in database
        if (Boolean.TRUE.equals(room.getPreserveHistory())) {
            Message systemMessage = new Message(room, user, "LEAVE", "left the room", null);
            messageRepository.save(systemMessage);
        }

        // Broadcast exit notification
        com.app.chat.message.dto.MessagePayload leavePayload = new com.app.chat.message.dto.MessagePayload(
                user.getEmail(),
                user.getDisplayName(),
                user.getAvatarUrl(),
                "LEAVE",
                "left the room",
                null,
                java.time.LocalDateTime.now()
        );
        messagingTemplate.convertAndSend("/topic/room/" + roomId, leavePayload);

        return ResponseEntity.ok("Left the room successfully");
    }

    @PostMapping("/kick/{roomId}")
    public ResponseEntity<?> kickMember(
            @PathVariable String roomId,
            @RequestParam String email,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {

        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not authenticated");
        }

        Room room = roomRepository.findByRoomId(roomId).orElse(null);
        if (room == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Room not found");
        }

        User owner = userRepository.findById(userPrincipal.getId()).orElse(null);
        if (owner == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("User not found");
        }

        // Validate requester is owner
        RoomMember ownerMembership = roomMemberRepository.findByRoomAndUser(room, owner).orElse(null);
        if (ownerMembership == null || !"OWNER".equals(ownerMembership.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Only the owner can kick members");
        }

        // Find member to kick
        User targetUser = userRepository.findByEmail(email).orElse(null);
        if (targetUser == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("User to kick not found");
        }

        RoomMember targetMembership = roomMemberRepository.findByRoomAndUser(room, targetUser).orElse(null);
        if (targetMembership == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("User is not a member of this room");
        }

        // Cannot kick the owner
        if ("OWNER".equals(targetMembership.getRole())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Cannot kick the owner of the room");
        }

        // Delete membership
        roomMemberRepository.delete(targetMembership);

        // If history is preserved, save the KICK log in database
        if (Boolean.TRUE.equals(room.getPreserveHistory())) {
            Message systemMessage = new Message(room, targetUser, "KICK", "was kicked from the room", null);
            messageRepository.save(systemMessage);
        }

        // Broadcast kick notification via websocket
        com.app.chat.message.dto.MessagePayload kickPayload = new com.app.chat.message.dto.MessagePayload(
                targetUser.getEmail(),
                targetUser.getDisplayName(),
                targetUser.getAvatarUrl(),
                "KICK",
                "was kicked from the room",
                null,
                java.time.LocalDateTime.now()
        );
        messagingTemplate.convertAndSend("/topic/room/" + roomId, kickPayload);

        return ResponseEntity.ok("Member kicked successfully");
    }

    private String generateUniqueRoomId() {
        String id;
        do {
            String adj = ADJECTIVES[random.nextInt(ADJECTIVES.length)];
            String noun = NOUNS[random.nextInt(NOUNS.length)];
            int number = 100 + random.nextInt(900); // 3 digit number
            id = adj + "-" + noun + "-" + number;
        } while (roomRepository.existsByRoomId(id));
        return id;
    }

    private RoomResponse createRoomResponse(Room room) {
        // Find owner
        List<RoomMember> members = roomMemberRepository.findByRoom(room);
        String ownerName = members.stream()
                .filter(m -> "OWNER".equals(m.getRole()))
                .map(m -> m.getUser().getDisplayName())
                .findFirst()
                .orElse("Unknown");

        return new RoomResponse(
                room.getRoomId(),
                room.getName(),
                room.getPreserveHistory(),
                room.getRetentionPolicy(),
                room.getCreatedAt(),
                ownerName
        );
    }
}
