package com.app.chat.room.dto;

import com.app.chat.room.RetentionPolicy;
import java.time.LocalDateTime;

public class RoomResponse {
    private String roomId;
    private String name;
    private Boolean preserveHistory;
    private RetentionPolicy retentionPolicy;
    private LocalDateTime createdAt;
    private String ownerName;

    public RoomResponse() {}

    public RoomResponse(String roomId, String name, Boolean preserveHistory, LocalDateTime createdAt, String ownerName) {
        this.roomId = roomId;
        this.name = name;
        this.preserveHistory = preserveHistory;
        this.retentionPolicy = RetentionPolicy.FOREVER;
        this.createdAt = createdAt;
        this.ownerName = ownerName;
    }

    public RoomResponse(String roomId, String name, Boolean preserveHistory, RetentionPolicy retentionPolicy, LocalDateTime createdAt, String ownerName) {
        this.roomId = roomId;
        this.name = name;
        this.preserveHistory = preserveHistory;
        this.retentionPolicy = retentionPolicy != null ? retentionPolicy : RetentionPolicy.FOREVER;
        this.createdAt = createdAt;
        this.ownerName = ownerName;
    }

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Boolean getPreserveHistory() { return preserveHistory; }
    public void setPreserveHistory(Boolean preserveHistory) { this.preserveHistory = preserveHistory; }

    public RetentionPolicy getRetentionPolicy() { return retentionPolicy; }
    public void setRetentionPolicy(RetentionPolicy retentionPolicy) { this.retentionPolicy = retentionPolicy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public String getOwnerName() { return ownerName; }
    public void setOwnerName(String ownerName) { this.ownerName = ownerName; }
}
