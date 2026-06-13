package com.app.chat.message.dto;

public class TypingPayload {
    private String roomId;
    private String email;
    private String displayName;
    private boolean isTyping;

    public TypingPayload() {}

    public TypingPayload(String roomId, String email, String displayName, boolean isTyping) {
        this.roomId = roomId;
        this.email = email;
        this.displayName = displayName;
        this.isTyping = isTyping;
    }

    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public boolean getIsTyping() { return isTyping; }
    public void setIsTyping(boolean isTyping) { this.isTyping = isTyping; }
}
