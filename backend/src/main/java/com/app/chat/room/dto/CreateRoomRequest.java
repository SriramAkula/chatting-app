package com.app.chat.room.dto;

import com.app.chat.room.RetentionPolicy;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class CreateRoomRequest {

    @NotBlank(message = "Room name is required")
    private String name;

    @NotNull(message = "History policy must be defined")
    private Boolean preserveHistory;

    private RetentionPolicy retentionPolicy;

    public CreateRoomRequest() {}

    public CreateRoomRequest(String name, Boolean preserveHistory) {
        this.name = name;
        this.preserveHistory = preserveHistory;
        this.retentionPolicy = RetentionPolicy.FOREVER;
    }

    public CreateRoomRequest(String name, Boolean preserveHistory, RetentionPolicy retentionPolicy) {
        this.name = name;
        this.preserveHistory = preserveHistory;
        this.retentionPolicy = retentionPolicy;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Boolean getPreserveHistory() { return preserveHistory; }
    public void setPreserveHistory(Boolean preserveHistory) { this.preserveHistory = preserveHistory; }

    public RetentionPolicy getRetentionPolicy() { return retentionPolicy; }
    public void setRetentionPolicy(RetentionPolicy retentionPolicy) { this.retentionPolicy = retentionPolicy; }
}
