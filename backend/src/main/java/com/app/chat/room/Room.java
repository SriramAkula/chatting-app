package com.app.chat.room;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "rooms", uniqueConstraints = {
        @UniqueConstraint(columnNames = "roomId")
})
public class Room {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String roomId;

    private String name;

    @Column(nullable = false)
    private Boolean preserveHistory = true;

    @Column(nullable = true)
    @Enumerated(EnumType.STRING)
    private RetentionPolicy retentionPolicy = RetentionPolicy.FOREVER;

    @Column(nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public Room() {}

    public Room(String roomId, String name, Boolean preserveHistory) {
        this.roomId = roomId;
        this.name = name;
        this.preserveHistory = preserveHistory;
        this.retentionPolicy = RetentionPolicy.FOREVER;
        this.createdAt = LocalDateTime.now();
    }

    public Room(String roomId, String name, Boolean preserveHistory, RetentionPolicy retentionPolicy) {
        this.roomId = roomId;
        this.name = name;
        this.preserveHistory = preserveHistory;
        this.retentionPolicy = retentionPolicy != null ? retentionPolicy : RetentionPolicy.FOREVER;
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Boolean getPreserveHistory() { return preserveHistory; }
    public void setPreserveHistory(Boolean preserveHistory) { this.preserveHistory = preserveHistory; }

    public RetentionPolicy getRetentionPolicy() { return retentionPolicy != null ? retentionPolicy : RetentionPolicy.FOREVER; }
    public void setRetentionPolicy(RetentionPolicy retentionPolicy) { this.retentionPolicy = retentionPolicy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
