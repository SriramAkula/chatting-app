package com.app.chat.message.dto;

import java.time.LocalDateTime;

public class MessagePayload {
    private String senderEmail;
    private String senderName;
    private String senderAvatar;
    private String messageType; // TEXT, IMAGE, VIDEO, AUDIO
    private String content;
    private String fileUrl;
    private LocalDateTime sentAt;

    public MessagePayload() {}

    public MessagePayload(String senderEmail, String senderName, String senderAvatar, String messageType, String content, String fileUrl, LocalDateTime sentAt) {
        this.senderEmail = senderEmail;
        this.senderName = senderName;
        this.senderAvatar = senderAvatar;
        this.messageType = messageType;
        this.content = content;
        this.fileUrl = fileUrl;
        this.sentAt = sentAt;
    }

    public String getSenderEmail() { return senderEmail; }
    public void setSenderEmail(String senderEmail) { this.senderEmail = senderEmail; }

    public String getSenderName() { return senderName; }
    public void setSenderName(String senderName) { this.senderName = senderName; }

    public String getSenderAvatar() { return senderAvatar; }
    public void setSenderAvatar(String senderAvatar) { this.senderAvatar = senderAvatar; }

    public String getMessageType() { return messageType; }
    public void setMessageType(String messageType) { this.messageType = messageType; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public String getFileUrl() { return fileUrl; }
    public void setFileUrl(String fileUrl) { this.fileUrl = fileUrl; }

    public LocalDateTime getSentAt() { return sentAt; }
    public void setSentAt(LocalDateTime sentAt) { this.sentAt = sentAt; }
}
