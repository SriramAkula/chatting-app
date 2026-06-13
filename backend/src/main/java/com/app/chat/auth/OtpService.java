package com.app.chat.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.concurrent.TimeUnit;

@Service
public class OtpService {

    private static final Logger logger = LoggerFactory.getLogger(OtpService.class);
    private static final String OTP_PREFIX = "otp:register:";
    private static final int OTP_EXPIRY_MINUTES = 5;

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired(required = false)
    private JavaMailSender mailSender;

    private final SecureRandom random = new SecureRandom();

    public String generateAndSaveOtp(String email) {
        // Generate a 6-digit OTP code
        String otp = String.format("%06d", random.nextInt(1000000));
        String key = OTP_PREFIX + email;

        // Cache in Redis for 5 minutes
        redisTemplate.opsForValue().set(key, otp, OTP_EXPIRY_MINUTES, TimeUnit.MINUTES);
        logger.info("[OTP Generated] Saved OTP for {} in Redis. Expiry: {} minutes.", email, OTP_EXPIRY_MINUTES);

        // Attempt to send email
        sendOtpEmail(email, otp);

        return otp;
    }

    public boolean verifyOtp(String email, String submittedOtp) {
        if (submittedOtp == null || submittedOtp.trim().isEmpty()) {
            return false;
        }

        String key = OTP_PREFIX + email;
        String cachedOtp = redisTemplate.opsForValue().get(key);

        if (cachedOtp == null) {
            logger.warn("[OTP Verification] No OTP found or expired for {}.", email);
            return false;
        }

        boolean isValid = cachedOtp.equals(submittedOtp.trim());
        if (isValid) {
            logger.info("[OTP Verification] Successfully verified OTP for {}.", email);
        } else {
            logger.warn("[OTP Verification] Incorrect OTP submitted for {}.", email);
        }

        return isValid;
    }

    public void deleteOtp(String email) {
        String key = OTP_PREFIX + email;
        redisTemplate.delete(key);
        logger.info("[OTP Cleanup] Removed OTP from Redis for {}.", email);
    }

    private void sendOtpEmail(String email, String otp) {
        String subject = "AetherChat - Confirm Registration";
        String body = String.format(
                "Hello,\n\n" +
                "Thank you for registering at AetherChat!\n" +
                "Your verification code is: %s\n\n" +
                "This OTP is valid for %d minutes. Please enter it on the registration page to complete your account registration.\n\n" +
                "If you did not request this, please ignore this email.\n\n" +
                "Best regards,\nThe AetherChat Team",
                otp, OTP_EXPIRY_MINUTES
        );

        if (mailSender == null) {
            logger.warn("[SMTP Offline] JavaMailSender is not initialized or configured. Displaying OTP in console fallback:");
            logger.info("========================================");
            logger.info("  REGISTRATION OTP FOR {}: {}", email, otp);
            logger.info("========================================");
            return;
        }

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(email);
            message.setSubject(subject);
            message.setText(body);
            mailSender.send(message);
            logger.info("[Email Sent] Verification email successfully sent to {}.", email);
        } catch (Exception e) {
            logger.error("[Email Failed] Failed to send email to {}. Exception: {}", email, e.getMessage());
            logger.info("================[ FALLBACK ]================");
            logger.info("  REGISTRATION OTP FOR {}: {}", email, otp);
            logger.info("============================================");
        }
    }
}
