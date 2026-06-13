package com.app.chat.message;

import com.app.chat.room.RetentionPolicy;
import com.app.chat.message.dto.MessagePayload;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Component
public class MessageRetentionScheduler {

    private static final Logger logger = LoggerFactory.getLogger(MessageRetentionScheduler.class);

    @Autowired
    private MessageRepository messageRepository;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @Value("${app.upload.dir}")
    private String uploadDir;

    // Run every 10 seconds for rapid testing/pruning
    @Scheduled(fixedRate = 10000)
    @Transactional
    public void cleanupExpiredMessages() {
        LocalDateTime now = LocalDateTime.now();

        // 1. ONE_MINUTE
        cleanupMessagesForPolicy(RetentionPolicy.ONE_MINUTE, now.minusMinutes(1));

        // 2. ONE_HOUR
        cleanupMessagesForPolicy(RetentionPolicy.ONE_HOUR, now.minusHours(1));

        // 3. ONE_DAY
        cleanupMessagesForPolicy(RetentionPolicy.ONE_DAY, now.minusDays(1));

        // 4. ONE_WEEK
        cleanupMessagesForPolicy(RetentionPolicy.ONE_WEEK, now.minusWeeks(1));
    }

    @Transactional
    public void cleanupMessagesForPolicy(RetentionPolicy policy, LocalDateTime cutoffTime) {
        try {
            List<Message> expiredMessages = messageRepository.findExpiredMessages(policy, cutoffTime);
            if (expiredMessages.isEmpty()) {
                return;
            }

            logger.info("Found {} expired messages with policy {}", expiredMessages.size(), policy);

            Set<String> affectedRoomIds = new HashSet<>();

            for (Message message : expiredMessages) {
                if (message.getRoom() != null) {
                    affectedRoomIds.add(message.getRoom().getRoomId());
                }
                if (StringUtils.hasText(message.getFileUrl())) {
                    deleteAssociatedFile(message.getFileUrl());
                }
            }

            messageRepository.deleteAll(expiredMessages);
            logger.info("Successfully pruned {} expired messages for policy {}", expiredMessages.size(), policy);

            // Broadcast real-time websocket prune updates to active subscribers of affected rooms
            for (String roomId : affectedRoomIds) {
                try {
                    MessagePayload prunePayload = new MessagePayload(
                            "system",
                            "System",
                            null,
                            "PRUNE",
                            cutoffTime.toString(),
                            null,
                            LocalDateTime.now()
                    );
                    messagingTemplate.convertAndSend("/topic/room/" + roomId, prunePayload);
                    logger.info("Broadcasted PRUNE real-time event to room: {} with cutoff: {}", roomId, cutoffTime);
                } catch (Exception wsEx) {
                    logger.error("Failed to broadcast PRUNE event to room: {}", roomId, wsEx);
                }
            }
        } catch (Exception e) {
            logger.error("Error running message retention policy cleanup for {}", policy, e);
        }
    }

    private void deleteAssociatedFile(String fileUrl) {
        try {
            // fileUrl format: http://localhost:8081/uploads/UUID.ext
            String fileIdentifier = "/uploads/";
            int index = fileUrl.indexOf(fileIdentifier);
            if (index != -1) {
                String fileName = fileUrl.substring(index + fileIdentifier.length());
                Path filePath = Paths.get(uploadDir).resolve(fileName).toAbsolutePath().normalize();

                if (Files.exists(filePath)) {
                    Files.delete(filePath);
                    logger.info("Deleted expired file attachment: {}", filePath);
                } else {
                    logger.warn("File attachment does not exist on disk: {}", filePath);
                }
            }
        } catch (IOException e) {
            logger.error("Failed to delete expired file for URL: {}", fileUrl, e);
        }
    }
}
